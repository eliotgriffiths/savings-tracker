// v6.16.5 regression tests (9 Nov 2026):
// Every tray opened from another tray has ‹ (and Back) to go back one layer; ✕ still closes;
// popups open with one motion (no animation alongside the transition); Back closes the
// Menu/Add/period trays again; closing About/Privacy no longer closes the tray under it.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_16_5.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
const FIXED = new Date("2026-11-09T07:30:00+10:00").getTime();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
const E = s => w.eval(s);
const $ = id => d.getElementById(id);
const isOpen = id => ["menu-sheet", "year-sheet", "add-sheet"].includes(id) ? $(id).classList.contains("open") : E(`popupIsOpen(document.getElementById(${JSON.stringify(id)}))`);
const back = id => $(id).querySelector(".vp-head > .vp-back");
const backShown = id => !!back(id) && !back(id).hidden;
const tap = async el => { el.click(); await sleep(120); };   // some rows open after a short delay
const run = async s => { E(s); await sleep(0); };
const menuRow = t => [...d.querySelectorAll("#menu-sheet .menu-item-btn")].find(b => b.textContent.includes(t));
const spRow = t => [...d.querySelectorAll("#settings-popup .sp-item")].find(b => b.textContent.includes(t));
const resetAll = async () => { E(`closeSheets(); document.querySelectorAll(".pop-anim.vp:not(.hidden)").forEach(e => e.classList.add("hidden"))`); await sleep(800); };

