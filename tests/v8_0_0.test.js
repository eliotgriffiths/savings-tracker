// v8.0.0: one Transactions screen (Search merged into the list). queue-v8.0.0.md #1–#7,
// plan-v8.0.0.md Steps 1–10. Run from the repo root:
//   npm install jsdom && TZ=Australia/Brisbane node tests/v8_0_0.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
const FIXED = new Date("2026-11-20T09:00:00+10:00").getTime();
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
    w.scrollTo = () => {};
  },
});
const w = dom.window, d = w.document;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const E = s => w.eval(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = id => d.getElementById(id);
const chips = () => [...d.querySelectorAll("#as-chips .as-chip")].map(c => c.querySelector(".as-chip-l").textContent + (c.querySelector(".as-fix") ? " " + c.querySelector(".as-fix").textContent : ""));
const reset = () => E(`asF = asBlank(); asSetQuery(""); asPage = 1; sortKey = "date"; sortDir = "asc"; document.activeElement && document.activeElement.blur && document.activeElement.blur(); asRender();`);
const cnt = (q, f = "asF") => E(`asResults(${f}, ${JSON.stringify(q)}).length`);
const n = js => E(`vhAllTx().filter(t => ${js}).length`);
const shown = () => E(`_asRows.length`);
const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const pick = (id, v) => { const s = $(id); s.value = v; fire(s, "change"); };

setTimeout(async () => {
  E(SEED);
  E(`_dataVersion++; _invalidateYearCache(); document.getElementById("welcome-modal")?.classList.add("hidden");
     window.__toasts = []; toast = (m, k) => { window.__toasts.push([m, k]); };
     window.__pdf = null; openPdfWindow = o => { window.__pdf = o; };`);
  E(`switchTab("all")`);
  const total = E("vhAllTx().length");
  ok(total === 86, "sample vault " + total);

  // ══ #1 The screen ══════════════════════════════════════════════════════
  const tb = [...d.querySelectorAll("#tabbar > *")].map(b => b.textContent.trim() || b.querySelector("button")?.getAttribute("aria-label"));
  ok(JSON.stringify(tb) === JSON.stringify(["Home", "Transactions", "+", "Charts", "Menu"]), "tab bar: Home · Transactions · + · Charts · Menu " + JSON.stringify(tb));
  ok(d.querySelector('#tabbar [data-nav="charts"]')?.getAttribute("onclick") === "navTab('charts')", "Charts takes Search's slot");
  ok(!d.querySelector('#tabbar [data-nav="report"]') && !d.querySelector('[data-nav="report"]'), "no Search anywhere");
  ok(!d.querySelector('#menu-sheet [data-nav="charts"]') && ![...d.querySelectorAll("#menu-sheet .menu-section-label")].some(e => e.textContent.trim() === "View"), "the Menu has no View section");
  const side = [...d.querySelectorAll("#sidebar .side-nav-btn")].map(b => b.textContent.trim());
  ok(JSON.stringify(side) === JSON.stringify(["Home", "Transactions", "Charts"]), "desktop sidebar: Home, Transactions, Charts " + JSON.stringify(side));
  ok(!$("sidebar-allyears-btn") && !$("year-list") && !$("btn-new-year") && !$("new-year-input"), "the sidebar's years and + New year are gone");
  ok(!!$("sidebar-addnew-btn") && !!$("sidebar-collapse-btn"), "+ Add New and the collapse button stay");
  ok($("grand-net").textContent === E(`aud(vhAllTx().reduce((s, t) => s + vhSigned(t), 0))`), "the header's Net still shows");
  ok($("report-panel").querySelector(".as-title").textContent === "Transactions", "title Transactions");
  ok(["as-in-l", "as-out-l", "as-net-l"].map(id => $(id).textContent).join() === "Saved,Withdrawn,Net", "cards Saved / Withdrawn / Net");
  ok(!$("tabs") && !$("account-pills-wrap") && !$("tx-table") && !$("year-summary") && !$("year-sheet") && !$("fy-title"), "old list, tabs, pills, period picker gone");
  ok(E(`typeof openPeriodSheet`) === "undefined" && E(`typeof setActiveYear`) === "undefined", "the period picker's code is gone");
  ok(d.querySelectorAll("#as-body tr").length === total, "everything shows with no filters");
  E(`switchTab("report")`); ok(E("activeTab") === "all", "an old 'report' lands on Transactions");
  E(`switchTab("saved")`); ok(E("activeTab") === "all" && E(`asF.types.join()`) === "dep,int", "'saved' lands on Transactions with Deposits + Interest");
  E(`switchTab("removed")`); ok(E(`asF.types.join()`) === "wit", "'removed' with Withdrawals");
  reset();
  ok(E(`isListTab("all") && !isListTab("saved") && !isListTab("home")`), "isListTab: Transactions only");

  // Filters apply only with Show N results
  E(`asOpenSheet()`);
  ok($("as-sheet").classList.contains("open"), "Filters opens");
  d.querySelector('#as-f-body [data-tp="dep"]').click();
  ok(d.querySelector('#as-f-body [data-tp="dep"]').classList.contains("on") && E(`asF.types.length`) === 0, "a tap changes the draft, not the list");
  ok($("as-show").textContent === `Show ${n(`t.kind === "dep"`)} results`, "Show N results counts the draft: " + $("as-show").textContent);
  E(`asCloseSheet(false)`);
  ok(E(`asF.types.length`) === 0, "closing without Show drops the draft");
  E(`asOpenSheet()`); d.querySelector('#as-f-body [data-tp="dep"]').click(); $("as-show").click();
  ok(E(`asF.types.join()`) === "dep" && shown() === n(`t.kind === "dep"`), "Show applies it");
  ok(chips().join() === "Deposits", "its chip shows: " + chips());
  ok(d.querySelector("#as-chips .as-chips-lab")?.textContent === "Showing", "the chips row starts with Showing");
  ok($("as-badge").textContent === "1" && $("as-fbtn").classList.contains("on"), "badge = 1");
  // Search stays inside the filters (a different kind narrows)
  E(`asSetQuery("ubank"); asRender();`);
  ok(shown() === n(`t.kind === "dep" && t.accId === "ub"`) && shown() > 0, "typing searches inside the filters");
  reset();

  // Chips: one per filter group, each ✕ removes one
  E(`asF.date = "m:2026-10"; asF.types = ["dep", "int"]; asF.accs = ["ing", "ub"]; asF.amtMode = "range"; asF.amin = "100"; asF.rec = "rec"; asF.rule = "222"; asRender();`);
  const c1 = chips();
  ok(c1.length === 5 && c1[0] === "October 2026" && c1[1] === "Deposits + Interest" && c1[2] === "ING + UBank" && c1[3] === "From $100.00" && /^Monthly \$250\.00 deposit · ING$/.test(c1[4]), "one chip per filter: " + JSON.stringify(c1));
  ok($("as-badge").textContent === "5", "badge counts the filter groups");
  for (let i = 5; i > 0; i--) d.querySelector("#as-chips [data-i]").click();
  ok(chips().length === 0 && E(`JSON.stringify(asF) === JSON.stringify(asBlank())`) && $("as-chips").style.display === "none", "each ✕ removes one; none left hides the row");
  E(`asF.types = ["wit"]; asSetQuery("ing"); asRender();`);
  $("as-clearall").click();
  ok(E(`asQ`) === "" && E(`asF.types.length`) === 0, "Clear all clears the filters and the search");

  // Dates: the native menu's options
  E(`asOpenSheet()`);
  const dsel = $("as-s-dates");
  const groups = [...dsel.querySelectorAll("optgroup")].map(g => g.label);
  ok(groups[0] === "Quick" && groups[groups.length - 1] === "Custom", "Quick first, Custom last: " + groups);
  ok(JSON.stringify(groups.slice(1, -1)) === JSON.stringify(E(`Object.keys(data).sort().reverse().map(yearLabel)`)), "one section per year, newest first (calendar)");
  const y26 = [...dsel.querySelectorAll("optgroup")][1];
  ok(y26.querySelector("option").value === "y:2026" && y26.querySelector("option").textContent === "Whole year", "Whole year first");
  ok([...y26.querySelectorAll("option")].slice(1).map(o => o.value)[0] === "m:2026-11" && [...y26.querySelectorAll("option")].some(o => o.textContent === "October 2026"), "then the year's months, newest first");
  ok([...dsel.querySelectorAll('optgroup[label="Quick"] option')].map(o => o.textContent).join() === "This month,Last month,Last 30 days,This year,Last year,All time", "quick picks (calendar)");
  ok($("as-s-dates").className === "as-rsel" && /\.as-rsel \{[^}]*font-size:16px/.test(html) && /\.as-rsel \{[^}]*opacity:0/.test(html), "invisible 16 px native menus over the rows");
  ok(d.querySelectorAll("#as-f-body .as-frow").length === 4 && [...d.querySelectorAll("#as-f-body .as-frow-t")].map(e => e.textContent).join() === "Dates,Amount,Number search,Recurring", "rows: Dates, Amount, Number search, Recurring");
  ok(!d.querySelector("#as-f-body .as-note") && !/Pick any combination/.test($("as-f-body").textContent), "no hint lines");
  // Choose dates…: folds open, filled from the dates already picked
  pick("as-s-dates", "m:2026-10");
  ok($("as-v-dates").textContent === "October 2026" && $("as-v-dates").classList.contains("set"), "the row shows the pick in gold");
  ok($("as-fold-dates").classList.contains("folded"), "the date fields stay folded");
  pick("as-s-dates", "custom");
  ok(!$("as-fold-dates").classList.contains("folded") && $("as-fold-dates").classList.contains("vp-fold"), "Choose dates… folds its fields in (vpFold)");
  ok($("as-from").value === "2026-10-01" && $("as-to").value === "2026-10-31", "filled from the dates already picked");
  $("as-to").value = ""; fire($("as-to"), "input");
  ok($("as-v-dates").textContent === "From 1 Oct 2026" && $("as-show").textContent === `Show ${n(`t.date >= "2026-10-01"`)} results`, "one date alone is open-ended");
  $("as-from").value = "2026-10-31"; $("as-to").value = "2026-10-01"; fire($("as-from"), "input"); fire($("as-to"), "change");
  ok($("as-v-dates").textContent === "1 Oct – 31 Oct 2026" && $("as-show").textContent === `Show ${n(`t.date >= "2026-10-01" && t.date <= "2026-10-31"`)} results`, "reversed dates swap");
  E(`asCloseSheet(false)`);
  // FY mode: Last FY, This calendar year, sections per FY
  E(`yearMode = "financial"; fyStartMonth = 7; fyStartDay = 1; data = (() => { const all = vhAllTx(); const out = {}; all.forEach(t => { const k = yearKeyForDate(t.date); out[k] = out[k] || { saved: [], removed: [] }; }); for (const y in data) for (const tab of ["saved", "removed"]) data[y][tab].forEach(r => out[yearKeyForDate(r[0])][tab].push(r)); return out; })(); _dataVersion++; _invalidateYearCache(); asOpenSheet();`);
  const q2 = [...$("as-s-dates").querySelectorAll('optgroup[label="Quick"] option')].map(o => o.textContent).join();
  ok(q2 === "This month,Last month,Last 30 days,This FY,Last FY,This calendar year,All time", "FY: This FY, Last FY (kept), This calendar year: " + q2);
  ok([...$("as-s-dates").querySelectorAll("optgroup")][1].label === E(`yearLabel("26-27")`), "sections per FY by the year format");
  pick("as-s-dates", "lastyear");
  ok($("as-show").textContent === `Show ${n(`t.date >= "2025-07-01" && t.date <= "2026-06-30"`)} results`, "Last FY = 1 Jul 2025 – 30 Jun 2026");
  pick("as-s-dates", "y:25-26");
  ok($("as-show").textContent === `Show ${n(`t.year === "25-26"`)} results` && $("as-v-dates").textContent === "FY 2025-26", "a whole FY by its bucket");
  pick("as-s-dates", "cal");
  ok($("as-show").textContent === `Show ${n(`t.date.startsWith("2026")`)} results`, "This calendar year");
  $("as-show").click();
  ok(chips()[0] === "This calendar year", "its chip");
  // Year format changes while a year is picked: the stale year falls back to All time (Step 8)
  E(`asF.date = "y:25-26"; asRender();`);
  ok(chips()[0] === "FY 2025-26", "FY chip");
  E(`yearMode = "calendar"; data = (() => { const out = {}; for (const y in data) for (const tab of ["saved", "removed"]) data[y][tab].forEach(r => { const k = yearKeyForDate(r[0]); out[k] = out[k] || { saved: [], removed: [] }; out[k][tab].push(r); }); return out; })(); _dataVersion++; _invalidateYearCache(); asRender();`);
  ok(E(`asF.date`) === "all" && chips().length === 0, "a year that's gone after a year-format change falls back to All time");
  reset();

  // Type and account buttons: colours
  E(`asOpenSheet()`);
  const accB = [...d.querySelectorAll("#as-f-body [data-ac]")];
  ok(accB.length === 2 && accB.every(b => b.style.getPropertyValue("--acc") === E(`getAccountColor(${JSON.stringify(b.dataset.ac)})`)), "account buttons carry the account's colour");
  ok([...d.querySelectorAll("#as-f-body [data-tp]")].map(b => b.className).join("|") === "as-ftype ft-dep|as-ftype ft-int|as-ftype ft-wit", "type buttons by role");
  ok(/\.as-ftype\.ft-dep\.on \{[^}]*var\(--green\)/.test(html) && /\.as-ftype\.ft-int\.on \{[^}]*var\(--interest\)/.test(html) && /\.as-ftype\.ft-wit\.on \{[^}]*var\(--red\)/.test(html), "lit green / blue / red");
  ok(/\.as-facc\.on \{[^}]*var\(--acc\)/.test(html) && /\.as-faccs \{[^}]*minmax\(104px/.test(html), "accounts lit in their colour, rectangular, at least 104 px");
  ok(!$("as-sec-cur"), "no Currency section without a foreign account");
  // Amount: Between… / Exactly… fold in
  pick("as-s-amount", "range");
  ok(!$("as-fold-range").classList.contains("folded") && $("as-fold-exact").classList.contains("folded") && $("as-v-amount").textContent === "Between…", "Between… folds in its fields");
  $("as-amin").value = "300"; fire($("as-amin"), "input");
  ok($("as-v-amount").textContent === "From $300.00" && $("as-show").textContent === `Show ${n(`t.amt >= 300`)} results`, "From $300");
  pick("as-s-amount", "exact");
  ok($("as-fold-range").classList.contains("folded") && !$("as-fold-exact").classList.contains("folded") && E(`asD.amin`) === "", "Exactly… swaps the fields");
  $("as-aexact").value = "250"; fire($("as-aexact"), "input");
  ok($("as-show").textContent === `Show ${n(`t.amt === 250`)} results`, "Exactly $250");
  pick("as-s-num", "exact");
  ok($("as-v-num").textContent === "Exactly" && $("as-v-num").classList.contains("set") && E(`asD.exactAmts`) === true, "Number search: Exactly in gold");
  pick("as-s-recur", "r:111");
  ok(E(`asD.rec`) === "rec" && E(`String(asD.rule)`) === "111" && $("as-v-recur").textContent === E(`asRuleLabel(recurRules[0])`), "Recurring: a rule");
  $("as-reset").click();
  ok(E(`JSON.stringify(asD) === JSON.stringify(asBlank())`) && $("as-fold-exact").classList.contains("folded") && $("as-v-amount").textContent === "Any", "Reset all clears the draft");
  E(`asCloseSheet(false)`);

  // Print / Export cover exactly what's shown
  E(`asF.accs = ["ub"]; asF.date = "m:2026-10"; asRender(); menuPrint();`);
  ok(E(`__pdf.rows.length`) === shown() && E(`__pdf.title`) === "October 2026" && /UBank/.test(E(`__pdf.subLine`)), "Print: the rows shown, titled by the dates: " + E(`__pdf.title`));
  const sc = E(`(() => { const s = exportScope(); return { n: s.rows.length, t: s.title, slug: s.slug }; })()`);
  ok(sc.n === shown() && sc.t === "October 2026" && sc.slug === "october-2026", "Export: the same rows, title and file name " + JSON.stringify(sc));
  ok(E(`viewScopeLabel()`) === `${shown()} transactions · October 2026 · UBank`, "menu label: N transactions · dates · filters: " + E(`viewScopeLabel()`));
  E(`asSetQuery("100"); asRender();`);
  ok(E(`viewScopeLabel()`) === `${shown()} transactions · October 2026 · UBank · “100”`, "…and the search");
  reset();
  ok(E(`viewScopeLabel()`) === `${total} transactions · All time`, "no filters: All time");
  E(`switchTab("home")`); ok(E(`viewScopeLabel()`) === "All transactions", "Home: All transactions"); E(`switchTab("all")`);

  // Quiet sync never runs under the Filters sheet
  E(`asOpenSheet()`);
  ok(E(`_anyOverlayOpen()`) === true, "_anyOverlayOpen sees the Filters sheet");
  ok(E(`navCloseTop()`) === true && !$("as-sheet").classList.contains("open"), "Back closes the Filters sheet first");
  ok(E(`_anyOverlayOpen()`) === false, "…and then nothing is open");

  // ══ #2 Home's ways in ══════════════════════════════════════════════════
  const dirty = () => E(`asF = asBlank(); asF.types = ["wit"]; asF.accs = ["ing"]; asF.date = "month"; asF.exactAmts = true; asSetQuery("june"); switchTab("home");`);
  dirty(); E(`vhSearchHandoff("ubank 250")`);
  ok(E("activeTab") === "all" && E("asQ") === "ubank 250" && E(`JSON.stringify(asF) === JSON.stringify(asBlank())`), "See all: the search as typed, nothing else (Number search back to Contains)");
  ok(chips().join("|") === "UBank|Contains 250" && shown() === n(`t.accId === "ub" && t.amt.toFixed(2).includes("250")`), "UBank and Contains 250: " + chips());
  dirty(); E(`vhSearchHandoff("")`);
  ok(E("asQ") === "" && E(`JSON.stringify(asF) === JSON.stringify(asBlank())`) && shown() === total, "Open with nothing typed: all transactions");
  dirty(); E(`vhGoToAccount("ub")`);
  ok(E(`asF.accs.join()`) === "ub" && E("asQ") === "" && chips().join() === "UBank" && E(`asF.types.length + (asF.date === "all" ? 0 : 1)`) === 0, "an account tap: Accounts = that account");
  dirty(); E(`vhSeeAllRecent()`);
  ok(E(`JSON.stringify(asF) === JSON.stringify(asBlank())`) && E("asQ") === "" && shown() === total, "Recent Activity's See all: no filters");
  // A row tap: no filters, on the page with that row
  E(`for (let i = 0; i < 600; i++) data["2026"].saved.push(["2020-01-01", 1 + i / 100, "bulk" + i, 1, null, null, "ing"]); _dataVersion++; sortKey = "date"; sortDir = "asc";`);
  dirty(); E(`vhGoToTx("bulk550")`);
  ok(E(`JSON.stringify(asF) === JSON.stringify(asBlank())`) && E("asPage") === 2 && [...d.querySelectorAll("#as-body tr")].some(r => r.dataset.txId === "bulk550"), "a row tap opens the page with that row (page " + E("asPage") + ")");
  E(`for (const k in data) data[k].saved = data[k].saved.filter(r => !String(r[2]).startsWith("bulk")); _dataVersion++; sortDir = "asc"; switchTab("home");`);
  // Home's labels
  E(`vhSearchToggle(); _vhSearchQ = "ubank"; vhRenderSearch();`);
  ok(/See all in Transactions →/.test($("vh-search-results").textContent), "See all in Transactions →");
  E(`_vhSearchQ = "zzqq"; vhRenderSearch();`);
  ok(/Open in Transactions →/.test($("vh-search-results").textContent), "Open in Transactions →");
  E(`_vhSearchQ = ""; vhRenderSearch(); vhSearchClose();`);
  ok(/Open in Transactions →/.test($("vh-search-results").textContent), "Open in Transactions → with nothing typed");
  E(`switchTab("all")`);

  // ══ #3 Sync and preferences ════════════════════════════════════════════
  const keys = E(`Object.keys(JSON.parse(JSON.stringify(buildWrappedPayload ? (buildWrappedPayload.length ? {} : {}) : {})))`);
  ok(E(`AS_RECENT_KEY`) === "vault_search_recent_v1", "recent searches keep their key");
  E(`asRecent = []; asSaveRecent(); localStorage.removeItem(AS_RECENT_KEY); vsSet(AS_RECENT_KEY, JSON.stringify(["ubank", "250"])); asLoadRecent();`);
  ok(E(`asRecent.join()`) === "ubank,250", "recent searches saved before v8.0.0 still show");
  E(`asRecent = []; asSaveRecent();`);
  const ts0 = E("sortTs");
  d.querySelector('#as-table th[data-as-sort="amount"]').click();
  ok(E("sortKey") === "amount" && E("sortTs") > ts0 - 1 && JSON.parse(w.localStorage.getItem("vault_sort_v1")).key === "amount", "a header tap saves and stamps the sort");
  E(`sortKey = "date"; sortDir = "asc";`);
  ok(!/asF|vault_search_filters|asQ/.test(E(`buildWrappedPayload.toString()`)), "the filters aren't in the backup payload");
  ok(!Object.keys(w.localStorage).some(k => /filter/i.test(k)), "…or stored on this device");

  // ══ #4 Back moves between screens, not filters ═════════════════════════
  E(`switchTab("home")`);
  let pushes = 0; const realPush = w.history.pushState.bind(w.history);
  w.history.pushState = (...a) => { pushes++; return realPush(...a); };
  E(`switchTab("all")`);
  ok(pushes === 1 && w.history.state.tab === "all", "going to Transactions is one step");
  E(`asOpenSheet()`); d.querySelector('#as-f-body [data-tp="wit"]').click(); $("as-show").click();
  E(`asSetQuery("ing"); asRender(); render();`);
  d.querySelector("#as-chips [data-i]").click();
  $("as-clearall").click();
  ok(pushes === 1, "filters, chips and Clear all add no Back step (" + pushes + ")");
  ok(JSON.stringify(Object.keys(w.history.state).sort()) === JSON.stringify(["tab", "vault", "y"]) || JSON.stringify(Object.keys(w.history.state).sort()) === JSON.stringify(["tab", "vault"]), "an entry is the screen only: " + JSON.stringify(w.history.state));
  w.history.pushState = realPush;
  w.history.back(); await sleep(80);
  ok(E("activeTab") === "home", "Back returns to the previous screen (Home): " + E("activeTab"));
  // Entries from before the update still restore
  E(`navRestore({ vault: "view", tab: "saved", year: "2026", month: "2026-10", acc: "ing" })`);
  ok(E("activeTab") === "all" && E(`asF.types.join()`) === "dep,int" && E("asF.date") === "m:2026-10" && E(`asF.accs.join()`) === "ing", "an old list entry restores as Transactions with its filters");
  E(`navRestore({ vault: "view", tab: "all", year: "2025", month: null, acc: "all" })`);
  ok(E("asF.date") === "y:2025" && E(`asF.types.length + asF.accs.length`) === 0, "an old year entry");
  E(`asF.accs = ["ub"]; navRestore({ vault: "view", tab: "report", year: "all-years", month: null, acc: "all" })`);
  ok(E("activeTab") === "all" && E(`asF.accs.join()`) === "ub", "an old Search entry keeps the filters as they are");
  E(`navRestore({ vault: "view", tab: "charts" })`); ok(E("activeTab") === "charts", "a new entry"); E(`switchTab("all")`);
  reset();

  // ══ #5 Word chips and Number search ════════════════════════════════════
  E(`asSetQuery("ubank 250"); asRender();`);
  ok(chips().join("|") === "UBank|Contains 250", "a chip per word, named for what it means");
  const ub250c = n(`t.accId === "ub" && t.amt.toFixed(2).includes("250")`);
  ok(shown() === ub250c, "UBank rows containing 250");
  d.querySelector("#as-chips [data-flip]").click();
  ok(E("asQ") === "ubank =250" && chips()[1] === "Exactly $250.00" && shown() === n(`t.accId === "ub" && t.amt === 250`), "⇄ → =250, exact: " + E("asQ"));
  d.querySelector("#as-chips [data-flip]").click();
  ok(E("asQ") === "ubank 250" && chips()[1] === "Contains 250", "⇄ again → back");
  E(`asF.exactAmts = true; asRender();`);
  ok(chips()[1] === "Exactly $250.00" && shown() === n(`t.accId === "ub" && t.amt === 250`), "Number search = Exactly: the chip says Exactly");
  d.querySelector("#as-chips [data-flip]").click();
  ok(E("asQ") === "ubank ~250" && chips()[1] === "Contains 250" && shown() === ub250c, "⇄ then writes ~250 (contains)");
  E(`asF.exactAmts = false; asRender();`);
  ok(chips()[1] === "Contains 250", "~ is contains whatever the default");
  E(`asSetQuery("ubank 250"); asRender();`);
  d.querySelector("#as-chips [data-unword]").click();
  ok(E("asQ") === "250" && chips().join() === "Contains 250", "✕ on UBank → the box says 250");
  E(`asSetQuery("=50"); asRender();`);
  ok(chips().join() === "Exactly $50.00", "=50 typed → Exactly $50.00");
  E(`asSetQuery("50 100"); asRender();`);
  d.querySelectorAll("#as-chips [data-flip]")[1].click();
  ok(E("asQ") === "50 =100" && JSON.stringify(chips()) === JSON.stringify(["Contains 50", "Exactly $100.00"]), "two numbers switch on their own");
  E(`asSetQuery("50"); asRender();`);
  ok($("as-rank-note").style.display !== "none", "Closest matches first while the first number contains");
  d.querySelector("#as-chips [data-flip]").click();
  ok($("as-rank-note").style.display === "none", "…not when it's exact");
  E(`asSetQuery("ING  Ubank   250"); asRender();`);
  d.querySelectorAll("#as-chips [data-unword]")[0].click();
  ok(E("asQ") === "Ubank 250", "spaces collapse, the case stays: " + JSON.stringify(E("asQ")));
  // A multi-word name is one chip over its words
  E(`accounts.push({ id: "ef", name: "Emergency Fund", color: "#7ab87a", currency: "AUD" }); asSetQuery("emergency fund 50"); asRender();`);
  ok(chips()[0] === "Emergency Fund" && chips().length === 2, "multi-word name, one chip");
  d.querySelector("#as-chips [data-unword]").click();
  ok(E("asQ") === "50", "its ✕ removes all its words");
  ok(/\.as-chip button::after \{[^}]*inset:-11px/.test(html), "chip buttons tap at 44 px");
  reset();

  // ══ #6 Did you mean ════════════════════════════════════════════════════
  const sg = (wd, typing) => E(`vsSuggest(${JSON.stringify(wd)}, ${!!typing}).map(s => s.label)`);
  ok(sg("emergancy")[0] === "Emergency Fund", "a multi-word account by one of its words");
  E(`accounts.find(a => a.id === "ef").name = "Rainy Day"`);
  ok(sg("rainy dy".split(" ")[1]).length === 0 && sg("raimy")[0] === "Rainy Day" && !sg("emergancy").includes("Emergency Fund"), "a renamed account: the new name, not the old");
  E(`accounts = accounts.filter(a => a.id !== "ef")`);
  ok(sg("raimy").length === 0, "a deleted account is never suggested");
  ok(sg("uds").length === 0, "no USD account, no USD");
  E(`accounts.push({ id: "us", name: "Marcus", color: "#5ba6d3", currency: "USD" })`);
  ok(sg("uds")[0] === "USD" && sg("ign")[0] === "ING", "3 letters: one swapped pair (uds → USD, ign → ING)");
  for (const [bad, good] of [["intrest", "Interest"], ["withdrawl", "Withdrawal"], ["novmber", "November"], ["ingg", "ING"], ["recuring", "Recurring"], ["ubnak", "UBank"]])
    ok(sg(bad)[0] === good, `${bad} → ${good}: ${sg(bad)}`);
  ok(sg("ubank").length === 0 && sg("interest").length === 0, "a whole known word: nothing");
  ok(sg("250").length === 0 && sg("=25").length === 0 && sg("$25").length === 0, "numbers never");
  ok(JSON.stringify(sg("ub", true)) === JSON.stringify(["UBank"]) && sg("ub", false).length === 0, "while typing: completions from 2 letters");
  ok(sg("mar", true).includes("Marcus") && sg("mar", true).includes("March"), "mar: Marcus and March offered");
  ok(sg("u", true).length === 0, "not from one letter");
  // While typing, in the app
  const inp = $("as-q");
  inp.focus(); inp.value = "ub"; fire(inp, "input");
  ok($("as-recent").classList.contains("show") && /UBank/.test($("as-recent").textContent) && /account/.test($("as-recent").textContent), "Did you mean: UBank · account under the box");
  await sleep(200);
  ok(chips().length === 0 && shown() === n(`t.accId === "ub"`), "the word being typed gets no chip yet; the list still filters by it");
  d.querySelector("#as-recent [data-sg]").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  ok(inp.value === "ubank " && d.activeElement === inp && chips().join() === "UBank", "a tap: 'ubank ' in the box, keyboard up, UBank chip");
  inp.value = "ubank intr"; fire(inp, "input"); await sleep(200);
  ok(/Interest/.test($("as-recent").textContent) && shown() > 0 && E(`_asRows.every(t => t.accId === "ub")`), "ubank intr: Interest offered, UBank's rows still listed");
  inp.value = "ubank xq"; fire(inp, "input"); await sleep(200);
  ok(shown() === n(`t.accId === "ub"`) && chips().join() === "UBank", "an unfinished unknown word doesn't empty the list or get a red chip");
  inp.value = "ubnak 250"; fire(inp, "input"); inp.blur(); await sleep(260);
  ok(chips()[0] === "“ubnak” did you mean UBank" && d.querySelector("#as-chips .as-chip.bad"), "finished: a red chip with the suggestion: " + chips()[0]);
  ok(/^“ubnak” isn't something Vault can search for/.test($("as-empty").textContent) && d.querySelector("#as-empty [data-dym]").textContent === `Did you mean UBank?${ub250c} result${ub250c === 1 ? "" : "s"}`, "empty state: Did you mean UBank? · N results first");
  d.querySelector("#as-empty [data-dym]").click();
  ok(E("asQ") === "ubank 250" && shown() === ub250c, "tapping it fixes the box");
  E(`asSetQuery("ubnak 250"); asRender();`);
  d.querySelector("#as-chips .as-fix").click();
  ok(E("asQ") === "ubank 250", "the chip's suggestion fixes it too");
  // Home's quick-find
  E(`switchTab("home"); vhSearchToggle(); _vhSearchQ = "ubnak"; vhRenderSearch();`);
  ok($("vh-search-dym")?.textContent === "Did you mean UBank?", "Home: Did you mean UBank?");
  $("vh-search-dym").click();
  ok(E("_vhSearchQ") === "ubank" && d.querySelectorAll("#vh-search-results .vh-recent-row").length > 0, "…and it fixes Home's search");
  E(`vhSearchClose(); switchTab("all");`);
  reset();

  // ══ #7 Same kind in Filters and the box counts together ════════════════
  E(`accounts = accounts.filter(a => a.id !== "us"); asF.accs = ["ing"]; asSetQuery("ubank"); asRender();`);
  ok(shown() === total, "ING picked + ubank typed → both accounts");
  ok(chips().join("|") === "ING|UBank", "both chips show");
  ok(/ING or UBank/.test(E(`asDescribe()`)), "print/export: ING or UBank");
  d.querySelector("#as-chips [data-i]").click();
  ok(shown() === n(`t.accId === "ub"`), "removing ING leaves UBank");
  reset();
  E(`asF.types = ["dep"]; asSetQuery("interest"); asRender();`);
  ok(shown() === n(`t.kind !== "wit"`), "Deposits + interest typed → both");
  E(`asF.types = []; asF.rec = "rec"; asSetQuery("one-off"); asRender();`);
  ok(shown() === total, "Recurring only + one-off → everything");
  E(`asF.rec = "rec"; asF.rule = "222"; asRender();`);
  ok(shown() === n(`String(t.recur) === "222" || !vhIsRecurring(t)`), "a rule + one-off → its rows and the one-offs");
  E(`accounts.push({ id: "us", name: "Marcus", color: "#5ba6d3", currency: "USD" }); data["2026"].saved.push(["2026-11-10", 75, "usd1", 1, null, null, "us"]); _dataVersion++;`);
  E(`asF = asBlank(); asF.curs = ["USD"]; asSetQuery("aud"); asRender();`);
  ok(shown() === total + 1, "USD picked + aud typed → both");
  E(`asF = asBlank(); asF.date = "m:2026-10"; asSetQuery("june"); asRender();`);
  ok(shown() === 0, "October 2026 + june → nothing (dates narrow)");
  const rem = [...d.querySelectorAll("#as-empty .as-sugg button")].map(b => b.firstChild.textContent);
  ok(rem.includes("Remove October 2026") && rem.includes("Remove June"), "…with Remove October 2026 and Remove June: " + rem);
  E(`asF = asBlank(); asSetQuery("ubank interest"); asRender();`);
  ok(shown() === n(`t.accId === "ub" && t.kind === "int"`), "different kinds still narrow");
  reset();

  // ══ Foreign-currency cards (from the list) ═════════════════════════════
  E(`window.__rd = rateDescription; rateDescription = c => "1 " + c + " = 1.5000 AUD"; asF.accs = ["us"]; asRender();`);
  ok($("as-in-l").textContent === "Saved USD $" && $("as-in").textContent === E(`fmtCurrency(75, "USD")`), "one foreign account: its own currency " + $("as-in").textContent);
  ok($("as-rate-note").style.display !== "none" && $("as-rate-note").textContent === E(`rateDescription("USD")`), "with the rate note");
  E(`asF.accs = []; rateDescription = window.__rd; asRender();`);
  ok($("as-in-l").textContent === "Saved" && $("as-rate-note").textContent === "≈ AUD (converted)", "several currencies: converted note");
  E(`asSetQuery("marcus"); asRender();`);
  ok($("as-in-l").textContent === "Saved USD $", "a typed account counts too");
  E(`asOpenSheet()`);
  ok(!!$("as-sec-cur") && [...d.querySelectorAll("#as-f-body [data-cu]")].map(b => b.dataset.cu).join() === "AUD,USD", "Currency section with a foreign account");
  E(`asCloseSheet(false)`);
  reset();

  // ══ Step 8: stale filters ══════════════════════════════════════════════
  E(`asF.accs = ["us", "ing"]; asF.curs = ["USD"]; asRender();`);
  E(`accounts = accounts.filter(a => a.id !== "us"); for (const k in data) data[k].saved = data[k].saved.filter(r => r[2] !== "usd1"); _dataVersion++; accountsChanged();`);
  ok(E(`asF.accs.join()`) === "ing" && E(`asF.curs.length`) === 0 && chips().join() === "ING", "a deleted account and its currency drop out of the filters");
  E(`asF = asBlank(); asF.rec = "rec"; asF.rule = "111"; recurRules = recurRules.filter(r => r.id !== 111); asRender();`);
  ok(E(`asF.rule`) === "" && chips().join() === "Recurring only", "a deleted rule falls back to Any rule");
  E(`recurRules.push({ id: 111, type: "deposit", amount: 100, freq: "weekly", startDate: "2025-11-01", endDate: null, dow: 3, nextDate: "2099-01-01", account: "ub" });`);
  E(`asF = asBlank(); asSetQuery("ubank"); asRender(); accounts.find(a => a.id === "ub").name = "Up Bank"; asRender();`);
  ok(/“ubank”/.test(chips()[0]) && shown() === 0, "a typed name that no longer matches turns into an unknown word");
  E(`accounts.find(a => a.id === "ub").name = "UBank";`);
  reset();

  // ══ Step 10: the engine (Home's quick-find too) ════════════════════════
  const kind = q => E(`vsParse(${JSON.stringify(q)}).words.map(w => w.kind + ":" + vsWordLabel(w, false)).join("|")`);
  ok(kind("deposits") === "type:Deposits" && kind("withdrawals") === "type:Withdrawals" && kind("withdraw") === "type:Withdrawals" && kind("withdrawn") === "type:Withdrawals" && kind("saved") === "type:Deposits + Interest", "plurals and saved: " + kind("deposits saved"));
  ok(cnt("saved") === n(`t.kind !== "wit"`) && cnt("deposits") === n(`t.kind === "dep"`) && cnt("withdrawn") === n(`t.kind === "wit"`), "…and they match");
  E(`accounts.push({ id: "is", name: "Interest Saver", color: "#999", currency: "AUD" }, { id: "es", name: "Emergency Savings", color: "#888", currency: "AUD" }, { id: "mc", name: "Marcus", color: "#777", currency: "AUD" })`);
  ok(kind("interest") === "type:Interest", "interest is the type, not Interest Saver");
  ok(kind("interest saver") === "acc:Interest Saver", "…but the whole name is the account");
  ok(kind("mar") === "acc:Marcus", "mar stays Marcus (the typing list offers March)");
  ok(kind("march") === "month:March", "march is the month");
  ok(kind("ing") === "acc:ING", "ing is ING only, not the ing inside Savings");
  ok(kind("sav") === "acc:Interest Saver or Emergency Savings", "a word's start still finds both");
  ok(E(`(vhSearchMatches("interest") || []).every(t => t.kind === "int")`) && E(`(vhSearchMatches("ing") || []).every(t => t.accId === "ing")`), "Home's quick-find follows the same rules");
  E(`accounts = accounts.filter(a => !["is", "es", "mc"].includes(a.id))`);
  ok(kind("~250") === "amt:Contains 250" && kind("=250") === "amt:Exactly $250.00", "~ and = marks");
  ok(E(`vsWordLabel(vsParse("250").words[0], true)`) === "Exactly $250.00", "Number search's default decides a plain number");
  ok(kind("2026") === "amt:Contains 2026 or dated 2026" && E(`vsWordLabel(vsParse("2026").words[0], true)`) === "Exactly $2,026.00 or dated 2026", "years keep their dates in exact mode");
  E(`asF.exactAmts = true;`);
  ok(cnt("2026") === n(`t.date.startsWith("2026") || t.amt === 2026`), "…and still find them (" + cnt("2026") + ")");
  E(`asF.exactAmts = false;`);
  ok(kind("2026-11") === "date:November 2026" && kind("2026-11-03") === "date:" + E(`fmtDate("2026-11-03")`), "dates read as dates");
  ok(E(`(vhSearchMatches("~50") || []).length`) === E(`(vhSearchMatches("50") || []).length`) && E(`(vhSearchMatches("=50") || []).every(t => t.amt === 50)`), "Home: ~ and = work, plain numbers contain");
  const P = E(`JSON.stringify(vsParse("  ING  ubank =250").words.map(w => [w.start, w.end]))`);
  ok(P === "[[2,5],[7,12],[13,17]]", "words keep their place in the text: " + P);

  // ══ Pinned bar: the spacer re-measures as the chips wrap ═══════════════
  const top = $("as-top"), sp = $("as-top-spacer");
  let H = 120;
  Object.defineProperty(top, "offsetHeight", { configurable: true, get: () => H });
  sp.getBoundingClientRect = () => ({ top: -40, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
  E(`asPinTop()`);
  ok(top.classList.contains("pinned") && sp.style.height === "120px", "pinned with the bar's height");
  H = 160; E(`asPinTop()`);
  ok(sp.style.height === "160px", "re-measured when the chips wrap to a new line");
  H = 90; E(`asPinTop()`);
  ok(sp.style.height === "90px", "…and when they go");
  sp.getBoundingClientRect = () => ({ top: 10, bottom: 10, left: 0, right: 0, width: 0, height: 0 });
  E(`asPinTop()`);
  ok(!top.classList.contains("pinned") && sp.style.height === "", "unpinned again");

  // ══ Add and edit while filtered (Step 7) ═══════════════════════════════
  reset();
  E(`populateAccountSelects(); asF.accs = ["ub"]; asRender(); window.__toasts = [];`);
  E(`document.getElementById("mob-inp-amount").value = "42"; document.getElementById("mob-inp-date").value = "2026-11-19";
     if (document.getElementById("mob-inp-account")) document.getElementById("mob-inp-account").value = "ing"; setMobType("deposit"); mobileAddTransaction && mobileAddTransaction();`);
  const t1 = E(`JSON.stringify(window.__toasts)`);
  ok(/hidden by your filters/.test(t1), "adding to an account the filters hide says so: " + t1);
  E(`window.__toasts = []; document.getElementById("mob-inp-amount").value = "43"; document.getElementById("mob-inp-date").value = "2026-11-19";
     if (document.getElementById("mob-inp-account")) document.getElementById("mob-inp-account").value = "ub"; mobileAddTransaction();`);
  const t2 = E(`JSON.stringify(window.__toasts)`);
  ok(!/hidden/.test(t2) && E(`_asRows.some(t => t.amt === 43)`), "adding one it shows: no 'hidden' note, it's listed: " + t2);
  reset();

  ok(!/Search/.test($("dmenu-export-sub")?.textContent || "") , "menus don't name Search");
  ok(E(`typeof asFitFigures`) === "function" && /asFitFigures\(\);/.test(html), "six-figure totals shrink to fit their card (checked in Chrome at 393/375/360)");
  ok(/\.as-field:not\(\.has\) \.as-x \{ display:none !important; \}/.test(html), "the search box's ✕ hides when there's nothing to clear");
  ok(E(`document.getElementById("version-footer").textContent.trim()`) === "v8.0.0" && /Version v8\.0\.0</.test(html), "v8.0.0 in the footer and About");
  ok(errors.length === 0, "no page errors: " + errors.slice(0, 3).join(" | "));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 1500);
