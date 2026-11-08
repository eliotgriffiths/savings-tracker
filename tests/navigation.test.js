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

  // Home → Search → Charts, then Back twice.
  E(`switchTab("report")`);
  ok(st().tab === "report" && w.history.length === len0 + 1, "a new view adds one history entry");
  E(`asSetQuery("ubank"); asRender();`);
  E(`switchTab("charts")`);
  ok(w.history.length === len0 + 2, "Charts adds another");
  E(`render(); render();`);
  ok(w.history.length === len0 + 2, "re-rendering the same view adds nothing");
  await back();
  ok(tab() === "report", "Back from Charts returns to Search: " + tab());
  ok(E("asQ") === "ubank", "…with the last search still there: " + E("asQ"));
  await back();
  ok(tab() === "home", "Back again returns to Home: " + tab());
  ok(st().tab === "home", "history entry matches");

  // Years and months are their own steps.
  E(`setActiveYear("2026")`);
  ok(tab() === "all" && E("activeYear") === "2026", "choosing 2026 opens the list");
  E(`activeYear = "2026"; activeMonth = "2026-03"; render();`);
  ok(st().month === "2026-03", "choosing a month adds a step");
  await back();
  ok(tab() === "all" && E("activeYear") === "2026" && E("activeMonth") === null, "Back goes from March to the whole of 2026");
  E(`activeAccountFilter = "ub"; render();`);
  const lenAcc = w.history.length;
  E(`activeAccountFilter = "ing"; render();`);
  ok(w.history.length === lenAcc, "account pills don't add steps");
  ok(st().acc === "ing", "…but the entry remembers the account");
  await back();
  ok(tab() === "home", "Back returns to Home");

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
  ok(E("window.__toasts.length") === 1 && E("window.__toasts[0][1]") === "notice", "…and says how to leave");
  ok(tab() === "all", "…on the same screen");
  E(`closeSheets()`);

  E(`openSaveStatusLegend()`);
  await back();
  ok(!isOpen("save-status-legend-popup"), "Back closes an info popup");
  ok(tab() === "all", "…without changing screen");

  d.getElementById("currency-mismatch-popup").classList.remove("hidden");
  await back();
  ok(isOpen("currency-mismatch-popup"), "Back leaves a required decision open");
  d.getElementById("currency-mismatch-popup").classList.add("hidden");

  E(`vhHomeMenuToggle()`);
  await back();
  ok(!d.getElementById("vh-home-menu").classList.contains("open"), "Back closes Home's ⋮ menu");

  E(`openAbout()`);
  ok(w.location.hash === "#about", "About has its own entry");
  await back();
  ok(d.getElementById("about-overlay").classList.contains("hidden"), "Back closes About");
  ok(tab() === "all", "…and stays on the list");
  E(`openAbout()`); E(`closeAbout()`); await sleep(60);
  ok(tab() === "all" && w.location.hash === "", "closing About with ✕ stays on the list");

  // ── N4: where you are ────────────────────────────────────────────────────
  const cur = () => [...d.querySelectorAll("#menu-sheet [data-nav].menu-item-active")].map(b => b.dataset.nav).join(",");
  const dcur = () => [...d.querySelectorAll("#desktop-menu [data-nav].dmenu-current")].map(b => b.dataset.nav).join(",");
  E(`activeYear = "all-years"; activeMonth = null; switchTab("home")`);
  ok(cur() === "home" && dcur() === "home", "on Home, Home is highlighted in both menus");
  ok(!d.getElementById("sidebar-allyears-btn").classList.contains("active"), "on Home, the sidebar's All isn't highlighted");
  E(`renderMenuTxDropdown()`);
  ok(!d.querySelector("#menu-tx-dropdown .menu-tx-dropdown-item.active"), "on Home, nothing in Transactions is highlighted");
  E(`switchTab("all")`);
  ok(cur() === "list" && dcur() === "", "on the list, Transactions is highlighted");
  ok(d.getElementById("sidebar-allyears-btn").classList.contains("active"), "on the list, the sidebar's All is highlighted");
  E(`renderMenuTxDropdown()`);
  ok(!!d.querySelector("#menu-tx-dropdown .menu-tx-dropdown-item.active"), "on the list, All is highlighted in Transactions");
  E(`switchTab("report")`);
  ok(cur() === "report" && dcur() === "report", "on Search, Search is highlighted");
  ok(d.querySelector('#menu-sheet [data-nav="report"]').getAttribute("aria-current") === "page", "aria-current marks it");
  E(`switchTab("charts")`);
  ok(cur() === "charts" && dcur() === "charts", "on Charts, Charts is highlighted");

  // ── N7: backup status ───────────────────────────────────────────────────
  const btns = () => [...d.querySelectorAll("#ss-now-btns button")].map(b => b.textContent);
  E(`setSaveStatus("warn", "No backup"); openSaveStatusLegend()`);
  ok(/No backup/.test(d.getElementById("ss-now").textContent), "the popup leads with the current status");
  ok(JSON.stringify(btns()) === '["Set up backup","Done"]', "No backup offers Set up backup: " + btns());
  ok(d.querySelector("#ss-now-btns .pbtn-primary").textContent === "Set up backup", "…as the primary button");
  ok(d.getElementById("ss-legend-fold").open === false, "the full legend is folded away");
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
  ok(!/Menu → Save &amp; backup|Menu → Save & backup/.test(html), "no wording points at Menu → Save & backup any more");
  ok((html.match(/Menu → Settings → Save (&amp;|&) backup/g) || []).length === 7, "every pointer says Menu → Settings → Save & backup");

  // ── N8 ──────────────────────────────────────────────────────────────────
  ok(d.querySelector("#vh-home-menu-drop .vh-menu-item").textContent === "Customise Home", "Home's ⋮ says Customise Home");

  // ── N9: Print and Export follow the screen ──────────────────────────────
  E(`window.__x = null; exportRowsXLSX = (rows, cov, fn) => { window.__x = { n: rows.length, cov, fn, rows }; };
     window.__p = null; openPdfWindow = o => { window.__p = o; };`);
  const all = E(`vhAllTx().length`);
  const in2026ub = E(`vhAllTx().filter(t => t.date.startsWith("2026") && t.accId === "ub" && t.kind !== "wit").length`);
  E(`activeYear = "2026"; activeMonth = null; activeAccountFilter = "ub"; switchTab("saved"); menuExportXLSX();`);
  ok(E("window.__x.n") === in2026ub, `Export on the list covers the list: ${E("window.__x.n")} vs ${in2026ub}`);
  ok(E("window.__x.cov") === "2026 transactions · UBank · deposits only", "Export describes it: " + E("window.__x.cov"));
  ok(/^vault-2026-transactions-ubank-deposits-only-2026-11-09\.xlsx$/.test(E("window.__x.fn")), "file name: " + E("window.__x.fn"));
  ok(d.getElementById("mob-export-sub").textContent === "2026 transactions · UBank · deposits only as XLSX", "menu says what Export covers: " + d.getElementById("mob-export-sub").textContent);
  ok(d.getElementById("mob-print-sub").textContent === "2026 transactions · UBank · deposits only", "menu says what Print covers");
  ok(d.getElementById("dmenu-print-sub").textContent === d.getElementById("mob-print-sub").textContent, "desktop menu matches");
  E(`menuPrint()`);
  ok(E("window.__p.rows.length") === in2026ub, "Print on the list covers the same rows");
  E(`activeAccountFilter = "all"; activeYear = "2026"; activeMonth = "2026-03"; switchTab("all");`);
  ok(d.getElementById("mob-print-sub").textContent === "March 2026 transactions", "month label: " + d.getElementById("mob-print-sub").textContent);
  E(`switchTab("home"); menuPrint(); menuExportXLSX();`);
  ok(E("window.__p.rows.length") === all, `Print on Home covers every transaction: ${E("window.__p.rows.length")} vs ${all}`);
  ok(E("window.__x.n") === all, "Export on Home covers every transaction");
  ok(d.getElementById("mob-print-sub").textContent === "All transactions", "Home's Print label");
  E(`switchTab("charts")`);
  ok(d.getElementById("mob-print-sub").textContent === "These charts" && d.getElementById("mob-export-sub").textContent === "All transactions as XLSX", "Charts labels");
  E(`switchTab("report")`);
  ok(d.getElementById("mob-export-sub").textContent === "Advanced Search results as XLSX", "Search labels");

  // ── version ─────────────────────────────────────────────────────────────
  const vf = d.getElementById("version-footer").textContent.trim();
  ok(/^v6\.(1[3-9]|[2-9]\d)\.\d+$/.test(vf) && html.includes(`Version ${vf}<`), "version v6.13.0 or later, About matches: " + vf);

  console.log(`navigation: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
  errors.slice(0, 5).forEach(e => console.log("PAGE ERROR:", e.slice(0, 300)));
  process.exit(fail || errors.length ? 1 : 0);
}, 500);
