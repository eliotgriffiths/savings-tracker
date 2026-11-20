// v6.14.0 regression tests: phone tab bar (N1/N3), period picker (N5), Menu and
// Settings page (N6), desktop sidebar (N11), old Years sheet gone (N12), "Search".
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/layout.test.js
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
    w.Element.prototype.scrollIntoView = () => {};   // not in jsdom
    Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });   // a phone
  },
});
const w = dom.window, d = w.document;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const E = s => w.eval(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
const txt = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const isOpen = id => { const el = d.getElementById(id); return !!el && !el.classList.contains("hidden"); };

setTimeout(async () => {
  E(SEED);
  E(`_dataVersion++; _invalidateYearCache(); document.getElementById("welcome-modal")?.classList.add("hidden"); switchTab("home");`);

  // ── N1 / N3: tab bar ─────────────────────────────────────────────────────
  ok(!$("#mob-fabs") && !$("#fab-add") && !$("#fab-menu"), "the floating Menu and Add buttons are gone");
  ok(!/#mob-fabs|#fab-add|#fab-menu/.test(html), "…and so are their styles");
  const tabs = $$("#tabbar > *").map(el => el.querySelector("button[aria-label]")?.getAttribute("aria-label") || txt(el));
  // v8.0.0: Charts takes Search's slot (Search merged into Transactions, queue-v8.0.0 #1)
  ok(JSON.stringify(tabs) === '["Home","Transactions","Add transaction","Charts","Menu"]', "bar: Home · Transactions · ＋ · Charts · Menu: " + JSON.stringify(tabs));
  $('#tabbar [data-nav="list"]').click();
  ok(E("activeTab") === "all", "Transactions opens the list");
  E(`asF.types = ["wit"]`); $('#tabbar [data-nav="home"]').click();
  ok(E("activeTab") === "home", "Home opens Home");
  $('#tabbar [data-nav="list"]').click();
  ok(E("activeTab") === "all" && E(`asF.types.join()`) === "wit", "Transactions comes back with the filters you had (they last while Vault is open)");
  let scrolled = 0; w.scrollTo = () => { scrolled++; };
  $('#tabbar [data-nav="list"]').click();
  ok(E("activeTab") === "all" && scrolled === 1, "tapping the tab you're on scrolls to the top");
  E(`asF = asBlank(); asRender();`);
  $('#tabbar [data-nav="charts"]').click();
  ok(E("activeTab") === "charts" && $('#tabbar [data-nav="charts"]').classList.contains("nav-on"), "Charts opens Charts");
  $("#tb-add").click();
  ok($("#add-sheet").classList.contains("open"), "＋ opens the Add sheet");
  E(`closeSheets()`);
  $("#tb-menu").click();
  ok($("#menu-sheet").classList.contains("open"), "Menu opens the Menu sheet");
  $("#tb-menu").click();
  ok(!$("#menu-sheet").classList.contains("open"), "tapping Menu again closes it");
  ok(/#main \{ padding-bottom: calc\(\d+px \+ env\(safe-area-inset-bottom/.test(html), "the page leaves room under the bar");
  ok(/#vh-search-corner \{ display: none; \}/.test(html), "Home's own search icon is hidden on a phone");

  // ── N6: Menu ─────────────────────────────────────────────────────────────
  const sections = $$("#menu-sheet .menu-section-label").map(txt);
  // v8.0.0: no View section (Charts is in the tab bar)
  ok(JSON.stringify(sections) === '["Manage","Data","Settings"]', "Menu sections: " + JSON.stringify(sections));
  const items = $$("#menu-sheet .menu-item-label").map(txt);
  ok(JSON.stringify(items) === '["Recurring","Accounts","Goals","Save & backup","Import","Export spreadsheet","Print","Settings","Holdings Soon"]', "Menu items: " + JSON.stringify(items));
  ok(!$("#menu-tx-dropdown") && !$("#menu-settings-dropdown"), "no dropdowns inside the Menu");
  ok(["mob-recur-manage-sub", "mob-accounts-sub", "menu-goals-sub", "mob-export-sub", "mob-print-sub"].every(id => d.getElementById(id)), "Menu keeps its live sub-labels");
  ok(d.querySelectorAll('[id="mob-accounts-sub"]').length === 1, "IDs are unique");

  // Back, then wait for the browser's popstate (a fixed 60 ms wait was flaky in jsdom)
  const goBack = () => new Promise(r => { w.addEventListener("popstate", () => setTimeout(r, 10), { once: true }); w.history.back(); });
  // ── N6: Settings (a panel since v6.16.1: a tray on a phone) ─────────────
  E(`openMenuSheet()`);
  [...d.querySelectorAll("#menu-sheet .menu-item-btn")].find(b => /^Settings/.test(txt(b))).click();
  ok(isOpen("settings-popup") && !$("#menu-sheet").classList.contains("open"), "Settings opens its tray and closes the Menu");
  await sleep(0);
  ok(d.documentElement.classList.contains("vp-lock"), "the page behind doesn't scroll");
  const groups = $$("#settings-popup .sp-label").map(txt);
  ok(JSON.stringify(groups) === '["Backup","Preferences","About"]', "Settings groups: " + JSON.stringify(groups));
  const sitems = $$("#settings-popup .sp-t").map(txt);
  ok(JSON.stringify(sitems) === '["Encryption","Currency","Year format","Customise Home","AI provider","Privacy policy","About Vault"]', "Settings items: " + JSON.stringify(sitems));
  ok(["mob-enc-sub", "mob-currency-sub", "mob-yearmode-sub", "mob-ai-sub"].every(id => d.getElementById(id)?.closest("#settings-popup")), "live sub-labels moved with them");
  E(`updateYearModeUI && updateYearModeUI()`);
  ok(/Calendar year|Financial/.test(txt(d.getElementById("mob-yearmode-sub"))), "year format sub-label still updates");
  // A setting opens on top of Settings; closing it comes back to Settings.
  [...d.querySelectorAll("#settings-popup .sp-item")].find(b => /Currency/.test(txt(b))).click();
  ok(isOpen("currency-popup") && isOpen("settings-popup"), "Currency opens over Settings");
  await goBack();
  ok(!isOpen("currency-popup") && isOpen("settings-popup"), "Back closes the popup first");
  await goBack();
  ok(!isOpen("settings-popup") && $("#menu-sheet").classList.contains("open"), "…then Settings, back to the Menu it came from (v6.16.5)");
  await goBack();
  ok(!$("#menu-sheet").classList.contains("open") && !d.documentElement.classList.contains("vp-lock"), "…then the Menu");
  E(`closeSheets(); openSettingsPage()`);
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok(!isOpen("settings-popup"), "Escape closes Settings");

  // ── N5: the period picker is gone (v8.0.0): Dates is a row in the Filters sheet,
  // tested in v8_0_0.test.js ─────────────────────────────────────────────
  ok(!$("#year-sheet") && !$("#fy-title") && E(`typeof openPeriodSheet`) === "undefined", "no period picker");
  E(`switchTab("all"); asOpenSheet();`);
  ok(!!$("#as-s-dates") && $$("#as-s-dates optgroup").length === E(`Object.keys(data).length`) + 2, "Dates in Filters: Quick, one section per year, Custom");
  E(`asCloseSheet(false)`);
  ok(!/ysheet|confirmYsheetYear|renderYearSheet|menu-tx-|toggleMenuTxDropdown|toggleDesktopSettingsDropdown/.test(html), "the old Years sheet and menu dropdowns are gone (N12)");

  // ── N11: desktop ─────────────────────────────────────────────────────────
  ok(JSON.stringify($$(".side-nav-btn").map(txt)) === '["Home","Transactions","Charts"]', "sidebar screens (v8.0.0)");
  $('.side-nav-btn[data-nav="charts"]').click();
  ok(E("activeTab") === "charts" && $('.side-nav-btn[data-nav="charts"]').classList.contains("nav-on"), "sidebar opens Charts and highlights it");
  const dsec = $$("#desktop-menu .dmenu-section-label").map(txt);
  ok(JSON.stringify(dsec) === '["Manage","Data","Settings"]', "desktop Menu sections: " + JSON.stringify(dsec));
  ok(!$("#desktop-menu [data-nav]"), "the desktop Menu has no screens (they're in the sidebar)");
  E(`toggleDesktopMenu()`);
  [...d.querySelectorAll("#desktop-menu .dmenu-btn")].find(b => /Settings/.test(txt(b))).click();
  ok(isOpen("settings-popup") && !$("#desktop-menu").classList.contains("open"), "desktop Settings opens the same panel");
  E(`closeSettingsPage()`);

  // ── Nothing still points at the old layout ───────────────────────────────
  ok(!/Tap Add New|Menu → Encryption|Menu → Home|floating Menu/.test(html), "no wording points at the floating buttons or old menu paths");

  // ── Naming (v8.0.0: Search became Transactions) ──────────────────────────
  ok(txt($(".as-title")) === "Transactions", "the page is called Transactions");
  const visible = html.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  ok(!/Advanced [Ss]earch/.test(visible), "no visible text says Advanced Search");

  const vf = d.getElementById("version-footer").textContent.trim();
  ok((([M, m, p]) => M > 6 || (M === 6 && (m > 14 || (m === 14 && p >= 0))))((vf.match(/^v(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number)) && html.includes(`Version ${vf}<`), "version v6.14.0 or later, About matches: " + vf);

  console.log(`layout: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
  errors.slice(0, 5).forEach(e => console.log("PAGE ERROR:", e.slice(0, 300)));
  process.exit(fail || errors.length ? 1 : 0);
}, 500);
