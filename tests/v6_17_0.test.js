// v6.17.0 regression tests (9 Nov 2026): on a phone, trays move sideways between layers
// (spec: claude/spec-tray-navigation.md). Going deeper slides in from the right with a
// fade-through, ‹ and Back reverse it, a stand-in sheet edge glides between heights;
// ✕, swipe and an outside tap close every layer. Panels inside a tray (Recurring › History,
// Save & backup's storage panels) move the same way. Computers keep separate cards.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_17_0.test.js
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
const SETTLE = 460;   // the 0.36 s move plus its clean-up

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
const panel = id => id === "menu-sheet" ? $(id) : $(id).querySelector(".vp-panel");
const isOpen = id => id === "menu-sheet" ? $(id).classList.contains("open") : E(`popupIsOpen(document.getElementById(${JSON.stringify(id)}))`);
const run = async s => { E(s); await sleep(0); };
const tap = async el => { el.click(); await sleep(0); };
const menuRow = t => [...d.querySelectorAll("#menu-sheet .menu-item-btn")].find(b => b.textContent.includes(t));
const spRow = t => [...d.querySelectorAll("#settings-popup .sp-item")].find(b => b.textContent.includes(t));
const shown = id => !$(id) ? "-" : $(id).style.display;
const inline = (el, prop) => prop === "background" ? el.style.getPropertyValue("background-color") : el.style.getPropertyValue(prop);   // jsdom keeps the shorthand as background-color
const clean = id => VP_PROPS.every(k => !inline(panel(id), k));
const VP_PROPS = ["transform", "opacity", "transition", "clip-path"];
const resetAll = async () => { E(`closeSheets(); document.querySelectorAll(".pop-anim.vp:not(.hidden)").forEach(e => e.classList.add("hidden")); closeRecurHistory();`); await sleep(SETTLE); };

