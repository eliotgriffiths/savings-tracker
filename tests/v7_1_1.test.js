// v7.1.1 regression tests: a pull-down anywhere on a sheet or tray that's at the top moves the
// whole sheet (so the handle stays on its edge instead of rubber-banding away), and Home's
// "Reset to default" is "Arrange automatically", with Customise Home saying which mode it's in.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v7_1_1.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
const NOW = new Date("2026-11-16T08:30:00+10:00").getTime();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
  beforeParse(w) {
    const RD = w.Date;
    class MD extends RD { constructor(...a) { if (!a.length) super(NOW); else super(...a); } static now() { return NOW; } }
    MD.UTC = RD.UTC; MD.parse = RD.parse; w.Date = MD;
    w.fetch = () => Promise.reject(new Error("offline (test)"));
    w.confirm = w.alert = w.prompt = () => { throw new Error("native dialog used"); };
    w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
  },
});
const w = dom.window, d = w.document;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const E = s => w.eval(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = id => d.getElementById(id);
// jsdom can't build TouchEvents, but the handlers only read e.touches
const touch = (el, type, x, y) => {
  const ev = new w.Event(type, { bubbles: true, cancelable: true });
  ev.touches = type === "touchend" ? [] : [{ clientX: x, clientY: y }];
  el.dispatchEvent(ev); return ev;
};
const setScroll = (el, v) => Object.defineProperty(el, "scrollTop", { value: v, configurable: true, writable: true });
const drag = (el, pts) => { const evs = []; touch(el, "touchstart", pts[0][0], pts[0][1]); pts.slice(1).forEach(([x, y]) => evs.push(touch(el, "touchmove", x, y))); touch(el, "touchend", 0, 0); return evs; };

setTimeout(async () => {
  try {
    E(SEED);
    E(`_dataVersion++; _invalidateYearCache(); document.getElementById("welcome-modal")?.classList.add("hidden");
       switchTab("home"); window.__toasts = []; toast = (m, k) => { window.__toasts.push(m); };`);
    const menu = $("menu-sheet");
    const row = [...menu.querySelectorAll(".menu-item-btn")].find(b => /Export spreadsheet/.test(b.textContent));

    // ── 1. the Menu: a pull-down on the rows ────────────────────────────────────────────────
    E(`openMenuSheet()`); await sleep(20);
    setScroll(menu, 0);
    touch(row, "touchstart", 200, 500);
    const mv = touch(row, "touchmove", 201, 530);
    ok(mv.defaultPrevented, "at the top, a pull-down on a row is taken over (no rubber-band)");
    ok(menu.style.transform === "translateY(30px)", "…and moves the whole sheet: " + menu.style.transform);
    touch(row, "touchmove", 200, 540);
    ok(menu.style.transform === "translateY(40px)", "…following the finger");
    touch(row, "touchend", 0, 0);
    ok(menu.classList.contains("open") && menu.style.transform === "", "a short pull springs back open");
    drag(row, [[200, 300], [200, 320], [200, 500]]);
    await sleep(20);
    ok(!menu.classList.contains("open"), "a long pull closes the Menu");

    E(`openMenuSheet()`); await sleep(20);
    setScroll(menu, 120);
    const evs = drag(row, [[200, 300], [200, 340], [200, 600]]);
    ok(!evs[0].defaultPrevented && menu.style.transform === "" && menu.classList.contains("open"), "scrolled part-way, a pull-down scrolls instead");
    setScroll(menu, 0);
    const up = drag(row, [[200, 500], [200, 480], [200, 600]]);
    ok(!up[0].defaultPrevented && !up[1].defaultPrevented && menu.classList.contains("open"), "a gesture that starts upwards stays a scroll, even if it turns down");
    const side = drag(row, [[200, 500], [240, 510], [240, 700]]);
    ok(!side[0].defaultPrevented && menu.classList.contains("open"), "a sideways start isn't a pull-down");
    E(`closeSheets()`); await sleep(20);

    // ── a tray (Export) and something scrolled inside it ────────────────────────────────────
    E(`openExportPopup()`); await sleep(30);
    const panel = d.querySelector("#export-popup .vp-panel");
    setScroll(panel, 0);
    const opt = d.querySelector("#exp-opts .exp-opt");
    touch(opt, "touchstart", 200, 600);
    ok(touch(opt, "touchmove", 200, 620).defaultPrevented && /translateY\(20px\)/.test(panel.style.transform), "a tray at the top moves from anywhere: " + panel.style.transform);
    touch(opt, "touchend", 0, 0);
    ok(E(`!document.getElementById("export-popup").classList.contains("hidden")`), "…and springs back on a short pull");
    const inner = $("exp-applied") || opt;
    setScroll(opt, 30);
    const innerEv = drag(opt, [[200, 600], [200, 640]]);
    ok(!innerEv[0].defaultPrevented, "not when something under the finger is scrolled");
    setScroll(opt, 0);
    drag(opt, [[200, 300], [200, 310], [200, 520]]); await sleep(30);
    ok(E(`document.getElementById("export-popup").classList.contains("hidden")`), "a long pull closes the tray");

    // fields keep their own touches
    E(`openGoalsModal()`); await sleep(30);
    const gp = d.querySelector("#goals-modal .vp-panel"), field = d.querySelector("#goals-modal input");
    if (field) { setScroll(gp, 0); const fe = drag(field, [[200, 400], [200, 440]]); ok(!fe[0].defaultPrevented && gp.style.transform === "", "a pull starting on a text field is left alone"); }
    E(`closeGoalsModal()`); await sleep(20);

    // Search's filter sheet (set up the first time Search opens)
    E(`switchTab("report")`); await sleep(20);
    const asBody = d.querySelector("#as-sheet .as-sh-body"), asSheet = $("as-sheet");
    setScroll(asBody, 0);
    const fe2 = touch(asBody.firstElementChild || asBody, "touchstart", 200, 500);
    const fm2 = touch(asBody.firstElementChild || asBody, "touchmove", 200, 530);
    ok(fm2.defaultPrevented && asSheet.style.transform === "translateY(30px)", "Search's filter sheet too: " + asSheet.style.transform);
    touch(asBody, "touchend", 0, 0);
    E(`switchTab("home")`); await sleep(20);

    // a computer: nothing changes
    w.innerWidth = 1280;
    E(`openExportPopup()`); await sleep(20);
    const wide = drag(d.querySelector("#exp-opts .exp-opt"), [[200, 300], [200, 500]]);
    ok(!wide[0].defaultPrevented && d.querySelector("#export-popup .vp-panel").style.transform === "", "wide screens: no pull-down");
    E(`closeExportPopup()`); w.innerWidth = 390;

    // ── 2. Home: Arrange automatically ──────────────────────────────────────────────────────
    const item = $("vh-home-menu-auto");
    ok(item && item.textContent === "Arrange automatically", "Home ⋯ says Arrange automatically");
    ok(![...d.querySelectorAll("button")].some(b => b.textContent.trim() === "Reset to default"), "no Reset to default left");
    E(`homeLayout = { order: [], hidden: [], auto: true, ts: 5, v: 1 }; vhHomeMenuToggle();`);
    ok(item.disabled, "disabled while Home is already automatic with nothing hidden");
    E(`vhHomeMenuClose(); homeLayout = { order: [], hidden: ["streak"], auto: true, ts: 5, v: 1 }; vhHomeMenuToggle();`);
    ok(!item.disabled, "enabled when something's hidden");
    E(`vhHomeMenuClose(); homeLayout = { order: ["goals"], hidden: [], auto: false, ts: 5, v: 1 }; vhHomeMenuToggle();`);
    ok(!item.disabled, "enabled when it's your order");
    E(`vhHomeMenuClose(); vhHomeMenuReset();`); await sleep(10);
    ok($("del-title").textContent === "Arrange Home automatically?", "asks: " + $("del-title").textContent);
    ok(/goes back to arranging Home for you/.test($("del-lead").textContent) && /reorder every few hours/.test($("del-lead").textContent) && /Hidden sections come back/.test($("del-lead").textContent), "explains what automatic means");
    ok($("del-ok").textContent === "Arrange automatically" && !$("del-ok").disabled, "button: Arrange automatically");
    $("del-ok").click(); await sleep(20);
    ok(E(`homeLayout.auto === true && homeLayout.order.length === 0`), "it arranges automatically");
    ok(E(`__toasts.slice(-1)[0]`) === "Home is arranged automatically", "toast: " + E(`__toasts.slice(-1)[0]`));
    await sleep(500);

    // Customise Home
    E(`homeLayout = { order: [], hidden: [], auto: true, ts: 5, v: 1 }; openLayoutModal();`); await sleep(20);
    ok(/^Arranged automatically\./.test($("layout-mode").textContent) && /Dragging a section switches to your order/.test($("layout-mode").textContent), "Customise Home says it's automatic: " + $("layout-mode").textContent);
    ok($("layout-auto-btn").textContent === "Arrange automatically" && $("layout-auto-btn").disabled, "its button is Arrange automatically, disabled while it already is");
    E(`commitLayoutOrder()`);
    ok(/^Your order\./.test($("layout-mode").textContent) && /won't rearrange it/.test($("layout-mode").textContent), "after a drag: Your order");
    ok(!$("layout-auto-btn").disabled, "…and the button is ready");
    E(`resetHomeLayout()`);
    ok(/^Arranged automatically/.test($("layout-mode").textContent) && $("layout-auto-btn").disabled, "tapping it goes back to automatic (Save keeps it)");
    E(`cancelLayoutModal()`);

    // ── version ─────────────────────────────────────────────────────────────────────────────
    const vf = $("version-footer").textContent.trim();
    const v = (vf.match(/^v(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
    ok(v.length === 3 && (v[0] > 7 || (v[0] === 7 && (v[1] > 1 || (v[1] === 1 && v[2] >= 1)))) && html.includes(`Version ${vf}<`), "version v7.1.1 or later, About matches: " + vf);
  } catch (e) { fail++; console.log("FAIL (threw):", e.message); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => { fail++; console.log("PAGE ERROR:", e); });
  console.log(`v7.1.1: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 400);
