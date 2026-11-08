// v6.12.0 regression tests: sync merge by ID, recurring fixes, dates, formatting,
// print, toasts, popups, undo, type change, Charts filter, offline build, wording.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_12_0.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
// 7:30 am in Brisbane: the hour when UTC is still "yesterday".
const FIXED = new Date("2026-11-08T07:30:00+10:00").getTime();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
  beforeParse(w) {
    const RD = w.Date;
    class MD extends RD { constructor(...a) { if (!a.length) super(FIXED); else super(...a); } static now() { return FIXED; } }
    MD.UTC = RD.UTC; MD.parse = RD.parse; w.Date = MD;
    w.fetch = () => Promise.reject(new Error("offline (test)"));
    w.confirm = w.alert = w.prompt = () => { throw new Error("native dialog used"); };
  },
});
const w = dom.window;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const E = s => w.eval(s);
const base = () => E(`triggerCloudSync = () => {}; tombstones = new Set(); yearMode = "calendar";
  accounts = [{ id: "ing", name: "ING", color: "#e8834a", currency: "AUD" }, { id: "ub", name: "UBank", color: "#6aa2d8", currency: "AUD" }];`);

setTimeout(async () => {
  // ── offline build ───────────────────────────────────────────────────────
  const head = html.slice(0, html.indexOf("</head>"));
  ok(!/fonts\.googleapis/.test(html), "no Google Fonts requests anywhere");
  ok(!/<script src=[^>]*xlsx/.test(head), "no blocking spreadsheet script in <head>");
  ok(/@font-face\{font-family:'DM Sans'/.test(head) && /DM Serif Display/.test(head), "fonts embedded");
  ok(E(`typeof XLSX.utils.book_new === "function" && typeof XLSX.writeFile === "function"`), "slim SheetJS embedded and usable");
  ok(E(`typeof loadFullXLSX`) === "function", "full SheetJS loads on demand for import");
  ok(E(`vaultFontCSS().includes("@font-face")`), "print windows reuse the embedded fonts");
  ok(!/\b(alert|confirm|prompt)\(/.test(html.replace(/vault(Confirm|Prompt)\(/g, "").replace(/\/\/[^\n]*/g, "")), "no native alert/confirm/prompt calls");

  // ── search: no invented digits ──────────────────────────────────────────
  base();
  E(`data = { "2026": { saved: [["2026-01-01", 160, "s1", 1, null, null, "ing"]], removed: [["2026-03-13", 659.96, "s2", 2, null, null, "ing"]] } }; _dataVersion++;`);
  const hits = E(`(vhSearchMatches("60") || []).map(t => t.amt)`);
  ok(hits.includes(160) && !hits.includes(659.96), "'60' finds 160, not 659.96 " + JSON.stringify(hits));

  // ── merge by ID across buckets ──────────────────────────────────────────
  base();
  E(`data = { "2026": { saved: [["2026-08-01", 20, "same1", 5, null, null, "ing"]], removed: [] } };
     autoMerge({ "26-27": { saved: [["2026-08-01", 20, "same1", 5, null, null, "ing"]], removed: [] } }, []);`);
  ok(E(`vhAllTx().filter(t => t.id === "same1").length`) === 1, "other device on financial years: one copy, not two");
  E(`data = { "2025": { saved: [["2025-12-30", 75, "mv", 1000, null, null, "ing"]], removed: [] } }; window.__old = JSON.parse(JSON.stringify(data));
     data = { "2026": { saved: [["2026-01-02", 75, "mv", 2000, null, null, "ing"]], removed: [] } }; autoMerge(window.__old, []);`);
  ok(JSON.stringify(E(`vhAllTx().filter(t => t.id === "mv").map(t => t.date)`)) === '["2026-01-02"]', "date edited across a year: newest copy only");
  E(`data = { "2026": { saved: [["2026-05-05", 40, "fl", 1000, null, null, "ing"]], removed: [] } }; window.__old2 = JSON.parse(JSON.stringify(data));
     data = { "2026": { saved: [], removed: [["2026-05-05", 40, "fl", 2000, null, null, "ing"]] } }; autoMerge(window.__old2, []);`);
  ok(JSON.stringify(E(`vhAllTx().filter(t => t.id === "fl").map(t => t.kind)`)) === '["wit"]', "type changed elsewhere: newest copy only");
  E(`data = { "2026": { saved: [["2026-05-06", 9, "gone", 1, null, null, "ing"]], removed: [] } }; autoMerge({}, ["gone"]);`);
  ok(E(`vhAllTx().length`) === 0, "tombstones still delete");

  // ── recurring ───────────────────────────────────────────────────────────
  base();
  ok(JSON.stringify(E(`[0,1,2,3].map(n => recurOccurrence("2026-01-31", "monthly", n))`)) === '["2026-01-31","2026-02-28","2026-03-31","2026-04-30"]', "monthly from the 31st returns to month-end");
  ok(E(`recurOccurrence("2024-02-29", "yearly", 4)`) === "2028-02-29" && E(`recurOccurrence("2024-02-29", "yearly", 1)`) === "2025-02-28", "yearly from 29 Feb");
  E(`data = {}; recurRules = [{ id: 555, type: "deposit", amount: 100, freq: "monthly", startDate: "2026-10-08", endDate: null, account: "ing" }];
     processRecurring(); window.__A = JSON.parse(JSON.stringify(data)); data = {}; processRecurring(); autoMerge(window.__A, []);`);
  ok(E(`vhAllTx().filter(t => String(t.recur) === "555").length`) === 2, "two devices posting the same occurrences: no duplicates");
  E(`data = { "2026": { saved: [["2026-10-08",100,"tx_a",1,null,"555","ing"],["2026-10-08",100,"tx_b",2,null,"555","ing"],["2026-11-08",100,"tx_c",3,null,"555","ing"]], removed: [] } }; processRecurring();`);
  ok(E(`vhAllTx().filter(t => String(t.recur) === "555").length`) === 2 && E(`tombstones.has("tx_b")`), "existing duplicates cleaned up and tombstoned");
  E(`tombstones = new Set(); data = { "2026": { saved: ["01-31","03-03","04-03","05-03","06-03","07-03","08-03","09-03","10-03","11-03"].map((d, i) => ["2026-" + d, 50, "d" + i, i, null, "9", "ing"]), removed: [] } };
     recurRules = [{ id: 9, type: "deposit", amount: 50, freq: "monthly", startDate: "2026-01-31", endDate: null, account: "ing" }]; processRecurring();`);
  ok(E(`vhAllTx().filter(t => String(t.recur) === "9").length`) === 10, "rules that drifted under the old maths aren't back-filled");
  ok(E(`recurRules[0].nextDate`) === "2026-12-31", "drifted rule's next date skips the month already covered");
  E(`data = {}; tombstones = new Set(["rc_77_2026-11-01"]); recurRules = [{ id: 77, type: "deposit", amount: 5, freq: "monthly", startDate: "2026-11-01", endDate: null, account: "ing" }]; processRecurring();`);
  ok(E(`vhAllTx().length`) === 0, "an occurrence deleted on another device isn't re-posted");
  E(`tombstones = new Set(); data = {}; recurRules = [{ id: 7, type: "deposit", amount: 10, freq: "weekly", startDate: "2026-10-01", endDate: "2026-11-07", account: "ing" }]; processRecurring();`);
  ok(E(`recurRules[0].completed === true`), "rule ending yesterday completes before 10 am too");

  // ── dates ───────────────────────────────────────────────────────────────
  E(`openAddSheet()`);
  ok(E(`document.getElementById("mob-inp-date").value`) === "2026-11-08", "phone Add form defaults to today at 7:30 am, not yesterday");
  E(`closeSheets(); openDesktopAddSheet()`);
  ok(E(`document.getElementById("desk-inp-date").value`) === "2026-11-08", "desktop Add form defaults to today");
  E(`closeDesktopAddSheet()`);
  ok(E(`fmtDate("2025-01-03")`) === "3 Jan 2025", "dates have no leading zero");

  // ── money formatting ────────────────────────────────────────────────────
  ok(E(`aud(-0.001)`) === E(`aud(0)`), "a tiny negative prints as $0.00, not -$0.00");
  ok(!/\.\d\d/.test(E(`fmtCurrency(1234, "KRW")`)), "KRW shows no decimals: " + E(`fmtCurrency(1234, "KRW")`));
  ok(/\.\d\d/.test(E(`fmtCurrency(12.5, "USD")`)), "USD keeps cents");

  // ── years added by hand ────────────────────────────────────────────────
  E(`data = { "2026": { saved: [["2026-05-01",5,"k1",1,null,null,"ing"]], removed: [] }, "2027": { saved: [], removed: [] } }; keepYear("2027"); pruneEmptyYears();`);
  ok(E(`"2027" in data`), "+ New year survives the next prune");

  // ── Home layout cold start ──────────────────────────────────────────────
  E(`data = {}; autoLayout = { order: [], computedAt: 0 }; vhComputeAutoOrder();`);
  ok(E(`autoLayout.computedAt`) === 0, "cold-start layout isn't stamped as new");

  // ── sample vault: lists, print, charts ──────────────────────────────────
  E(SEED);
  E(`homeLayout = { order: VH_SECTIONS.map(s => s.key), hidden: [], auto: false, ts: 1, v: 1 }; switchTab("all"); render();`);
  const witCell = E(`[...document.querySelectorAll("#tx-body tr")].find(r => r.dataset.type === "removed").querySelector(".num").textContent`);
  ok(/^−/.test(witCell.trim()), "list withdrawals carry a minus: " + witCell);
  E(`window.__pdf = null; openPdfWindow = o => { window.__pdf = o; }; activeAccountFilter = "all"; printCurrentView();`);
  ok(E(`window.__pdf.oneAccount`) === false, "unfiltered list print keeps the Account column");
  E(`activeAccountFilter = "ing"; printCurrentView();`);
  ok(E(`window.__pdf.oneAccount`) === true, "list filtered to one account drops it");
  E(`activeAccountFilter = "all"; switchTab("report"); asSetQuery("ubank"); asRender(); printSearchResults();`);
  ok(E(`window.__pdf.oneAccount`) === true, "Search narrowed to one account by name drops it");
  E(`asSetQuery(""); asRender(); printSearchResults();`);
  ok(E(`window.__pdf.oneAccount`) === false, "Search across accounts keeps it");
  E(`switchTab("charts"); renderCharts();`);
  ok(E(`document.querySelectorAll("#charts-acct-row .vh-filter-pill").length`) === 3, "Charts tab has the account pills");
  ok(/Blue = interest/.test(E(`document.getElementById("chart-dvw-sub").textContent`)), "Charts show interest apart from deposits");
  const axis = E(`[...document.querySelectorAll("#chart-net-monthly .chart-axis-label")].map(t => t.textContent).join("|")`);
  ok(/\$/.test(axis) && !/\.\d\d/.test(axis), "Charts axes are rounded and in dollars: " + axis);
  E(`document.querySelector('#charts-acct-row [data-charts-acct="ub"]').click()`);
  ok(E(`chartsAcct`) === "ub", "Charts account pill filters");
  E(`chartsAcct = "all"`);

  // ── Home ────────────────────────────────────────────────────────────────
  E(`switchTab("home"); renderHome();`);
  ok(E(`document.querySelectorAll("#vh-recent-list .vh-recent-row").length`) > 0, "Recent Activity rendered");
  E(`accounts.push({ id: "usd", name: "Holiday Fund", color: "#40a070", currency: "USD" }); exchangeRates = {}; renderHome();`);
  ok(/No exchange rate for USD/.test(E(`document.getElementById("vh-hero").textContent`)), "missing rate is called out on Home");
  E(`accounts.pop(); renderHome();`);
  ok(/Rates/.test(html) && E(`typeof vhNotesFold`) === "function", "collapsible notes helper present");

  // ── edit popup: type change keeps the ID ────────────────────────────────
  base();
  E(`data = { "2026": { saved: [["2026-06-01", 30, "chg", 1, null, null, "ing"]], removed: [] } }; _dataVersion++; openPopupById("chg"); popupSetType("withdraw"); savePopup();`);
  ok(E(`data["2026"].removed.some(r => r[2] === "chg") && !data["2026"].saved.some(r => r[2] === "chg")`), "deposit changed to withdrawal, same ID");

  // ── undo delete ─────────────────────────────────────────────────────────
  E(`openPopupById("chg"); deletePopup();`);
  ok(E(`vhAllTx().length`) === 0 && /Transaction deleted/.test(E(`document.getElementById("toast").textContent`)), "delete shows an Undo toast");
  E(`document.querySelector("#toast .toast-undo").click()`);
  ok(E(`vhAllTx().length`) === 1 && E(`vhAllTx()[0].id`) !== "chg", "Undo restores it under a fresh ID (the old one is tombstoned)");

  // ── toasts ──────────────────────────────────────────────────────────────
  E(`toastWithUndo("Imported 3", () => { window.__undone = 1; }); toast("Recurring deposit scheduled");`);
  ok(!!E(`document.querySelector("#toast .toast-undo")`), "a plain toast doesn't wipe the Undo");
  E(`_toastHide();`);
  ok(/Recurring deposit scheduled/.test(E(`document.getElementById("toast").textContent`)), "…and shows next");
  E(`toast("x", "#c0392b")`); ok(E(`document.getElementById("toast").dataset.kind`) === "error", "legacy red maps to error");
  E(`toast("x", "var(--gold-dim)")`); ok(E(`document.getElementById("toast").dataset.kind`) === "notice", "legacy gold maps to notice");
  ok(/white-space:\s*normal/.test(html.slice(html.indexOf("#toast {"), html.indexOf("#toast {") + 600)), "toasts wrap");
  ok(E(`recurScheduledMsg("withdraw", 0)`) === "Recurring withdrawal scheduled", "no 'withdraw scheduled'");

  // ── popups: outside tap, Escape, dialogs ────────────────────────────────
  E(`document.getElementById("compat-info-popup").classList.remove("hidden"); document.getElementById("compat-info-popup").click();`);
  ok(E(`document.getElementById("compat-info-popup").classList.contains("hidden")`), "info popup closes on outside tap");
  E(`openAddRecurringPopup(); document.getElementById("add-recurring-popup").dataset.dirty = "1"; document.getElementById("add-recurring-popup").click();`);
  ok(!E(`document.getElementById("add-recurring-popup").classList.contains("hidden")`), "a form with typing stays open on outside tap");
  E(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));`);
  ok(E(`document.getElementById("add-recurring-popup").classList.contains("hidden")`), "Escape closes it");
  const pc = E(`vaultConfirm({ title: "T", message: "M", ok: "Go" })`);
  E(`document.getElementById("vd-c-ok").click()`);
  ok((await pc) === true, "vaultConfirm resolves true");
  const pp = E(`vaultPrompt({ title: "New account" })`);
  E(`document.getElementById("vd-p-input").value = "Savings"; document.getElementById("vd-p-ok").click()`);
  ok((await pp) === "Savings", "vaultPrompt returns the text");
  ok(E(`[...document.querySelectorAll("#tx-popup .modal-close")].length`) === 1, "Edit transaction has a ✕");

  // ── wording ─────────────────────────────────────────────────────────────
  ok(html.includes("vault-data.json</code>") && !html.includes("vault-savings-backup.json"), "privacy names the real Drive file");
  ok(html.includes("mailto:privacy@vaultsavings.app") && !html.includes("cdn-cgi"), "privacy email is a real link");
  ok(/Cloudflare Workers/.test(html) && /frankfurter\.dev/.test(html), "privacy discloses the relay and rate sources");
  ok(!/monthly or custom/.test(html) && /monthly, quarterly or yearly/.test(html), "About lists the real frequencies");
  ok(!/Open source &amp; independent/.test(html), "no 'open source' claim");
  ok(!/Sync to Google Drive, OneDrive, or Dropbox/.test(html), "OneDrive/Dropbox not presented as available");
  ok(E(`document.getElementById("version-footer").textContent`) === "v6.12.0", "version v6.12.0");

  console.log(`${pass} passed, ${fail} failed; page errors: ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log("  err:", e.slice(0, 200)));
  process.exit(fail ? 1 : 0);
}, 1500);
