// v6.13.0 regression tests: Back button (N2), current view in the menus (N4),
// backup status popup (N7), Home's ⋮ wording (N8), Print and Export scope (N9).
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/navigation.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
const FIXED = new Date("2026-11-09T07:30:00+10:00").getTime();
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
const back = async () => { w.history.back(); await sleep(60); };
const tab = () => E("activeTab");
const st = () => w.history.state || {};
const isOpen = id => { const el = d.getElementById(id); return !!el && !el.classList.contains("hidden"); };

setTimeout(async () => {
  E(SEED);
  E(`_dataVersion++; _invalidateYearCache(); document.getElementById("welcome-modal")?.classList.add("hidden");
     switchTab("home"); window.__toasts = []; const _t = toast; toast = (m, k) => { window.__toasts.push([m, k]); };`);

  // ── N2: history is set up, Home is the first screen ─────────────────────
  ok(E("_navReady") === true, "history is set up after start");
  ok(st().vault === "view" && st().tab === "home", "the current entry is Home: " + JSON.stringify(st()));
  const len0 = w.history.length;

  // Home → Transactions → Charts, then Back twice. (v8.0.0: Search is part of Transactions)
  E(`switchTab("all")`);
  ok(st().tab === "all" && w.history.length === len0 + 1, "a new view adds one history entry");
  E(`asSetQuery("ubank"); asRender();`);
  E(`switchTab("charts")`);
  ok(w.history.length === len0 + 2, "Charts adds another");
  E(`render(); render();`);
  ok(w.history.length === len0 + 2, "re-rendering the same view adds nothing");
  await back();
  ok(tab() === "all", "Back from Charts returns to Transactions: " + tab());
  ok(E("asQ") === "ubank", "…with the last search still there: " + E("asQ"));
  await back();
  ok(tab() === "home", "Back again returns to Home: " + tab());
  ok(st().tab === "home", "history entry matches");

  // v8.0.0 (queue #4): filters, chips and the search add no Back step; Back goes to the previous screen.
  E(`switchTab("all")`);
  const lenF = w.history.length;
  E(`asF.date = "y:2026"; asRender(); render(); asF.accs = ["ub"]; asRender(); render(); asSetQuery("250"); asRender(); render();`);
  ok(w.history.length === lenF && st().tab === "all", "filter changes add no steps");
  await back();
  ok(tab() === "home", "Back returns to Home");
  E(`asF = asBlank(); asSetQuery("");`);

  // Back closes what's on top before changing screen.
  E(`switchTab("all")`);
  const lenSheet = w.history.length;
  E(`openMenuSheet()`);
  await back();
  ok(!d.getElementById("menu-sheet").classList.contains("open"), "Back closes the Menu sheet");
  ok(tab() === "all" && st().tab === "all" && w.history.length === lenSheet, "…and stays on the list");

  E(`openAddSheet()`); await sleep(10);   // opening resets "touched"
  d.getElementById("add-sheet").dataset.dirty = "1";
  E(`window.__toasts = []`);
  await back();
  ok(d.getElementById("add-sheet").classList.contains("open"), "Back keeps an Add sheet with typed input");
  ok(/Tap Cancel/.test(E(`document.getElementById("toast").textContent`)) && E(`document.getElementById("toast").dataset.kind`) === "notice", "…and says how to leave");   // v7.3.1: a nudge (toastNudge), not toast()
  ok(tab() === "all", "…on the same screen");
  E(`closeSheets()`);

  E(`openSaveStatusLegend()`);
  await back();
  ok(!isOpen("save-status-legend-popup"), "Back closes an info popup");
  ok(tab() === "all", "…without changing screen");

  d.getElementById("import-progress-popup").classList.remove("hidden");
  await back();
  ok(isOpen("import-progress-popup"), "Back leaves a required decision open");
  d.getElementById("import-progress-popup").classList.add("hidden");
  // v6.16.0: currency mismatch can be closed, and closing it skips the merge
  d.getElementById("currency-mismatch-popup").classList.remove("hidden");
  await back();
  ok(!isOpen("currency-mismatch-popup"), "Back closes currency mismatch (it counts as Decide later)");

  E(`vhHomeMenuToggle()`);
  await back();
  ok(!d.getElementById("vh-home-menu").classList.contains("open"), "Back closes Home's ⋮ menu");

  E(`openAbout()`);
  ok(w.location.hash === "#about", "About has its own entry");
  await back();
  ok(d.getElementById("about-popup").classList.contains("hidden"), "Back closes About");
  ok(tab() === "all", "…and stays on the list");
  E(`openAbout()`); E(`closeAbout()`); await sleep(60);
  ok(tab() === "all" && w.location.hash === "", "closing About with ✕ stays on the list");

  // ── N4: where you are (tab bar, Menu and sidebar since v6.14.0) ────────
  const on = sel => [...d.querySelectorAll(sel)].map(b => b.dataset.nav).join(",");
  const bar = () => on("#tabbar [data-nav].nav-on"), side = () => on(".side-nav [data-nav].nav-on");
  const menu = () => on("#menu-sheet [data-nav].menu-item-active");
  E(`switchTab("home")`);
  ok(bar() === "home" && side() === "home" && menu() === "", "on Home, Home is highlighted in the bar and sidebar");
  E(`switchTab("all")`);
  ok(bar() === "list" && side() === "list", "on Transactions, Transactions is highlighted in the bar and sidebar (v8.0.0)");
  ok(d.querySelector('#tabbar [data-nav="list"]').getAttribute("aria-current") === "page", "aria-current marks it");
  E(`switchTab("charts")`);
  ok(bar() === "charts" && side() === "charts" && menu() === "", "on Charts, Charts is highlighted in the bar and sidebar (it left the Menu)");

  // ── N7: backup status ───────────────────────────────────────────────────
  const btns = () => [...d.querySelectorAll("#ss-now-btns button")].map(b => b.textContent);
  E(`setSaveStatus("warn", "No backup"); openSaveStatusLegend()`);
  ok(/No backup/.test(d.getElementById("ss-now").textContent), "the popup leads with the current status");
  ok(JSON.stringify(btns()) === '["Set up backup","Use Google Drive","Done"]', "No backup offers Set up backup, then Google Drive (v6.16.1): " + btns());
  ok(d.querySelector("#ss-now-btns .pbtn-primary").textContent === "Set up backup", "…as the primary button");
  ok(d.getElementById("ss-legend-body").classList.contains("folded"), "the full legend is folded away");   // v6.17.1: a fold, not a <details>
  E(`closeSaveStatusLegend(); setSaveStatus("err", "Sync failed"); openSaveStatusLegend()`);
  ok(JSON.stringify(btns()) === '["Try again","Backup settings","Done"]', "Sync failed offers Try again: " + btns());
  ok(/ss-now-err/.test(d.getElementById("ss-now").className), "…in red");
  E(`closeSaveStatusLegend(); setSaveStatus("warn", "Permission needed"); openSaveStatusLegend()`);
  ok(btns()[0] === "Reconnect file", "Permission needed offers Reconnect file");
  E(`closeSaveStatusLegend(); setSaveStatus("ok", "Backed up · encrypted"); openSaveStatusLegend()`);
  ok(JSON.stringify(btns()) === '["Done"]', "Backed up has only Done");
  ok(/AES-256/.test(d.getElementById("ss-now").textContent), "encrypted is mentioned");
  let opened = 0; E(`window.__os = openSetup; openSetup = () => { window.__setup = (window.__setup || 0) + 1; }`);
  E(`closeSaveStatusLegend(); setSaveStatus("warn", "No backup"); openSaveStatusLegend()`);
  d.querySelector("#ss-now-btns .pbtn-primary").click(); await sleep(80);
  ok(!isOpen("save-status-legend-popup") && E("window.__setup") === 1, "Set up backup closes the popup and opens Save & backup");
  E(`openSetup = window.__os`);
  // v6.16.1: Save & backup moved back to the Menu
  ok(!/Menu → Settings → Save (&amp;|&) backup/.test(html), "no wording points at Menu → Settings → Save & backup any more");
  ok((html.match(/Menu → Save (&amp;|&) backup/g) || []).length >= 7, "every pointer says Menu → Save & backup"); // v6.20.0 added one

  // ── N8 ──────────────────────────────────────────────────────────────────
  ok(d.querySelector("#vh-home-menu-drop .vh-menu-item").textContent === "Customise Home", "Home's ⋮ says Customise Home");

  // ── N9: Print and Export follow the screen ──────────────────────────────
  // v7.1.0: Export opens a tray; what it covers comes from exportScope()
  E(`window.__x = null; const _oep = openExportPopup; openExportPopup = () => { const sc = exportScope(); window.__x = { n: sc.rows.length, cov: sc.coverage, fn: exportFileName(sc, "xlsx"), rows: sc.rows }; updateExportMenuSub(); };
     window.__p = null; openPdfWindow = o => { window.__p = o; };`);
  const all = E(`vhAllTx().length`);
  const in2026ub = E(`vhAllTx().filter(t => t.date.startsWith("2026") && t.accId === "ub" && t.kind !== "wit").length`);
  // v8.0.0: Transactions' filters say what Print and Export cover
  E(`asF = asBlank(); asF.date = "y:2026"; asF.accs = ["ub"]; asF.types = ["dep", "int"]; switchTab("all"); menuExportXLSX();`);
  ok(E("window.__x.n") === in2026ub, `Export on Transactions covers what it shows: ${E("window.__x.n")} vs ${in2026ub}`);
  ok(/^1 Jan 2026 – 31 Dec 2026 · Deposits \+ Interest · UBank · Sorted by date, oldest first$/.test(E("window.__x.cov")), "Export describes it: " + E("window.__x.cov"));
  ok(/^vault-2026-2026-11-09\.xlsx$/.test(E("window.__x.fn")), "file name from the dates: " + E("window.__x.fn"));
  ok(d.getElementById("mob-export-sub").textContent === `${in2026ub} transactions · 2026 · Deposits + Interest · UBank`, "menu says what Export covers: " + d.getElementById("mob-export-sub").textContent);
  ok(d.getElementById("mob-print-sub").textContent === d.getElementById("mob-export-sub").textContent, "menu says what Print covers");
  ok(d.getElementById("dmenu-print-sub").textContent === d.getElementById("mob-print-sub").textContent, "desktop menu matches");
  E(`menuPrint()`);
  ok(E("window.__p.rows.length") === in2026ub && E("window.__p.title") === "2026", "Print on Transactions covers the same rows, titled by the dates");
  E(`asF = asBlank(); asF.date = "m:2026-03"; asRender();`);
  ok(/^\d+ transactions? · March 2026$/.test(d.getElementById("mob-print-sub").textContent), "month label: " + d.getElementById("mob-print-sub").textContent);
  E(`asF = asBlank(); asRender();`);
  E(`switchTab("home"); menuPrint(); menuExportXLSX();`);
  ok(E("window.__p.rows.length") === all, `Print on Home covers every transaction: ${E("window.__p.rows.length")} vs ${all}`);
  ok(E("window.__x.n") === all, "Export on Home covers every transaction");
  ok(d.getElementById("mob-print-sub").textContent === "All transactions", "Home's Print label");
  E(`switchTab("charts")`);
  ok(/^(These charts|This chart)$/.test(d.getElementById("mob-print-sub").textContent) && d.getElementById("mob-export-sub").textContent === "All transactions", "Charts labels");
  E(`switchTab("all")`);
  ok(d.getElementById("mob-export-sub").textContent === `${all} transactions · All time`, "Transactions with no filters: " + d.getElementById("mob-export-sub").textContent);

  // ── version ─────────────────────────────────────────────────────────────
  const vf = d.getElementById("version-footer").textContent.trim();
  ok((([M, m, p]) => M > 6 || (M === 6 && (m > 13 || (m === 13 && p >= 0))))((vf.match(/^v(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number)) && html.includes(`Version ${vf}<`), "version v6.13.0 or later, About matches: " + vf);

  console.log(`navigation: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
  errors.slice(0, 5).forEach(e => console.log("PAGE ERROR:", e.slice(0, 300)));
  process.exit(fail || errors.length ? 1 : 0);
}, 500);
