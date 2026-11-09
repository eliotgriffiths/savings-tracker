// v6.16.0 regression tests: one overlay system (menus sweep, 9 Nov 2026).
// Every popup uses the shared panel (a tray on a phone, a centred card on a wide
// screen); short yes/no confirms are alerts; trays slide and can be swiped; closing a
// decision runs its skip; the period picker has no title; Add/Edit colours.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_16_0.test.js
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
    w.Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
  },
});
const w = dom.window, d = w.document;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const E = s => w.eval(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
const txt = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const isOpen = id => !d.getElementById(id).classList.contains("hidden");
const toastText = () => { const t = d.getElementById("toast"); const v = t.style.display === "block" ? txt(t) : ""; t.style.display = "none"; return v; };
const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");

setTimeout(async () => {
  E(SEED);
  E(`_dataVersion++; _invalidateYearCache(); document.getElementById("welcome-modal")?.classList.add("hidden"); switchTab("home");`);

  // ── Every popup uses the shared panel ─────────────────────────────────────
  const popups = $$('[id$="-popup"], [id$="-modal"]').filter(el => el.classList.contains("pop-anim") && !/^popup-/.test(el.id));
  const skip = new Set(["welcome-modal", "pdf-preview-modal", "lock-screen"]);
  const covered = popups.filter(el => !skip.has(el.id));
  ok(covered.length >= 35, "popups covered: " + covered.length);
  ok(covered.every(el => el.classList.contains("vp") && el.firstElementChild.classList.contains("vp-panel")), "every popup is a .vp with a .vp-panel: " +
     covered.filter(el => !el.classList.contains("vp")).map(el => el.id).join(", "));
  ok(covered.every(el => el.querySelector(".vp-panel > .vp-grab")), "every panel has a handle (shown on a phone)");
  const alerts = covered.filter(el => el.classList.contains("vp-alert")).map(el => el.id).sort();
  ok(JSON.stringify(alerts) === '["import-progress-popup","vault-confirm-popup","vh-reset-popup"]', "alerts: " + JSON.stringify(alerts));
  const headless = covered.filter(el => !el.classList.contains("vp-alert") && el.id !== "cloud-picker-popup" && !el.querySelector(".vp-head"));
  ok(headless.length === 0, "every panel has one head: " + headless.map(el => el.id).join(", "));
  const noX = covered.filter(el => !el.classList.contains("vp-alert") && el.id !== "cloud-picker-popup" && !el.querySelector(".vp-head > .modal-close"));
  ok(noX.length === 0, "every panel's ✕ sits in its head: " + noX.map(el => el.id).join(", "));
  ok(covered.every(el => !el.querySelector(".vp-title") || el.querySelectorAll(".vp-title").length === 1), "one title per panel");
  for (const id of ["tx-popup", "year-format-popup", "enc-set-popup", "currency-mismatch-popup", "layout-modal", "vault-prompt-popup", "add-recurring-popup"])
    ok(!!d.querySelector(`#${id} .vp-foot`), id + " has a pinned footer");
  ok(!!d.querySelector("#tx-popup #popup-standard-actions.vp-foot"), "Edit transaction's footer is Save / Delete / Cancel");
  ok(!!d.querySelector("#enc-decrypt-popup .modal-actions.vp-foot"), "Unlock's footer is Unlock / Cancel, not the recovery file button");

  // CSS: one tray on a phone, one card on a wide screen
  ok(/\.pop-anim\.vp \.vp-panel \{[^}]*max-width: 460px !important/.test(css), "wide screens: one 460px card");
  ok(/@media \(max-width: 640px\) \{\s*\.vp:not\(\.vp-alert\) \{ align-items: flex-end !important; padding: 0 !important; \}/.test(css), "phones: panels sit at the bottom as trays");
  ok(/\.pop-anim\.vp:not\(\.vp-alert\)\.hidden \.vp-panel \{ transform: translateY\(100%\) !important/.test(css), "trays slide down to close");
  ok(/\.pop-anim\.vp\.vp-alert \.vp-panel \{ max-width: 360px !important/.test(css) && /\.pop-anim\.vp\.vp-alert \.vp-panel \{ max-width: 300px !important; \}/.test(css), "alerts: 360px wide, 300px on a phone");
  ok(/\.vp \{ background: rgba\(0,0,0,0\.55\) !important; backdrop-filter: none !important;/.test(css), "one backdrop, no blur");
  ok(!/_popBoxIn 0\.28s cubic-bezier\(0\.34, 1\.56/.test(css.split("One overlay system")[1] || ""), "no bounce in the new shell");
  ok(!/#year-format-popup \.info-popup-close-btn \{[^}]*background: var\(--gold\)/.test(css), "Year format's Done is no longer gold (M11)");
  ok(!/#year-format-popup \.modal-close \{/.test(css), "Year format's ✕ matches the others (M12)");

  // ── Trays slide and lock the page ─────────────────────────────────────────
  ok(/#menu-sheet, #year-sheet, #add-sheet \{\s*display: block;[^}]*transform: translateY\(100%\); visibility: hidden;/.test(css), "trays slide instead of appearing");
  ok(/#sheet-overlay \{[^}]*opacity: 0; pointer-events: none; transition: opacity/.test(css), "the tray backdrop fades");
  E(`openMenuSheet()`); await sleep(20);
  ok(d.documentElement.classList.contains("vp-lock"), "an open tray locks the page with a class on <html>");
  E(`closeSheets()`); await sleep(20);
  ok(!d.documentElement.classList.contains("vp-lock"), "…and closing it unlocks");
  E(`openYearFormatPopup()`); await sleep(20);
  ok(d.documentElement.classList.contains("vp-lock"), "an open popup locks the page too");
  E(`closeYearFormatPopup()`); await sleep(20);
  ok(!d.documentElement.classList.contains("vp-lock"), "…and closing it unlocks");

  // ── Closing: one rule for outside tap, swipe and Back ─────────────────────
  E(`(()=>{const y=Object.keys(data).sort().pop();openPopupById(data[y].saved[0][2])})()`);
  const tx = d.getElementById("tx-popup");
  ok(E(`vpTryDismiss(document.getElementById("tx-popup"))`) === true && !isOpen("tx-popup"), "an untouched form closes");
  E(`(()=>{const y=Object.keys(data).sort().pop();openPopupById(data[y].saved[0][2])})()`);
  tx.dataset.dirty = "1"; toastText();
  ok(E(`vpTryDismiss(document.getElementById("tx-popup"))`) === false && isOpen("tx-popup"), "a touched form stays");
  ok(toastText() === "Tap Cancel to leave without saving", "…and says how to leave");
  tx.click();
  ok(isOpen("tx-popup") && toastText() === "Tap Cancel to leave without saving", "an outside tap on a touched form says so too");
  E(`closePopup()`);
  E(`openAddSheet()`); d.getElementById("add-sheet").dataset.dirty = "1"; toastText();
  ok(E(`sheetTryClose()`) === false && $("#add-sheet").classList.contains("open") && toastText() === "Tap Cancel to leave without saving", "the Add tray keeps typed input");
  E(`closeSheets()`);
  ok(E(`sheetTryClose()`) === true, "other trays close");

  // ── Decisions that can now be closed run their skip (decisions 4 and 6) ────
  ok(JSON.stringify([...E("POPUP_DECISIONS")].sort()) === '["import-progress-popup","lock-screen","welcome-modal"]', "only progress, Welcome and the lock screen can't be closed");
  d.getElementById("import-progress-popup").classList.remove("hidden");
  ok(E(`vpTryDismiss(document.getElementById("import-progress-popup"))`) === false && isOpen("import-progress-popup"), "Importing files… stays open");
  d.getElementById("import-progress-popup").classList.add("hidden");

  E(`void showCurrencyMismatchDialog({}, [], "USD")`); await sleep(50); toastText();
  ok(isOpen("currency-mismatch-popup") && !!d.querySelector("#currency-mismatch-popup .vp-head .modal-close"), "Currency mismatch has a ✕");
  d.querySelector("#currency-mismatch-popup .vp-head .modal-close").click(); await sleep(10);
  ok(!isOpen("currency-mismatch-popup") && /Merge skipped/.test(toastText()), "closing Currency mismatch counts as Decide later");
  ok(E("_pendingMerge") === null || E("_pendingMerge") === undefined, "…and the pending merge is dropped");
  E(`void showCurrencyMismatchDialog({}, [], "USD")`); await sleep(50); toastText();
  d.getElementById("currency-mismatch-popup").click(); await sleep(10);
  ok(!isOpen("currency-mismatch-popup") && /Merge skipped/.test(toastText()), "…an outside tap too");
  ok($$("#currency-mismatch-popup .vp-opt").length === 4 && !d.querySelector("#currency-mismatch-popup .btn-local"), "its options use the option card, not btn-local (M11)");

  E(`window._dm = "unset"; void showDriveMergeDialog().then(c => window._dm = c)`); await sleep(10);
  ok(!!d.querySelector("#drive-merge-popup .vp-head .modal-close"), "Existing Vault file found has a ✕");
  d.querySelector("#drive-merge-popup .vp-head .modal-close").click(); await sleep(10);
  ok(!isOpen("drive-merge-popup") && E("window._dm") === "cancel", "closing it answers \"cancel\"");
  E(`window._dm = "unset"; void showDriveMergeDialog().then(c => window._dm = c)`); await sleep(10);
  d.getElementById("drive-merge-popup").click(); await sleep(10);
  ok(E("window._dm") === "cancel", "…so does an outside tap");
  ok((html.match(/if \(choice === "cancel"\)/g) || []).length === 3, "local file, NAS and Google Drive all stop on cancel");
  ok(/if \(choice === "cancel"\) \{ unlinkGoogleDrive\(\);/.test(html), "…Google Drive isn't left half-connected");
  ok(/if \(choice === "cancel"\) \{ if \(!nasLinked\) nasConfig = null;/.test(html), "…nor is the NAS");

  E(`window._ec = "unset"; void promptEncryptionChoice().then(c => window._ec = c)`); await sleep(10); toastText();
  ok(!!d.querySelector("#enc-choice-popup .vp-head .modal-close"), "Encrypt your backup? has a ✕");
  d.getElementById("enc-choice-popup").click(); await sleep(10);
  ok(E("window._ec") === "skip" && !isOpen("enc-choice-popup"), "closing it saves without a password (\"skip\")");
  ok(/Saved without a password/.test(toastText()), "…and says how to add one later");

  ok(!!d.querySelector("#enc-decrypt-popup .vp-head .modal-close"), "Encrypted backup has a ✕");
  ok(/"enc-decrypt-popup": \(\) => document\.getElementById\("enc-decrypt-cancel"\)\?\.click\(\)/.test(html), "closing it is the same as its Cancel");
  for (const id of ["enc-menu-popup", "enc-set-popup", "enc-decrypt-popup"])
    ok(!d.querySelector(`#${id} .btn-primary, #${id} .btn-local`), id + " uses pbtn buttons (M11)");

  // ── Period picker: no title, chips in the head (decision 5) ───────────────
  E(`switchTab("all"); activeYear = "all-years"; activeMonth = null; render(); openPeriodSheet();`);
  ok(!d.querySelector("#year-sheet .sheet-title"), "the period picker has no title");
  ok($("#year-sheet").getAttribute("aria-label") === "Choose a period", "…but keeps its label for screen readers");
  ok($$("#ps-head .ps-chip").map(txt).join("|") === "This month|Last month|This year|All", "the quick chips are its head");
  ok(!!d.querySelector("#year-sheet .sheet-header #ps-head + .sheet-close-btn"), "…beside the ✕");
  ok(!d.querySelector("#ps-body .ps-chip"), "the chips aren't repeated in the body");
  $$("#ps-head .ps-chip").find(b => txt(b) === "This month").click();
  ok(E("activeMonth") === "2026-11" && !$("#year-sheet").classList.contains("open"), "a head chip still picks the period");
  E(`closeSheets()`);

  // ── Add / Edit: coloured type picker, gold confirm (decision 3) ───────────
  E(`openAddSheet(); setMobType("withdraw")`);
  const mob = d.getElementById("mob-add-btn");
  ok(mob.classList.contains("pbtn-primary") && !mob.style.background, "Add tray: the confirm is gold, whatever the type");
  ok(d.getElementById("mob-type-withdraw").classList.contains("active-withdraw"), "…and the type picker takes the type's colour");
  ok(!!d.querySelector("#add-sheet .sheet-foot #mob-add-btn"), "…in a pinned footer (M7)");
  E(`closeSheets()`);
  w.innerWidth = 1280;
  E(`openDesktopAddSheet(); setDeskType("interest")`);
  const desk = d.getElementById("desk-add-btn");
  ok(desk.classList.contains("pbtn-primary") && !desk.style.background, "desktop Add: the confirm is gold");
  ok(/var\(--interest\)/.test(d.getElementById("desk-type-interest").style.background), "…and the picker is coloured");
  E(`closeDesktopAddSheet()`);
  w.innerWidth = 390;
  ok(/#popup-type-row \.popup-scope-btn\.active\[data-ptype="withdraw"\] \{ background: var\(--out\);/.test(css), "Edit: the type picker is coloured by type");
  ok(d.getElementById("popup-save-btn").classList.contains("pbtn-primary"), "Edit: Save is gold");

  // ── Swipe works on iPhone: touch events, drag kept in the panel ───────────
  ok(/h\.addEventListener\("touchmove", e => \{\s*if \(y0 === null\) return;\s*if \(e\.cancelable\) e\.preventDefault\(\);/.test(html) && /\}, \{ passive: false \}\);/.test(html),
     "swipes use touchmove with preventDefault (passive: false), so iOS can't take the drag");
  ok(/if \(e\.pointerType === "touch" \|\|/.test(html), "pointer events are only for mouse and pen");
  ok(/vpSwipe\(document\.getElementById\("as-sheet"\), \[document\.getElementById\("as-sh-drag"\)\]/.test(html), "Filters uses the same swipe");
  ok(/\.sheet-handle::after \{ content: ""; position: absolute; left: -80px; right: -80px; top: -10px; bottom: -10px; \}/.test(css), "the tray handle has a big touch area");

  // ── Filters, pages ────────────────────────────────────────────────────────
  ok(!!d.querySelector("#as-sheet .as-sh-head .as-x"), "Filters has a ✕ like every other tray");
  ok(/\.as-sheet \{[^}]*background:var\(--bg2\)/.test(css), "Filters uses the tray background");
  ok(/#privacy-overlay\.open, #about-overlay\.open \{ transform: none; visibility: visible;/.test(css), "About and Privacy slide in like Settings");

  // ── Version ──────────────────────────────────────────────────────────────
  const ver = txt(d.getElementById("version-footer"));
  ok(txt(d.getElementById("about-version-meta")).replace("Version ", "") === ver, "About matches the footer");
  const v = ver.replace("v", "").split(".").map(Number);
  ok(v[0] > 6 || (v[0] === 6 && v[1] >= 16), "version is v6.16.0 or later: " + ver);

  console.log(`v6.16.0: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
  if (errors.length) console.log(errors.slice(0, 5));
  process.exit(fail || errors.length ? 1 : 0);
}, 300);
