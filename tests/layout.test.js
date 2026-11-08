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
  ok(JSON.stringify(tabs) === '["Home","Transactions","Add transaction","Search","Menu"]', "bar: Home · Transactions · ＋ · Search · Menu: " + JSON.stringify(tabs));
  $('#tabbar [data-nav="list"]').click();
  ok(E("activeTab") === "all", "Transactions opens the list");
  E(`switchTab("removed")`); $('#tabbar [data-nav="home"]').click();
  ok(E("activeTab") === "home", "Home opens Home");
  $('#tabbar [data-nav="list"]').click();
  ok(E("activeTab") === "removed", "Transactions returns to the list tab you were on");
  let scrolled = 0; w.scrollTo = () => { scrolled++; };
  $('#tabbar [data-nav="list"]').click();
  ok(E("activeTab") === "removed" && scrolled === 1, "tapping the tab you're on scrolls to the top");
  $('#tabbar [data-nav="report"]').click();
  ok(E("activeTab") === "report", "Search opens Search");
  $("#tb-add").click();
  ok($("#add-sheet").classList.contains("open"), "＋ opens the Add sheet");
  E(`closeSheets()`);
  $("#tb-menu").click();
  ok($("#menu-sheet").classList.contains("open"), "Menu opens the Menu sheet");
  $("#tb-menu").click();
  ok(!$("#menu-sheet").classList.contains("open"), "tapping Menu again closes it");
  ok(/#main \{ padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom/.test(html), "the page leaves room under the bar");
  ok(/#vh-search-corner \{ display: none; \}/.test(html), "Home's own search icon is hidden on a phone");

  // ── N6: Menu ─────────────────────────────────────────────────────────────
  const sections = $$("#menu-sheet .menu-section-label").map(txt);
  ok(JSON.stringify(sections) === '["View","Manage","Data","Settings"]', "Menu sections: " + JSON.stringify(sections));
  const items = $$("#menu-sheet .menu-item-label").map(txt);
  ok(JSON.stringify(items) === '["Charts","Recurring","Accounts","Goals","Import","Export spreadsheet","Print","Settings","Holdings Soon"]', "Menu items: " + JSON.stringify(items));
  ok(!$("#menu-tx-dropdown") && !$("#menu-settings-dropdown"), "no dropdowns inside the Menu");
  ok(["mob-recur-manage-sub", "mob-accounts-sub", "menu-goals-sub", "mob-export-sub", "mob-print-sub"].every(id => d.getElementById(id)), "Menu keeps its live sub-labels");
  ok(d.querySelectorAll('[id="mob-accounts-sub"]').length === 1, "IDs are unique");

  // ── N6: Settings page ────────────────────────────────────────────────────
  E(`openMenuSheet()`);
  [...d.querySelectorAll("#menu-sheet .menu-item-btn")].find(b => /Settings/.test(txt(b))).click();
  ok($("#settings-page").classList.contains("open") && !$("#menu-sheet").classList.contains("open"), "Settings opens its page and closes the Menu");
  ok(d.documentElement.classList.contains("sp-lock"), "the page behind doesn't scroll");
  const groups = $$("#settings-page .sp-label").map(txt);
  ok(JSON.stringify(groups) === '["Backup","Preferences","About"]', "Settings groups: " + JSON.stringify(groups));
  const sitems = $$("#settings-page .sp-t").map(txt);
  ok(JSON.stringify(sitems) === '["Save & backup","Encryption","Currency","Year format","Customise Home","AI provider","Privacy policy","About Vault"]', "Settings items: " + JSON.stringify(sitems));
  ok(["mob-enc-sub", "mob-currency-sub", "mob-yearmode-sub", "mob-ai-sub"].every(id => d.getElementById(id)?.closest("#settings-page")), "live sub-labels moved with them");
  E(`updateYearModeUI && updateYearModeUI()`);
  ok(/Calendar year|Financial/.test(txt(d.getElementById("mob-yearmode-sub"))), "year format sub-label still updates");
  // A setting opens on top of the page; closing it comes back to Settings.
  [...d.querySelectorAll("#settings-page .sp-item")].find(b => /Currency/.test(txt(b))).click();
  ok(isOpen("currency-popup") && $("#settings-page").classList.contains("open"), "Currency opens over Settings");
  w.history.back(); await sleep(60);
  ok(!isOpen("currency-popup") && $("#settings-page").classList.contains("open"), "Back closes the popup first");
  w.history.back(); await sleep(60);
  ok(!$("#settings-page").classList.contains("open") && !d.documentElement.classList.contains("sp-lock"), "…then Settings");
  E(`openSettingsPage()`);
  $("#settings-page .sp-back").click();
  ok(!$("#settings-page").classList.contains("open") && $("#menu-sheet").classList.contains("open"), "‹ Back returns to the Menu");
  E(`closeSheets(); openSettingsPage()`);
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok(!$("#settings-page").classList.contains("open"), "Escape closes Settings");

  // ── N5: period picker ────────────────────────────────────────────────────
  E(`switchTab("all"); activeYear = "all-years"; activeMonth = null; activeAccountFilter = "ub"; render();`);
  $("#fy-title").click();
  ok($("#year-sheet").classList.contains("open"), "tapping the list title opens the period picker");
  const chips = $$("#ps-body .ps-chip").map(txt);
  ok(JSON.stringify(chips) === '["This month","Last month","This year","All"]', "quick picks: " + JSON.stringify(chips));
  ok($$("#ps-body .ps-year").length === E(`Object.keys(data).length`), "one row per year");
  ok(txt($("#ps-body .ps-year .ps-row")).startsWith("2026"), "newest year first");
  ok($$("#ps-body .ps-months button").length > 0, "the latest year's months are open");
  $$("#ps-body .ps-chip").find(b => txt(b) === "This month").click();
  ok(E("activeYear") === "2026" && E("activeMonth") === "2026-11" && !$("#year-sheet").classList.contains("open"), "This month picks November 2026 and closes");
  ok(E("activeAccountFilter") === "ub", "…keeping the account you were looking at");
  ok(/November 2026/.test(txt($("#fy-title"))), "the title says November 2026: " + txt($("#fy-title")));
  E(`openPeriodSheet()`);
  ok(!!$('#ps-body .ps-chip.on'), "the current pick is highlighted");
  $('#ps-body [data-exp="2025"]').click();
  const m25 = $$("#ps-body .ps-months button").map(txt);
  ok(m25[0] === "Nov" && m25.length === 2, "expanding 2025 shows its months: " + JSON.stringify(m25));
  $$("#ps-body .ps-months button").find(b => txt(b) === "Dec").click();
  ok(E("activeYear") === "2025" && E("activeMonth") === "2025-12", "picking Dec 2025 shows it");
  E(`openPeriodSheet()`); $('#ps-body .ps-row[data-y="all-years"]').click();
  ok(E("activeYear") === "all-years" && E("activeMonth") === null, "All transactions");
  E(`switchTab("home"); openPeriodSheet()`); $('#ps-body .ps-year .ps-row').click();
  ok(E("activeTab") === "all" && E("activeYear") === "2026", "picking a period from elsewhere opens the list");
  w.innerWidth = 1280; E(`closeSheets(); openPeriodSheet()`);
  ok(!$("#year-sheet").classList.contains("open"), "desktop picks periods in the sidebar instead");
  w.innerWidth = 390;
  ok(!/ysheet|confirmYsheetYear|renderYearSheet|menu-tx-|toggleMenuTxDropdown|toggleDesktopSettingsDropdown/.test(html), "the old Years sheet and menu dropdowns are gone (N12)");

  // ── N11: desktop ─────────────────────────────────────────────────────────
  ok(JSON.stringify($$(".side-nav-btn").map(txt)) === '["Home","Search","Charts"]', "sidebar screens");
  $('.side-nav-btn[data-nav="charts"]').click();
  ok(E("activeTab") === "charts" && $('.side-nav-btn[data-nav="charts"]').classList.contains("nav-on"), "sidebar opens Charts and highlights it");
  const dsec = $$("#desktop-menu .dmenu-section-label").map(txt);
  ok(JSON.stringify(dsec) === '["Manage","Data","Settings"]', "desktop Menu sections: " + JSON.stringify(dsec));
  ok(!$("#desktop-menu [data-nav]"), "the desktop Menu has no screens (they're in the sidebar)");
  E(`toggleDesktopMenu()`);
  [...d.querySelectorAll("#desktop-menu .dmenu-btn")].find(b => /Settings/.test(txt(b))).click();
  ok($("#settings-page").classList.contains("open") && !$("#desktop-menu").classList.contains("open"), "desktop Settings opens the same page");
  E(`closeSettingsPage()`);

  // ── Nothing still points at the old layout ───────────────────────────────
  ok(!/Tap Add New|Menu → Encryption|Menu → Home|floating Menu/.test(html), "no wording points at the floating buttons or old menu paths");

  // ── Search naming ────────────────────────────────────────────────────────
  ok(txt($(".as-title")) === "Search", "the page is called Search");
  const visible = html.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  ok(!/Advanced [Ss]earch/.test(visible), "no visible text says Advanced Search");

  const vf = d.getElementById("version-footer").textContent.trim();
  ok(/^v6\.(1[4-9]|[2-9]\d)\.\d+$/.test(vf) && html.includes(`Version ${vf}<`), "version v6.14.0 or later, About matches: " + vf);

  console.log(`layout: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
  errors.slice(0, 5).forEach(e => console.log("PAGE ERROR:", e.slice(0, 300)));
  process.exit(fail || errors.length ? 1 : 0);
}, 500);
