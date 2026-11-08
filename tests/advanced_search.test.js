// Advanced Search + the shared search rules (Home quick-find uses the same ones),
// print/export parity, the transaction list's Total row, and the Home hand-off (v6.11.0).
// Run from the repo root: npm install jsdom && node tests/advanced_search.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc });
const w = dom.window;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const E = s => w.eval(s);

setTimeout(() => {
  E(SEED);
  E(`window.__pdf = null; openPdfWindow = o => { window.__pdf = o; };
     window.__xlsx = null; window.XLSX = { utils: { book_new: () => ({ s: [] }), aoa_to_sheet: a => ({ a }), book_append_sheet: (wb, ws, n) => wb.s.push([n, ws.a]) },
       writeFile: (wb, f) => { window.__xlsx = { wb, f }; } };`);
  E(`switchTab("report")`);
  const total = E("vhAllTx().length");
  ok(total === 86, "sample vault " + total);
  const cnt = (q, f = "asF") => E(`asResults(${f}, ${JSON.stringify(q)}).length`);
  const all = js => E(`asResults(asF, asQ).every(t => ${js})`);
  const reset = () => E(`asF = asBlank(); asSetQuery(""); asPage = 1; sortKey = "date"; sortDir = "asc"; asRender();`);
  reset();

  // ── page basics ──
  ok(E(`document.querySelector(".as-title").textContent`) === "Advanced Search", "page title");
  ok(/Advanced Search/.test(E(`document.querySelector(".dmenu-btn-label") && [...document.querySelectorAll(".dmenu-btn-label")].map(e=>e.textContent).join("|")`)), "desktop menu label");
  ok([...w.document.querySelectorAll(".menu-item-label")].some(e => e.textContent === "Advanced Search"), "mobile menu label");
  ok(E(`document.querySelectorAll("#as-body tr").length`) === total, "everything shows with no search");
  ok(!w.document.getElementById("report-from") && !w.document.getElementById("report-table"), "old Search controls are gone");

  // ── shared search rules ──
  const ub = E(`vhAllTx().filter(t => t.accId === "ub").length`), ing = total - ub;
  ok(cnt("ubank") === ub && cnt("UBank") === ub && cnt("ub") === ub, "account word, case, prefix");
  ok(cnt("ing ubank") === total, "same kind = either (two accounts)");
  ok(E(`(vhSearchMatches("ing ubank") || []).length`) === total, "Home: 'ing ubank' now finds both accounts (was nothing)");
  ok(cnt("ubank interest") === E(`vhAllTx().filter(t => t.accId === "ub" && t.kind === "int").length`), "different kinds AND");
  ok(cnt("interest withdrawal") === E(`vhAllTx().filter(t => t.kind !== "dep").length`), "two types = either");
  ok(cnt("jun") === E(`vhAllTx().filter(t => t.date.slice(5,7) === "06").length`) && cnt("june") === cnt("jun"), "month word");
  ok(cnt("marble") === 0, "'marble' isn't March");
  ok(cnt("recurring") === E(`vhAllTx().filter(vhIsRecurring).length`) && cnt("one-off") === total - cnt("recurring"), "recurring / one-off");
  ok(cnt("=250") === E(`vhAllTx().filter(t => t.amt === 250).length`), "=exact");
  ok(E(`asResults(asF, "50").some(t => t.amt === 250) && asResults(asF, "50").some(t => t.amt === 500)`), "plain number contains (like Home)");
  ok(cnt("$1,200") === 1, "$ and commas");
  ok(cnt("=250 =100") === 0, "two exact amounts AND");
  ok(cnt("zzz") === 0 && cnt("ubank zzz") === 0, "unknown word -> nothing");
  ok(cnt("=") === 0, "lone = is unknown, no crash");
  ok(cnt("2026-10") === E(`vhAllTx().filter(t => t.date.startsWith("2026-10")).length`), "ISO month");
  E(`vhAllTx; data[Object.keys(data)[0]].saved.push(["2026-02-02", 1000, "x1000", 1, null, null, "ing"]); _dataVersion++;`);
  ok(E(`asResults(asF, "100.00").every(t => t.amt !== 1000)`), "'100.00' doesn't match $1,000.00");
  E(`for (const k in data) data[k].saved = data[k].saved.filter(r => r[2] !== "x1000"); _dataVersion++;`);
  E(`accounts[0].name = "ING Savings"; accounts.push({ id: "ie", name: "ING Everyday", color: "#999", currency: "AUD" });`);
  ok(cnt("ing savings") === ing, "multi-word account name recognised whole");
  ok(cnt("savings") === ing, "second word of an account name");
  E(`accounts.pop(); accounts[0].name = "ING";`);

  // ── Home ranking unchanged ──
  const h = E(`vhSearchMatches("50").slice(0, 3).map(t => t.amt)`);
  ok(h[0] === 50 && h[1] === 50, "Home: exact $50 first " + JSON.stringify(h));

  // ── closest first + Typed amounts toggle ──
  E(`asSetQuery("50"); asRender();`);
  const tiers = E(`_asRows.map(t => Math.abs(t.amt - 50) < .005 ? 3 : (t.amt.toFixed(2).startsWith("50") || String(Math.round(t.amt)).startsWith("50")) ? 2 : 1)`);
  ok(JSON.stringify(tiers) === JSON.stringify([...tiers].sort((a, b) => b - a)) && tiers[0] === 3 && tiers.includes(1), "closest matches first");
  ok(/Closest matches first, then by date/.test(E(`document.getElementById("as-rank-note").textContent`)), "ranking note");
  const g3 = E(`_asRows.filter(t => Math.abs(t.amt - 50) < .005).map(t => t.date)`);
  ok(JSON.stringify(g3) === JSON.stringify([...g3].sort()), "remembered sort inside a group (date ↑)");
  E(`asF.exactAmts = true; asRender();`);
  ok(all("t.amt === 50") && E(`document.getElementById("as-rank-note").style.display`) === "none", "Exact only: '50' = $50.00, no ranking");
  ok([...w.document.querySelectorAll("#as-chips .as-chip")].some(c => c.textContent.startsWith("Exact amounts")), "Exact amounts chip");
  reset();

  // ── filters ──
  const withF = js => { reset(); E(`${js}; asRender();`); };
  withF(`asF.date = "month"`);
  ok(all(`t.date.slice(0,7) === todayLocal().slice(0,7)`), "This month = whole calendar month");
  withF(`asF.date = "lastmonth"`);
  ok(cnt("") > 0 && all(`t.date < todayLocal().slice(0,7) + "-01"`), "Last month");
  withF(`asF.date = "30"`);
  ok(all(`t.date <= todayLocal()`) && cnt("") > 0, "Last 30 days");
  withF(`yearMode = "financial"; asF.date = "year"`);
  const fyw = E(`asDateWindow(asF)`);
  ok(/-07-01$/.test(fyw[0]) && /-06-30$/.test(fyw[1]) && E(`asDateOpts().find(o => o[0] === "year")[1]`) === "This FY", "This FY covers the whole FY " + fyw);
  withF(`yearMode = "calendar"; asF.date = "lastyear"`);
  ok(/-01-01$/.test(E(`asDateWindow(asF)[0]`)) && /-12-31$/.test(E(`asDateWindow(asF)[1]`)) && E(`asDateOpts().find(o => o[0] === "lastyear")[1]`) === "Last year", "Last year (calendar mode)");
  withF(`asF.date = "custom"; asF.from = "2026-10-31"; asF.to = "2026-10-01"`);
  ok(cnt("") === E(`vhAllTx().filter(t => t.date.startsWith("2026-10")).length`), "reversed custom dates swapped");
  withF(`asF.types = ["int", "wit"]`); ok(all(`t.kind !== "dep"`), "multi-type");
  withF(`asF.accs = ["ing"]`); ok(all(`t.accId === "ing"`) && cnt("") === ing, "account filter");
  withF(`asF.amin = "500"; asF.amax = "100"`); ok(cnt("") > 0 && all(`t.amt >= 100 && t.amt <= 500`), "reversed min/max swapped");
  withF(`asF.amin = "-50"`); ok(all(`t.amt >= 50`), "negative min treated as positive");
  withF(`asF.amtMode = "exact"; asF.aexact = "250"`); ok(cnt("") === 12 && all(`t.amt === 250`), "exact amount filter");
  withF(`asF.rec = "rec"; asF.rule = "222"`); ok(cnt("") === 12 && all(`String(t.recur) === "222"`), "specific recurring rule");
  withF(`asF.rec = "one"`); ok(all(`!vhIsRecurring(t)`), "one-off only");
  withF(`asF.types = ["int"]; asF.accs = ["ub"]`);
  ok(E(`document.getElementById("as-badge").textContent`) === "2" && E(`document.getElementById("as-fbtn").classList.contains("on")`), "badge");
  w.document.querySelector("#as-chips .as-chip button").click();
  ok(E(`asF.types.length`) === 0 && E(`asF.accs.length`) === 1, "chip × removes one filter");
  E(`asSetQuery("jun"); asRender();`); w.document.getElementById("as-clearall").click();
  ok(E(`asF.accs.length`) === 0 && E(`asQ`) === "" && E(`document.getElementById("as-q").value`) === "", "Clear all");

  // ── summary + total + table ──
  withF(`asF.accs = ["ing"]`);
  const net = E(`asResults().reduce((s, t) => s + (t.kind === "wit" ? -1 : 1) * convertToGlobal(t.amt, t.cur), 0)`);
  ok(E(`document.getElementById("as-net").textContent`) === E(`aud(${net})`) && E(`document.getElementById("as-foot-total").textContent`) === E(`aud(${net})`), "Net card and Total row = net");
  ok(E(`document.querySelectorAll("#as-body tr").length`) === ing, "one row per result");
  const r0 = w.document.querySelector("#as-body tr");
  ok(r0.dataset.date && r0.dataset.type && r0.dataset.year && r0.dataset.txId, "rows carry what the edit popup needs");
  ok(r0.querySelector("td.tx-account-cell .tx-acc-dot-cell") && r0.querySelector("td.tx-type-cell .type-pill") && r0.querySelector("td.num"), "same cells as the transaction list");

  // ── sort shared with the list ──
  reset();
  w.document.getElementById("as-sort-amount").click();
  ok(E(`sortKey`) === "amount" && E(`sortDir`) === "desc", "header tap sets the remembered sort");
  const amts = E(`_asRows.map(t => t.amt)`); ok(JSON.stringify(amts) === JSON.stringify([...amts].sort((a, b) => b - a)), "amount ↓ order");
  ok(/↓/.test(E(`document.getElementById("as-sort-amount").textContent`)), "arrow on active column");
  ok(JSON.parse(w.localStorage.getItem("vault_sort_v1")).key === "amount", "sort remembered");

  // ── empty state ──
  withF(`asF.types = ["int"]; asSetQuery("withdrawal")`);
  const sugg = [...w.document.querySelectorAll(".as-sugg button")].map(b => b.textContent);
  ok(sugg.length === 2 && sugg[0].startsWith("Remove Withdrawals"), "suggestions " + JSON.stringify(sugg));
  w.document.querySelector(".as-sugg button").click(); ok(E(`asQ`) === "" && cnt("") > 0, "suggestion applies");

  // ── escaping ──
  reset(); E(`asSetQuery('<img src=x onerror="window.__pwn=1"> <b>x</b>'); asRender();`);
  ok(!w.document.querySelector("#as-chips img, #as-chips b, #as-empty img") && !E("window.__pwn"), "typed text is escaped");
  E(`asRecent = ["<u>hi</u>"]; const i = document.getElementById("as-q"); asSetQuery(""); i.focus(); asDrawRecent();`);
  ok(!w.document.querySelector("#as-recent u"), "recent searches escaped");

  // ── recent searches ──
  reset(); E(`asRecent = []; asSaveRecent();`);
  E(`document.getElementById("as-q").value = "ubank"; asRemember();`);
  ok(JSON.parse(w.localStorage.getItem("vault_search_recent_v1"))[0] === "ubank", "saved to this device");
  E(`document.getElementById("as-q").value = "zzz"; asRemember();`); ok(!E(`asRecent.includes("zzz")`), "no-result searches not saved");
  E(`["a","b","c","d","e","UBANK"].forEach(q => { document.getElementById("as-q").value = q === "UBANK" ? q : "ubank " + q; });`);
  E(`asRecent = ["ubank", "x1", "x2", "x3", "x4"]; document.getElementById("as-q").value = "UBank"; asRemember();`);
  ok(E(`asRecent.length`) === 5 && E(`asRecent[0]`) === "UBank" && E(`asRecent.filter(r => r.toLowerCase() === "ubank").length`) === 1, "max five, newest first, case-insensitive de-dupe");
  w.localStorage.setItem("vault_search_recent_v1", "{broken"); E(`asLoadRecent()`); ok(E(`asRecent.length`) === 0, "corrupt stored recents ignored");
  w.localStorage.setItem("vault_search_recent_v1", JSON.stringify(["ok", 5, null, ""])); E(`asLoadRecent()`); ok(JSON.stringify(E(`asRecent`)) === '["ok"]', "junk entries dropped");

  // ── entering the page ──
  E(`asF.types = ["wit"]; asSetQuery("ing"); switchTab("all"); switchTab("report");`);
  ok(E(`asF.types.length`) === 0 && E(`asQ`) === "", "fresh each visit");
  E(`asF.types = ["wit"]; render();`); ok(E(`asF.types[0]`) === "wit", "re-render on the page keeps filters");
  E(`switchTab("home"); vhSearchHandoff("ubank jun");`);
  ok(E(`activeTab`) === "report" && E(`asQ`) === "ubank jun" && E(`document.getElementById("as-q").value`) === "ubank jun" && E(`asF.types.length`) === 0, "Home hands the query over as typed");

  // ── print + export use exactly what's shown ──
  reset(); E(`asF.accs = ["ub"]; asF.types = ["int"]; sortKey = "amount"; sortDir = "desc"; asRender(); printSearchResults();`);
  const pdf = E(`window.__pdf`);
  ok(pdf.title === "Advanced Search" && pdf.rows.length === E(`_asRows.length`), "print: same rows");
  ok(JSON.stringify(pdf.rows.map(r => r.amt)) === JSON.stringify(E(`_asRows.map(t => t.amt)`)), "print: same order");
  ok(/UBank/.test(pdf.subLine) && /Interest/.test(pdf.subLine) && /amount, largest first/.test(pdf.subLine), "print subtitle names filters + sort: " + pdf.subLine);
  ok(pdf.filter === "saved", "print shows deposit cards for interest-only");
  E(`menuPrint();`); ok(E(`window.__pdf.title`) === "Advanced Search", "menu Print / Ctrl+P on this page prints Advanced Search");
  E(`menuExportXLSX();`);
  const x = E(`window.__xlsx`);
  ok(/^vault-search-\d{4}-\d{2}-\d{2}\.xlsx$/.test(x.f), "export filename " + x.f);
  const txSheet = x.wb.s.find(s => s[0] === "Transactions")[1];
  ok(txSheet.length - 1 - 4 === E(`_asRows.length`), "export: same number of rows");
  ok(/UBank/.test(x.wb.s.find(s => s[0] === "Summary")[1].find(r => r[0] === "Covers")[1]), "export summary says what it covers");
  ok(E(`document.getElementById("dmenu-export-sub")?.textContent || "Advanced Search results as XLSX"`) === "Advanced Search results as XLSX", "menu sub-label on this page");
  E(`switchTab("all"); menuExportXLSX();`);
  ok(/^vault-all-transactions-/.test(E(`window.__xlsx.f`)) && E(`window.__xlsx.wb.s.find(s => s[0] === "Transactions")[1].length`) - 5 === total, "export elsewhere = all transactions");

  // ── transaction list Total row (All tab) is the net ──
  E(`switchTab("all"); activeYear = "all-years"; activeMonth = null; activeAccountFilter = "all"; _dataVersion++; render();`);
  const listNet = E(`vhAllTx().reduce((s, t) => s + (t.kind === "wit" ? -1 : 1) * convertToGlobal(t.amt, t.cur), 0)`);
  ok(E(`document.getElementById("foot-total").textContent`) === E(`aud(${listNet})`), "list All-tab Total = net (was gross)");
  E(`activeTab = "removed"; _dataVersion++; render();`);
  ok(E(`document.getElementById("foot-total").textContent`) === E(`aud(${E(`vhAllTx().filter(t => t.kind === "wit").reduce((s, t) => s + t.amt, 0)`)})`), "Withdrawn tab total unchanged");

  // ── the list's account pills don't show on Advanced Search ──
  E(`switchTab("all"); switchTab("report"); renderAccountPills();`);
  ok(w.document.getElementById("account-pills-wrap").style.display === "none", "list account pills hidden on Advanced Search (even after a re-render)");
  E(`switchTab("all");`); ok(w.document.getElementById("account-pills-wrap").style.display === "", "and back on the list");

  // ── empty vault ──
  E(`data = {}; _dataVersion++; switchTab("report");`);
  ok(E(`document.getElementById("as-empty").textContent`) === "No transactions yet.", "empty vault message");

  console.log(`${pass} passed, ${fail} failed; page errors: ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log("  err:", e.slice(0, 200)));
  process.exit(fail ? 1 : 0);
}, 1500);