setTimeout(async () => {
  try {
    E(SEED); E("render()");
    $("welcome-modal")?.classList.add("hidden");
    await sleep(0);

    // ── One motion on open ─────────────────────────────────────────────────
    const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");
    ok(/\.pop-anim\.vp:not\(\.hidden\), \.pop-anim\.vp:not\(\.hidden\) \.vp-panel \{ animation: none !important; \}/.test(css),
      "popups open without the extra animation (it ran alongside the transition and stuttered)");
    ok(/\.pop-anim\.vp:not\(\.vp-alert\):not\(\.hidden\) \.vp-panel \{ animation: none !important;\s*transition: transform 0\.28s cubic-bezier\(0\.2, 0\.8, 0\.2, 1\) !important; \}/.test(css),
      "on a phone a tray slides up with the Menu tray's transition");
    ok(/\.pop-anim\.vp:not\(\.vp-alert\):not\(\.hidden\) \.vp-panel\.vp-drag \{ transition: none !important; \}/.test(css),
      "…and a drag still switches it off (outranks the open rule)");
    ok(css.lastIndexOf(".pop-anim.vp:not(.hidden), .pop-anim.vp:not(.hidden) .vp-panel { animation: none") > css.lastIndexOf("animation: vpUp 0.28s"),
      "the no-animation rule comes after the old vpUp rule, so it wins");
    ok(/\.pop-anim\.hidden \{\s*display: flex !important;/.test(css), "hidden popups stay laid out, so the transition always fires");

    // ── Menu › tray › ‹ ────────────────────────────────────────────────────
    for (const [row, id] of [["Recurring", "recurring-modal"], ["Accounts", "accounts-modal"], ["Save & backup", "setup-modal"], ["Import", "import-popup"], ["Settings", "settings-popup"]]) {
      await resetAll();
      await run("openMenuSheet()");
      await tap(menuRow(row));
      ok(isOpen(id) && !isOpen("menu-sheet"), `Menu › ${row} opens it`);
      ok(backShown(id) && back(id).getAttribute("aria-label") === "Back to Menu", `${row} shows ‹ Back to Menu`);
      ok(back(id).parentElement.firstElementChild === back(id), `${row}: ‹ is first in the title row`);
      await tap(back(id));
      ok(!isOpen(id) && isOpen("menu-sheet"), `${row}: ‹ goes back to the Menu`);
    }
    ok(d.querySelectorAll("#settings-popup .vp-back").length === 1, "only one ‹ per tray, however often it opens");

    // ── Settings › popup › ‹ (Settings stays under it) ──────────────────────
    for (const [row, id] of [["Currency", "currency-popup"], ["Encryption", "enc-menu-popup"], ["Year format", "year-format-popup"], ["About Vault", "about-popup"], ["Privacy", "privacy-popup"]]) {
      await resetAll();
      await run("openSettingsPage()");
      await tap(spRow(row));
      ok(isOpen(id) && isOpen("settings-popup"), `Settings › ${row} opens over Settings`);
      ok(backShown(id) && back(id).getAttribute("aria-label") === "Back to Settings", `${row} shows ‹ Back to Settings`);
      await tap(back(id)); await sleep(30);
      ok(!isOpen(id) && isOpen("settings-popup"), `${row}: ‹ goes back to Settings`);
    }

    // ── A tray that closes to open another (Import › Set up AI) ─────────────
    await resetAll();
    await run("openImportPopup()");
    const setupAI = [...d.querySelectorAll("#import-popup button")].find(b => /Set up AI/.test(b.textContent));
    if (setupAI) {
      await tap(setupAI);
      ok(isOpen("ai-provider-popup") && !isOpen("import-popup"), "Import › Set up AI swaps the trays");
      ok(backShown("ai-provider-popup") && /Back to Import/.test(back("ai-provider-popup").getAttribute("aria-label")), "AI provider shows ‹ Back to Import transactions");
      await tap(back("ai-provider-popup"));
      ok(isOpen("import-popup") && !isOpen("ai-provider-popup"), "‹ reopens Import");
    } else ok(false, "Import's Set up AI button found");

    // ── Three layers, ‹ ‹ ‹ ─────────────────────────────────────────────────
    await resetAll();
    await run("openMenuSheet()"); await tap(menuRow("Settings")); await tap(spRow("Encryption"));
    const setPw = [...d.querySelectorAll("#enc-menu-popup button")].find(b => /Set password/.test(b.textContent));
    await tap(setPw);
    ok(isOpen("enc-set-popup") && isOpen("enc-menu-popup") && isOpen("settings-popup"), "Menu › Settings › Encryption › Set password");
    ok(/Back to Encryption/.test(back("enc-set-popup").getAttribute("aria-label")), "Set password: ‹ Back to Encryption");
    await tap(back("enc-set-popup"));   ok(!isOpen("enc-set-popup") && isOpen("enc-menu-popup"), "‹ → Encryption");
    await tap(back("enc-menu-popup"));  ok(!isOpen("enc-menu-popup") && isOpen("settings-popup"), "‹ → Settings");
    ok(backShown("settings-popup"), "…and Settings still has its ‹ Back to Menu");
    await tap(back("settings-popup"));  ok(!isOpen("settings-popup") && isOpen("menu-sheet"), "‹ → Menu");

    // ── Back (history / swipe-back) steps the same way ──────────────────────
    await tap(menuRow("Settings")); await tap(spRow("Currency"));
    ok(E("navCloseTop()") === true && !isOpen("currency-popup") && isOpen("settings-popup"), "Back: Currency → Settings");
    await sleep(0);
    ok(E("navCloseTop()") === true && !isOpen("settings-popup") && isOpen("menu-sheet"), "Back: Settings → Menu");
    await sleep(0);
    ok(E("navCloseTop()") === true && !isOpen("menu-sheet"), "Back: closes the Menu");

    // ── ✕ still just closes ─────────────────────────────────────────────────
    await resetAll();
    await run("openMenuSheet()"); await tap(menuRow("Recurring"));
    await tap($("recurring-modal").querySelector(".modal-close"));
    ok(!isOpen("recurring-modal") && !isOpen("menu-sheet"), "✕ closes without reopening the Menu");

    // ── A form with typed input refuses ‹ like it refuses Back ──────────────
    await resetAll();
    await run("openMenuSheet()"); await tap(menuRow("Settings")); await tap(spRow("Encryption")); await tap(setPw);
    $("enc-set-popup").dataset.dirty = "1";
    await tap(back("enc-set-popup"));
    ok(isOpen("enc-set-popup"), "‹ on a typed-in form stays (Tap Cancel to leave without saving)");
    delete $("enc-set-popup").dataset.dirty;

    // ── No parent, no ‹ ─────────────────────────────────────────────────────
    await resetAll();
    await run("openGoalsModal()");
    ok(isOpen("goals-modal") && !backShown("goals-modal"), "Goals opened from Home: no ‹");
    ok(E("navCloseTop()") === true && !isOpen("goals-modal") && !isOpen("menu-sheet"), "…and Back just closes it");
    await resetAll();
    w.innerWidth = 1200;
    await run("openSettingsPage()"); await tap(spRow("Currency"));
    ok(!backShown("currency-popup"), "wide screen: no ‹");
    await resetAll();
    w.innerWidth = 390;

    // ── About/Privacy closing doesn't close the tray under them ─────────────
    await resetAll();
    await run("openSettingsPage()"); await tap(spRow("About Vault"));
    ok(w.location.hash === "#about", "About adds #about");
    await run("closeAbout()"); await sleep(80);
    ok(!isOpen("about-popup") && isOpen("settings-popup"), "closing About leaves Settings open (its history step isn't a Back press)");
    await tap(spRow("Privacy")); await sleep(20);
    await run("closePrivacy()"); await sleep(80);
    ok(!isOpen("privacy-popup") && isOpen("settings-popup"), "…and the same for Privacy");
    await resetAll();

    // ── Back closes the trays (a hidden overlay's inner box used to count as open) ──
    ok(E("topOpenPopup()") === null, "nothing counts as an open popup at rest (was #pdf-preview-modal)");
    await run("openMenuSheet()");   ok(E("navCloseTop()") === true && !isOpen("menu-sheet"), "Back closes the Menu");
    await run("openAddSheet()");    ok(E("navCloseTop()") === true && !isOpen("add-sheet"), "Back closes the Add tray");
    await run("openPeriodSheet()"); ok(E("navCloseTop()") === true && !isOpen("year-sheet"), "Back closes the period picker");

    // ── Save & backup's own back buttons look like every tray's ‹ ───────────
    const smodBacks = [...d.querySelectorAll(".smod-back")];
    ok(smodBacks.length === 5, "Save & backup's four panels and Cloud service each have a back button: " + smodBacks.length);
    ok(smodBacks.every(b => b.classList.contains("vp-back") && b.querySelector("svg path") && b.textContent.trim() === ""), "…the ‹ chevron, no \"Back\" text");
    ok(smodBacks.every(b => b.getAttribute("aria-label") === "Back to Save & backup"), "…labelled Back to Save & backup");
    ok(!/‹ Back/.test(html), "no \"‹ Back\" text left anywhere");
    ok(/\.smod-back\.vp-back \{ color: var\(--text-2\);/.test(css), "…in --text-2, not the old gold");

    // ── Look ────────────────────────────────────────────────────────────────
    ok(/\.vp-back \{ width: 34px; height: 34px;/.test(css), "‹ is the ✕'s size");
    ok(/\.vp-back\[hidden\] \{ display: none !important; \}/.test(css), "hidden ‹ takes no space");
    ok(back("settings-popup").querySelector("svg path") && !/#[0-9a-f]{3,6}/i.test(back("settings-popup").innerHTML), "‹ is drawn in currentColor");

    // Version
    const ver = t => (t.match(/v(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
    const txt = el => (el && el.textContent || "").trim();
    const a = ver(txt($("about-version-meta"))), f = ver(txt($("version-footer")));
    const atLeast = (v, x) => v[0] !== x[0] ? v[0] > x[0] : v[1] !== x[1] ? v[1] > x[1] : v[2] >= x[2];
    ok(atLeast(a, [6, 16, 5]), "version is v6.16.5 or later");
    ok(a.join(".") === f.join("."), "About and footer show the same version");
  } catch (e) { ok(false, "threw: " + (e && e.stack || e)); }

  ok(errors.length === 0, "no page errors: " + errors.slice(0, 3).join(" | "));
  console.log(`v6.16.5: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 1500);
