// v6.17.1 regression tests (11 Nov 2026, queue-v6.17.1.md):
// 1. On a phone a tray opened from a screen slides up solid: only its dim fades (the whole
//    overlay used to fade, so the tray faded in as it rose).
// 2. Things that appear inside a tray fold: Backup status' legend, Goals' and Accounts' add
//    forms, and the error lines in the goal form, Set password and Unlock.
// 3. Goals › Target date: the date input sits over the calendar icon, so a tap opens iOS's picker.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_17_1.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
const FIXED = new Date("2026-11-11T07:30:00+10:00").getTime();
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
    w.Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
  },
});
const w = dom.window, d = w.document;
const E = s => w.eval(s);
const $ = id => d.getElementById(id);
const folded = id => $(id).classList.contains("folded");
const run = async s => { E(s); await sleep(0); };

setTimeout(async () => {
  try {
    E(SEED); E("render()");
    $("welcome-modal")?.classList.add("hidden");
    await sleep(0);
    const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");

    // ── 1. The tray slides up solid; only the dim fades ─────────────────────────
    const phone = css.slice(css.indexOf("v6.17.1: on a phone a tray's dim is its own overlay"));
    ok(/\.pop-anim\.vp:not\(\.vp-alert\) \{ transition: opacity 0s, visibility 0s, background-color 0\.26s ease !important; \}/.test(phone),
      "opening: the overlay shows at once and only its dim fades in");
    ok(/\.pop-anim\.vp:not\(\.vp-alert\)\.hidden \{ background-color: transparent !important;\s*transition: background-color 0\.26s ease, opacity 0s linear 0\.26s, visibility 0s linear 0\.26s !important; \}/.test(phone),
      "closing: the dim fades out and the overlay stays until the tray has slid away");
    ok(/@media \(max-width: 640px\) \{\s*\.pop-anim\.vp:not\(\.vp-alert\) \{ transition: opacity 0s/.test(phone), "…on a phone only (cards on a wide screen keep their fade)");
    ok(/prefers-reduced-motion: reduce\) \{\s*\.pop-anim\.vp:not\(\.vp-alert\), \.pop-anim\.vp:not\(\.vp-alert\)\.hidden \{ transition: none !important; \}/.test(phone), "Reduce Motion: no dim fade either");
    ok(/\.pop-anim\.vp:not\(\.vp-alert\)\.hidden \.vp-panel \{ transform: translateY\(100%\) !important; opacity: 1 !important;/.test(css), "the tray itself stays solid as it slides");
    ok(/vpSet\(t, \{ transition: "none" \}\); vpUnset\(t, \["background"\]\); void t\.offsetHeight; vpUnset\(t, \["transition"\]\);/.test(html),
      "after a tray move the trays get their dims back at once, with no fade (no flash of the page)");
    // A move still works and leaves nothing behind
    await run("openMenuSheet()");
    [...d.querySelectorAll("#menu-sheet .menu-item-btn")].find(b => b.textContent.includes("Recurring")).click();
    await sleep(460);
    const rm = $("recurring-modal");
    ok(E(`popupIsOpen(document.getElementById("recurring-modal"))`), "Menu › Recurring still opens");
    ok(!rm.style.getPropertyValue("background-color") && !rm.style.getPropertyValue("transition"), "…and its dim is back, with no inline leftovers");
    E(`closeRecurringModal()`); await sleep(400);

    // ── 2a. Backup status › What each status means folds ─────────────────────────
    ok(!d.querySelector("#save-status-legend-popup details"), "the legend isn't a <details> any more");
    await run("openSaveStatusLegend()");
    ok(folded("ss-legend-body") && $("ss-legend-sum").getAttribute("aria-expanded") === "false", "the legend starts folded");
    $("ss-legend-sum").click(); await sleep(0);
    ok(!folded("ss-legend-body") && $("ss-legend-sum").getAttribute("aria-expanded") === "true", "tapping it folds it open (› becomes ⌄)");
    ok(!$("ss-legend-body").style.transition, "…with the glide (not instant)");
    $("ss-legend-sum").click(); await sleep(0);
    ok(folded("ss-legend-body"), "tapping again folds it shut");
    $("ss-legend-sum").click(); await sleep(0);
    E("closeSaveStatusLegend()"); await sleep(300);
    await run("openSaveStatusLegend()");
    ok(folded("ss-legend-body"), "it's folded again next time it opens");
    ok(/\.ss-legend-sum\[aria-expanded="true"\]::after \{ content: " ⌄"; \}/.test(css) && /\.ss-legend-sum::after \{ content: " ›"; \}/.test(css), "› shut, ⌄ open");
    E("closeSaveStatusLegend()"); await sleep(300);

    // ── 2b. Goals › + Add goal ───────────────────────────────────────────────
    await run("openGoalsModal()");
    ok(folded("goal-form-fold") && !folded("goal-add-fold"), "Goals opens with the form folded away and + Add goal showing");
    ok(!/display:\s*none/.test(css.match(/#goal-form \{[^}]*\}/)[0]), "the form isn't hidden with display: none any more");
    $("goal-add-btn").click(); await sleep(0);
    ok(!folded("goal-form-fold") && folded("goal-add-fold"), "+ Add goal folds the form in and the button away");
    ok(!$("goal-form-fold").style.transition, "…with the glide");
    ok($("goal-form").style.display === "", "…without style.display");
    // Errors fold in and out
    E(`saveGoalForm()`); await sleep(0);
    ok(!folded("goal-name-err") && /name/i.test($("goal-name-err").textContent), "Save on a blank form folds the name error in");
    ok(!folded("goal-target-err"), "…and the amount error");
    const nm = $("goal-name"); nm.value = "Trip"; nm.dispatchEvent(new w.Event("input", { bubbles: true })); await sleep(0);
    ok(folded("goal-name-err") && /name/i.test($("goal-name-err").textContent), "typing folds it away (its text stays while it folds)");
    ok(/\.vp-note\.folded \{ margin-top: 0 !important; margin-bottom: 0 !important;/.test(css), "a folded line takes no space, margins included");
    d.querySelector(".goal-btn-cancel").click(); await sleep(0);
    ok(folded("goal-form-fold") && !folded("goal-add-fold"), "Cancel folds the form away and the button back");
    E(`closeGoalsModal()`); await sleep(300);
    await run(`openGoalsModal("${E("goals[0] && goals[0].id") || ""}")`);
    if (E("goals.length")) ok(!folded("goal-form-fold") && $("goal-form-fold").style.transition === "", "opening Goals to edit one shows the form straight away");
    E(`closeGoalsModal()`); await sleep(300);

    // ── 2c. Accounts › + Add account ─────────────────────────────────────────
    await run("openAccountsModal()");
    ok(folded("account-add-fold") && !folded("account-add-btn-fold"), "Accounts opens with the add form folded away");
    $("account-add-btn").click(); await sleep(0);
    ok(!folded("account-add-fold") && folded("account-add-btn-fold"), "+ Add account folds the form in");
    ok($("account-add-form").style.display === "", "…without style.display");
    E("cancelAddAccount()"); await sleep(0);
    ok(folded("account-add-fold") && !folded("account-add-btn-fold"), "Cancel folds it away");
    E("closeAccountsModal()"); await sleep(300);

    // ── 2e. Set password and Unlock errors fold ──────────────────────────────
    ok($("enc-set-error").classList.contains("vp-note") && $("enc-decrypt-error").classList.contains("vp-note"), "Set password and Unlock errors are fold lines");
    E(`openEncPasswordPopup()`); await sleep(0);
    ok(folded("enc-set-error"), "Set password opens with no error showing");
    await E(`encSetSubmit()`); await sleep(0);
    ok(!folded("enc-set-error") && /password/i.test($("enc-set-error").textContent), "Set with nothing typed folds the error in");
    ok($("enc-set-error").style.display === "", "…without style.display");
    $("enc-set-popup").classList.add("hidden"); await sleep(0);
    ok(!/errEl\.style\.display|err\.style\.display = "block"/.test(html.slice(html.indexOf("async function encSetSubmit"), html.indexOf("async function encSetSubmit") + 900)), "no display toggles left in Set password");

    // ── 3. Goals › Target date ───────────────────────────────────────────────
    const nativeRule = css.match(/\.goal-date-wrap #goal-deadline-native \{[^}]*\}/)[0];
    ok(!/pointer-events:\s*none/.test(nativeRule), "the date input takes the tap (it had pointer-events: none)");
    ok(/right: 0;/.test(nativeRule) && /width: 42px;/.test(nativeRule) && /z-index: 2;/.test(nativeRule), "…and sits over the 42 px calendar icon only");
    ok(/opacity: 0;/.test(nativeRule) && /color-scheme: dark;/.test(nativeRule), "…invisible, with the dark picker");
    ok(/\.goal-date-wrap \.goal-date-cal \{ pointer-events: none; \}/.test(css), "the icon underneath lets the tap through");
    await run("openGoalsModal()"); $("goal-add-btn").click(); await sleep(0);
    const txt = $("goal-deadline"), nat = $("goal-deadline-native");
    txt.value = "2027-03-15"; E("goalSeedPicker()");
    ok(nat.value === "2027-03-15", "the picker is seeded from the typed date, so it opens on that month");
    let shown = 0; nat.showPicker = () => { shown++; };
    E(`goalNativeClick({ pointerType: "touch" })`);
    ok(shown === 0, "a touch is left to the browser (iOS opens its picker from the tap)");
    E(`goalNativeClick({ pointerType: "mouse" })`);
    ok(shown === 1, "a mouse click asks for the picker");
    nat.value = "2027-06-01"; E(`goalDeadlineFromPicker(document.getElementById("goal-deadline-native"))`);
    ok(txt.value === "2027-06-01", "a picked date fills the text field");
    ok(/onpointerdown="goalSeedPicker\(\)" ontouchstart="goalSeedPicker\(\)" onfocus="goalSeedPicker\(\)"/.test(html), "it's seeded on the first touch, before iOS opens it");
    E(`closeGoalsModal()`); await sleep(300);

    // Version
    const ver = t => (t.match(/v(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
    const tx = el => (el && el.textContent || "").trim();
    const a = ver(tx($("about-version-meta"))), f = ver(tx($("version-footer")));
    const atLeast = (v, x) => v[0] !== x[0] ? v[0] > x[0] : v[1] !== x[1] ? v[1] > x[1] : v[2] >= x[2];
    ok(atLeast(a, [6, 17, 1]), "version is v6.17.1 or later");
    ok(a.join(".") === f.join("."), "About and footer show the same version");
  } catch (e) { ok(false, "threw: " + (e && e.stack || e)); }

  ok(errors.length === 0, "no page errors: " + errors.slice(0, 3).join(" | "));
  console.log(`v6.17.1: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 1500);