setTimeout(async () => {
  try {
    E(SEED); E("render()");
    $("welcome-modal")?.classList.add("hidden");
    await sleep(0);
    const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");

    // ── The motion, as approved ────────────────────────────────────────────
    ok(/:root \{ --nav-dur: 0\.36s; --nav-ease: cubic-bezier\(0\.4, 0, 0\.2, 1\); --nav-out: 0\.11s; --nav-in: 0\.25s; \}/.test(css), "Gentle: 0.36 s, soft start; fade out 0.11 s, fade in 0.25 s after it");
    ok(/prefers-reduced-motion: reduce\) \{ :root \{ --nav-dur: 0s; --nav-out: 0s; --nav-in: 0s; \}/.test(css), "Reduce Motion: no sideways motion");
    ok(/#vp-ghost \{[^}]*background: var\(--bg2\);[^}]*border-radius: 18px 18px 0 0;[^}]*transition: height var\(--nav-dur\) var\(--nav-ease\);/.test(css), "a stand-in sheet edge glides between heights");
    ok(/#vp-ghost::before \{[^}]*width: 36px; height: 4px;/.test(css), "…and carries the handle");
    ok(/\.vp-nav \.vp-grab::before, \.vp-nav > \.sheet-handle \{ visibility: hidden; \}/.test(css), "the moving trays hide their own handles");
    ok(/\.vp-nav \{ background: transparent !important; border-color: transparent !important;/.test(css), "…and their card edges, so it reads as one sheet");
    ok(/translateX\(\$\{push \? "28%" : "-10%"\}\)/.test(html) && /translateX\(\$\{push \? "-10%" : "28%"\}\)/.test(html), "in from 28 %, out by 10 % (and the reverse going back)");

    // ── Menu › Recurring: sideways in ───────────────────────────────────────
    await run("openMenuSheet()");
    await tap(menuRow("Recurring"));
    ok(isOpen("recurring-modal") && !isOpen("menu-sheet"), "Menu › Recurring");
    ok(shown("vp-ghost") === "block" && shown("vp-dim") === "block", "during the move: one edge and one dim");
    ok(/translateX\(-10%\)/.test(inline($("menu-sheet"), "transform")) && inline($("menu-sheet"), "opacity") === "0", "the Menu moves left and fades out");
    ok(inline(panel("recurring-modal"), "transform") === "none" && inline(panel("recurring-modal"), "opacity") === "1", "Recurring moves in to its place");
    ok(/opacity var\(--nav-in\) ease-out var\(--nav-out\)/.test(inline(panel("recurring-modal"), "transition")), "…fading in only after the Menu has faded out (fade-through)");
    ok(/opacity var\(--nav-out\) ease-in/.test(inline($("menu-sheet"), "transition")), "…the Menu fades out first, fast");
    ok(inline($("recurring-modal"), "background") === "transparent", "the tray's own dim is off during the move");
    ok($("sheet-overlay").style.visibility === "hidden", "…and so is the Menu's");
    await sleep(SETTLE);
    ok(shown("vp-ghost") === "none" && shown("vp-dim") === "none", "after the move the edge and dim go");
    ok(clean("recurring-modal") && clean("menu-sheet") && !inline($("recurring-modal"), "background") && !$("sheet-overlay").style.visibility, "…and nothing is left on the trays");

    // ── Recurring › History › a date › ‹ ‹ ‹ ────────────────────────────────
    const histBtn = [...d.querySelectorAll("#recurring-modal button")].find(b => /History/.test(b.textContent) && b.offsetParent !== undefined);
    await tap(histBtn);
    ok($("recur-history-panel").classList.contains("open") && d.querySelector("#recurring-modal .modal-box").classList.contains("rh-on"), "History slides in inside the tray, the list moves the other way");
    ok(/#recurring-modal \.modal-box\.rh-on > :not\(#recur-history-panel\):not\(\.vp-grab\) \{\s*transform: translateX\(-10%\); opacity: 0;/.test(css), "…the list: 10 % left, faded out");
    ok(/#recur-history-panel \{[^}]*transform: translateX\(28%\); opacity: 0; visibility: hidden;/.test(css), "…History: from 28 %, faded in");
    const hb = $("recur-history-panel").querySelector(".recur-history-back");
    ok(hb.classList.contains("vp-back") && hb.querySelector("svg path") && hb.textContent.trim() === "", "History's ‹ is the same chevron");
    ok($("recur-history-panel").querySelector(".modal-close.rh-close"), "History has a ✕");
    const row = [...d.querySelectorAll("#recur-history-body > *")].find(r => r.style.cursor === "pointer");
    if (row) {
      await tap(row);
      ok(isOpen("tx-popup"), "a date opens Edit");
      ok($("recur-history-panel").classList.contains("open"), "…over History, which stays put");
      await sleep(SETTLE);
      ok($("recurring-modal").dataset.vpUnder === "1" && inline(panel("recurring-modal"), "opacity") === "0", "Recurring waits under Edit, faded out");
      ok(inline($("tx-popup"), "background") === "transparent", "Edit keeps its own dim off (the tray under it dims the page)");
      ok(E("navCloseTop()") === true && !isOpen("tx-popup") && isOpen("recurring-modal"), "Back: Edit → History");
      await sleep(SETTLE);
      ok($("recur-history-panel").classList.contains("open") && !$("recurring-modal").dataset.vpUnder && clean("recurring-modal"), "…History is showing again");
    } else ok(false, "a History date to tap");
    ok(E("navCloseTop()") === true && !$("recur-history-panel").classList.contains("open") && isOpen("recurring-modal"), "Back: History → the list (inside the tray)");
    await sleep(SETTLE);
    ok(E("navCloseTop()") === true && !isOpen("recurring-modal") && isOpen("menu-sheet"), "Back: Recurring → Menu, sideways");
    ok(/translateX\(-10%\)/.test(d.getElementById("menu-sheet").style.getPropertyValue("transform")) === false, "the Menu comes back in from the left");
    await sleep(SETTLE);
    ok(clean("menu-sheet"), "…and settles");
    await resetAll();

    // History's ✕ closes the tray
    await run("openRecurringModal()"); await tap([...d.querySelectorAll("#recurring-modal button")].find(b => /History/.test(b.textContent)));
    await tap($("recur-history-panel").querySelector(".rh-close"));
    ok(!isOpen("recurring-modal"), "History's ✕ closes Recurring");
    await resetAll();

    // ── Settings › Currency: stacked, then close-all and auto-back ─────────
    await run("openMenuSheet()"); await tap(menuRow("Settings")); await sleep(SETTLE);
    await tap(spRow("Currency")); await sleep(SETTLE);
    ok(isOpen("currency-popup") && isOpen("settings-popup") && $("settings-popup").dataset.vpUnder === "1", "Settings › Currency: Settings waits under it");
    await tap($("currency-popup").querySelector(".modal-close")); await sleep(20);
    ok(!isOpen("currency-popup") && !isOpen("settings-popup"), "✕ closes every layer");
    await sleep(SETTLE);
    await run("openSettingsPage()");
    ok(clean("settings-popup") && !$("settings-popup").dataset.vpUnder && !inline($("settings-popup"), "background"), "reopened later, Settings has nothing left over");
    await tap(spRow("Currency")); await sleep(SETTLE);
    await run("closeCurrencyPopup()");
    ok(!isOpen("currency-popup") && isOpen("settings-popup") && !$("settings-popup").dataset.vpUnder, "closed by its own button, Currency slides back to Settings");
    await sleep(SETTLE);
    ok(clean("settings-popup"), "…and Settings is fully showing");
    await tap(spRow("Currency")); await sleep(SETTLE);
    E(`document.getElementById("currency-popup").click()`); await sleep(20);
    ok(!isOpen("currency-popup") && !isOpen("settings-popup"), "an outside tap closes every layer");
    await resetAll();
    await run("openSettingsPage()"); await tap(spRow("Encryption")); await sleep(SETTLE);
    ok(E(`vpCloseAll(document.getElementById("enc-menu-popup"))`) === true && !isOpen("enc-menu-popup") && !isOpen("settings-popup"), "swipe down (vpCloseAll) closes every layer");
    ok(/vpSwipe\(panel, \[grab, panel\.querySelector\("\.vp-head"\)\]\.filter\(Boolean\), \(\) => vpCloseAll\(el\)\);/.test(html), "…the swipe uses it");
    await resetAll();

    // ── Save & backup's storage panels ─────────────────────────────────────
    await run("openMenuSheet()"); await tap(menuRow("Save & backup")); await sleep(SETTLE);
    ok(isOpen("setup-modal"), "Menu › Save & backup");
    E(`openSmodPanel("nas")`);
    ok(getComputedStyle0("smod-main") !== "none" && /translateX\(-10%\)/.test(inline($("smod-main"), "transform")), "a storage panel: the list moves left and fades first");
    await sleep(SETTLE);
    ok(d.querySelector(".smod-panel.open") && $("smod-main").style.display === "none", "…then the panel is showing");
    ok(E("navCloseTop()") === true && isOpen("setup-modal"), "Back steps out of the panel, inside the tray");
    await sleep(SETTLE);
    ok(!d.querySelector(".smod-panel.open") && $("smod-main").style.display === "", "…back on the list");
    E(`document.querySelector('#setup-modal .smod-card[onclick*="Cloud"], #setup-modal [onclick*="openCloudPicker"]')?.click()`); await sleep(SETTLE);
    if (isOpen("cloud-picker-popup")) {
      await tap($("cloud-picker-popup").querySelector(".modal-close")); await sleep(20);
      ok(!isOpen("cloud-picker-popup") && !isOpen("setup-modal"), "Cloud service's ✕ closes everything (no more reopening Save & backup)");
    } else ok(/onclick="closeCloudPicker\(false\)"/.test(html), "Cloud service's ✕ passes false (closes everything)");
    await resetAll();

    // ── Menu rows open straight away (they waited 50 ms) ────────────────────
    ok(!/setTimeout\(openAccountsModal,50\)|setTimeout\(openGoalsModal,50\)/.test(html), "Accounts and Goals open from the Menu straight away");

    // ── A computer keeps separate cards ─────────────────────────────────────
    w.innerWidth = 1200;
    await run("openSettingsPage()"); await tap(spRow("Currency")); await sleep(SETTLE);
    ok(isOpen("currency-popup") && isOpen("settings-popup") && !$("settings-popup").dataset.vpUnder && clean("settings-popup"), "wide screen: Currency opens as a card over Settings, nothing moves sideways");
    ok(shown("vp-ghost") !== "block", "…no stand-in edge");
    await tap($("currency-popup").querySelector(".modal-close")); await sleep(20);
    ok(!isOpen("currency-popup") && isOpen("settings-popup"), "…and ✕ closes just that card");
    w.innerWidth = 390;
    await resetAll();

    // Version
    const ver = t => (t.match(/v(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
    const txt = el => (el && el.textContent || "").trim();
    const a = ver(txt($("about-version-meta"))), f = ver(txt($("version-footer")));
    const atLeast = (v, x) => v[0] !== x[0] ? v[0] > x[0] : v[1] !== x[1] ? v[1] > x[1] : v[2] >= x[2];
    ok(atLeast(a, [6, 17, 0]), "version is v6.17.0 or later");
    ok(a.join(".") === f.join("."), "About and footer show the same version");
  } catch (e) { ok(false, "threw: " + (e && e.stack || e)); }

  ok(errors.length === 0, "no page errors: " + errors.slice(0, 3).join(" | "));
  console.log(`v6.17.0: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 1500);
function getComputedStyle0(id) { return dom.window.getComputedStyle(dom.window.document.getElementById(id)).display; }
