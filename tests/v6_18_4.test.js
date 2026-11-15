// v6.18.4 regression tests (15 Nov 2026), from Eliot's 12 Nov video:
// 1. a tray move kept the edge's handle, but the arriving tray's solid handle strip covered it as
//    the tray faded in, so the handle went for ~0.15 s at the end of every move;
// 2. a swipe down closed a tray after 80 px; now it closes only past half the tray's own height.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_18_4.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
const FIXED = new Date("2026-11-15T08:30:00+10:00").getTime();
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
const settle = () => sleep(460);
const open = id => !$(id).classList.contains("hidden");

// A mouse drag on the handle (touch events can't be built in jsdom; both paths share start/move/end)
function drag(el, dy) {
  const fire = (type, y) => {
    const e = new w.MouseEvent(type, { bubbles: true, clientY: y, button: 0 });
    Object.defineProperty(e, "pointerType", { value: "mouse" });
    Object.defineProperty(e, "pointerId", { value: 1 });
    el.dispatchEvent(e);
  };
  fire("pointerdown", 300); fire("pointermove", 300 + dy / 2); fire("pointermove", 300 + dy); fire("pointerup", 300 + dy);
}

setTimeout(async () => {
  try {
    E(SEED); E("render()");
    $("welcome-modal")?.classList.add("hidden");
    await sleep(0);
    const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");

    // ── 1. The handle stays through a move ──────────────────────────────────
    ok(/\.vp-nav \.vp-grab \{ background: transparent !important; \}/.test(css), "during a move the trays' handle strips are see-through");
    ok(/\.vp-nav \.vp-grab::before, \.vp-nav > \.sheet-handle \{ visibility: hidden; \}/.test(css), "…and their own handles stay hidden, so there's one handle (the edge's)");
    ok(/#vp-ghost::before \{[^}]*top: 9px; width: 36px; height: 4px;/.test(css) && /\.vp-grab::before \{[^}]*top: 9px; width: 36px; height: 4px;/.test(css),
       "the edge's handle sits exactly where the tray's own handle does, so the hand-over at the end doesn't move it");
    E(`openSettingsPage()`); await settle();
    E(`openYearFormatPopup()`); await sleep(30);
    const midMove = [...d.querySelectorAll(".vp-panel.vp-nav")].length;
    ok(midMove === 2, "mid-move both trays are marked as moving (" + midMove + ")");
    const bgs = [...d.querySelectorAll(".vp-panel.vp-nav .vp-grab")].map(g => w.getComputedStyle(g).backgroundColor);
    ok(bgs.length === 2 && bgs.every(b => /transparent|rgba\(0, 0, 0, 0\)/.test(b)), "…and neither strip paints over the edge's handle (" + bgs.join(", ") + ")");
    await settle();
    ok(!d.querySelector(".vp-nav"), "after the move the tray has its own handle back");
    E(`vpCloseAll(document.querySelector(".vp:not(.hidden)"))`); await settle();

    // ── 2. Swipe down: half the tray's height ───────────────────────────────
    E(`openSettingsPage()`); await settle();
    const sp = $("settings-popup"), panel = sp.querySelector(".vp-panel"), grab = sp.querySelector(".vp-grab");
    Object.defineProperty(panel, "offsetHeight", { value: 640, configurable: true });
    drag(grab, 120); await sleep(10);
    ok(open("settings-popup"), "a 120 px swipe on a 640 px tray springs back (it used to close past 80 px)");
    ok(panel.style.transform === "" && !panel.classList.contains("vp-drag"), "…and it's let go, so the transition carries it back up");
    drag(grab, 300); await sleep(10);
    ok(open("settings-popup"), "300 px, just under half, still springs back");
    drag(grab, 330); await settle();
    ok(!open("settings-popup"), "past half (330 px) it closes");
    // A short tray still needs a real swipe
    E(`openSettingsPage()`); await settle();
    Object.defineProperty(panel, "offsetHeight", { value: 120, configurable: true });
    drag(grab, 70); await sleep(10);
    ok(open("settings-popup"), "on a short tray a tiny nudge (70 px) never closes it");
    drag(grab, 90); await settle();
    ok(!open("settings-popup"), "…but 90 px, past both half its height and 80 px, does");
    // The Menu sheet follows the same rule
    E(`openMenuSheet()`); await settle();
    const ms = $("menu-sheet");
    Object.defineProperty(ms, "offsetHeight", { value: 600, configurable: true });
    drag(ms.querySelector(".sheet-handle"), 150); await sleep(10);
    ok(ms.classList.contains("open"), "the Menu springs back from a 150 px swipe too");
    drag(ms.querySelector(".sheet-handle"), 320); await settle();
    ok(!ms.classList.contains("open"), "…and closes past half");

    // ── Version ─────────────────────────────────────────────────────────────
    const v = s => s.replace(/^\D*/, "").split(".").map(Number);
    const about = v($("about-version-meta").textContent), foot = v($("version-footer").textContent);
    const ge = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    ok(ge(about, [6, 18, 4]) >= 0 && about.join() === foot.join(), "version is 6.18.4 or later, About matches the footer");
  } catch (e) { fail++; console.log("ERROR:", e.stack); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => console.log("PAGE ERROR:", e));
  console.log(`v6.18.4: ${pass} passed, ${fail} failed, ${pageErrors.length} page errors`);
  process.exit(fail || pageErrors.length ? 1 : 0);
}, 100);
