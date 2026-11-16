// v7.2.1 regression tests: sheets and trays stop at their ends (no bounce); the handle floats over
// the rows (no strip behind it); the "changes since your last backup" reminder counts changes only,
// stays quiet with a backup set up and resets on a backup; Charts: one gesture does one thing, the
// edges hold, the crosshair goes on lift, the scale holds while dragging, the range button un-lights
// after a pan, double tap snaps back; one Customise; Customise is a shorter tray in three tabs.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v7_2_1.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const FIXTURE = fs.readFileSync(path.join(__dirname, "export", "fixture.js"), "utf8");
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
    w.__scrolls = 0; w.scrollTo = () => { w.__scrolls++; }; w.Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
    Object.defineProperty(w, "innerHeight", { value: 844, configurable: true, writable: true });
    // Eliot's phone: the reminder had counted 50 redraws
    w.localStorage.setItem("vault_tx_since_export", "50");
  },
});
const w = dom.window, d = w.document;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const E = s => w.eval(s);
const J = s => JSON.parse(E(`JSON.stringify(${s})`));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = id => d.getElementById(id);
const isOpen = id => { const el = $(id); return !!el && !el.classList.contains("hidden"); };
const txt = id => ($(id)?.textContent || "").replace(/\s+/g, " ").trim();
const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");
const touch = (el, type, pts, changed) => {
  const ev = new w.Event(type, { bubbles: true, cancelable: true });
  ev.touches = pts.map(([x, y]) => ({ clientX: x, clientY: y }));
  ev.changedTouches = (changed || pts).map(([x, y]) => ({ clientX: x, clientY: y }));
  el.dispatchEvent(ev); return ev;
};

setTimeout(async () => {
  try {
    // ── the backup reminder ────────────────────────────────────────────────────────────────
    ok(E(`localStorage.getItem("vault_tx_since_export")`) === "0", "the count left from counting redraws is cleared once");
    E(FIXTURE);
    E(`_dataVersion++; _invalidateYearCache(); document.getElementById("welcome-modal")?.classList.add("hidden");
       window.__toasts = []; toast = (m, k) => { window.__toasts.push(m); };
       gdLinked = false; nasLinked = false; localFileLinked = false; localStorage.removeItem("vault_gd_v1");`);
    ok(E(`fsapiSupported()`) === false, "(this browser can't save files, like an iPhone)");
    for (let i = 0; i < 25; i++) E(`render()`);
    ok(E(`localStorage.getItem("vault_tx_since_export")`) === "0", "redraws don't count");
    for (let i = 0; i < 10; i++) E(`saveAndRender(null)`);
    ok(E(`localStorage.getItem("vault_tx_since_export")`) === "10" && E(`__toasts.some(t => /^10 changes since your last backup/.test(t))`), "ten changes with no backup: the reminder");
    E(`setSaveStatus("ok", "Backed up")`);
    ok(E(`localStorage.getItem("vault_tx_since_export")`) === "0", "a backup resets it");
    E(`localStorage.setItem("vault_gd_v1", JSON.stringify({ access_token: "x", refresh_token: "y", expires_at: 0, fileId: "f" })); window.__toasts = [];`);
    for (let i = 0; i < 12; i++) E(`saveAndRender(null)`);
    ok(E(`localStorage.getItem("vault_tx_since_export")`) === "0" && !E(`__toasts.some(t => /since your last backup/.test(t))`),
       "Drive set up but still checking its sign-in at start-up: no counting, no reminder");
    E(`localStorage.removeItem("vault_gd_v1"); nasLinked = true;`);
    E(`saveAndRender(null)`);
    ok(E(`localStorage.getItem("vault_tx_since_export")`) === "0", "a NAS backup: quiet too");
    E(`nasLinked = false;`);

    // ── no bounce; the handle floats ───────────────────────────────────────────────────────
    ok(/#add-sheet[^{]*\{[^}]*max-height: 90vh; overflow-y: auto; overflow-x: hidden; overscroll-behavior: none;/.test(css), "the Menu, period and Add sheets don't bounce");
    ok(/\.pop-anim\.vp \.vp-panel \{[^}]*overscroll-behavior: none;/.test(css), "trays don't bounce");
    ok(/\.as-sh-body \{[^}]*overscroll-behavior:none;/.test(css), "Search's filter sheet doesn't bounce");
    ok(!/overscroll-behavior:\s*contain/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "nothing is left on contain (it still lets the scroller bounce)");
    ok(/\.sheet-handle \{[^}]*background: transparent;/.test(css) && /\.vp:not\(\.vp-alert\) \.vp-grab \{[^}]*background: transparent;/.test(css), "no strip behind the handle: rows scroll up to the sheet's own edge");
    const bar = /\.sheet-handle::before \{[^}]*background: ([^;]+);/.exec(css), bar2 = /\.vp-grab::before \{[^}]*background: ([^;]+);/.exec(css);
    ok(bar && /color-mix\(in srgb, var\(--text-3\) 70%, var\(--bg2\)\)/.test(bar[1]) && bar2 && bar2[1] === bar[1], "the bar is solid, so it shows over the rows: " + (bar && bar[1]));
    ok(/\.sheet-handle::before \{[^}]*top: 9px; width: 36px; height: 4px;/.test(css), "the bar keeps its place and size (the hand-over on tray moves is unchanged)");

    // ── Charts: one Customise; the legend is a key ─────────────────────────────────────────
    E(`switchTab("charts")`); await sleep(20);
    const custs = [...d.querySelectorAll("#charts-panel button")].filter(b => /Customise/.test(b.textContent));
    ok(custs.length === 1 && custs[0].id === "ch-cust-btn", "one Customise button on Charts: " + custs.length);
    ok($("ch-legend").tagName === "DIV" && !$("ch-legend").getAttribute("onclick") && !/Customise/.test(txt("ch-legend")), "the legend is just the key");
    ok(d.documentElement.classList.contains("ch-page") && /html\.ch-page, html\.ch-page body \{ overscroll-behavior-y: none; \}/.test(css), "the page doesn't bounce on Charts");
    E(`switchTab("home")`); ok(!d.documentElement.classList.contains("ch-page"), "…only on Charts");
    E(`switchTab("charts")`);
    ok(/\.ch-readout \{[^}]*min-height: 66px;/.test(css), "the figures above the chart keep room for a line of figures, so the chart doesn't shift");

    // ── Customise: three tabs, a shorter tray, a light dim, the page doesn't move ──────────
    const scrolls0 = E(`__scrolls`), y0 = E(`document.scrollingElement ? document.scrollingElement.scrollTop : 0`);
    E(`openChartCustomise()`); await sleep(30);
    ok(isOpen("chart-custom-popup") && txt("chc-title") === "Customise", "Customise opens");
    ok(J(`[...document.querySelectorAll("#chc-tabs [data-chc-tab]")].map(t => t.textContent)`).join() === "Chart,Lines,Display", "three tabs, with how many lines are on: " + J(`[...document.querySelectorAll("#chc-tabs [data-chc-tab]")].map(t => t.textContent)`).join());
    ok(J(`[...document.querySelectorAll(".chc-pane")].filter(p => !p.hidden).map(p => p.dataset.pane)`).join() === "chart", "the Chart tab shows first");
    ok(J(`[...document.querySelectorAll('[data-pane="chart"] .chc-lab')].map(l => l.childNodes[0].textContent)`).join("|") === "Show|Accounts|Each point|Type", "Chart: Show, Accounts, Each point, Type");
    ok(J(`[...document.querySelectorAll("#chc-types .chc-tile")].map(t => t.textContent)`).join() === "Area,Line,Steps,Candles" && d.querySelectorAll("#chc-types .chc-tile svg").length === 4, "chart types as drawn tiles");
    ok(d.querySelectorAll(".chc-acc [data-chc-acct] i").length === 4, "accounts with their colour dots");
    const panel = d.querySelector("#chart-custom-popup .vp-panel");
    ok(/^\d+px$/.test(panel.style.getPropertyValue("height")) && panel.style.getPropertyPriority("height") === "important", "the tray's height is set when it opens: " + panel.style.getPropertyValue("height"));
    const hpx = parseInt(panel.style.getPropertyValue("height"), 10);
    ok(hpx >= 844 * 0.5 - 1 && hpx <= 844 * 0.56 + 1, "between half and 56 % of the screen: " + hpx);
    ok(E(`__scrolls`) === scrolls0 && E(`document.scrollingElement ? document.scrollingElement.scrollTop : 0`) === y0, "opening it doesn't scroll the page");
    ok(/#chart-custom-popup\.vp \{ background: color-mix\(in srgb, var\(--bg0\) 18%, transparent\) !important; \}/.test(css), "a light dim, so the chart shows above it");
    E(`document.querySelector('#chc-tabs [data-chc-tab="lines"]').click()`);
    ok(J(`[...document.querySelectorAll(".chc-pane")].filter(p => !p.hidden).map(p => p.dataset.pane)`).join() === "lines", "Lines tab");
    ok(d.querySelectorAll('[data-pane="lines"] .chc-lk').length >= 5, "each line shows how it's drawn");
    E(`document.querySelector('#chc-body [data-ch-sw="ma"]').click()`);
    ok(!$("chc-f-ma").classList.contains("folded") && J(`[...document.querySelectorAll("#chc-ma-n button")].map(b => b.textContent)`).join() === "3 months,6 months,12 months", "Average opens its lengths");
    ok(J(`[...document.querySelectorAll('[data-chc-ma-kind]')].map(b => b.textContent)`).join() === "Every point the same,Recent ones count more", "…and how it weighs them");
    ok(txt("ch-preset-name") === "Balance" && !$("ch-preset-dot").hidden && /Lines \(1\)/.test(txt("chc-tabs")), "the chart changes as you go, and the count follows");
    E(`document.querySelector('#chc-tabs [data-chc-tab="display"]').click()`);
    ok(J(`[...document.querySelectorAll('[data-pane="display"] .ch-row b')].map(b => b.textContent)`).join() === "Log scale,Start at zero,Gridlines", "Display: Log scale, Start at zero, Gridlines");
    E(`document.querySelector('#chc-tabs [data-chc-tab="chart"]').click(); closeChartCustomise(); chUndo();`);

    // ── Charts: touch (a stand-in for the library: jsdom has no canvas) ────────────────────
    ok(/fixLeftEdge: true, fixRightEdge: true, rightOffset: 0/.test(html), "both edges hold");
    ok(/trackingMode: \{ exitMode: LW\.TrackingModeExitMode\.OnTouchEnd \}/.test(html), "the crosshair goes when the finger lifts");
    E(`window.__opts = []; window.__auto = []; window.__ranges = [];
       window.__fake = { applyOptions: o => __opts.push(JSON.stringify(o)), priceScale: () => ({ applyOptions: o => __auto.push(o.autoScale) }) };
       window.__el = document.createElement("div"); document.body.appendChild(__el); chBindGestures(__el, __fake);
       chSetRange = k => __ranges.push(k);`);
    const el = E(`__el`);
    ok(el.style.touchAction === "pan-y", "the browser may scroll the page up and down over the chart, never sideways");
    // mostly sideways (a little down): the chart moves, the page holds, the scale holds
    touch(el, "touchstart", [[100, 300]]);
    const m1 = touch(el, "touchmove", [[104, 301]]);
    ok(!m1.defaultPrevented, "under 6 px nothing's decided yet");
    const m2 = touch(el, "touchmove", [[140, 312]]), m3 = touch(el, "touchmove", [[180, 322]]);
    ok(m2.defaultPrevented && m3.defaultPrevented, "a mostly-sideways drag: the page holds still");
    ok(J(`__auto`).join() === "false", "…and the scale holds while dragging");
    touch(el, "touchend", [], [[180, 322]]);
    ok(J(`__auto`).join() === "false,true", "…and refits once on release");
    // mostly up: the page scrolls, the chart doesn't pan
    touch(el, "touchstart", [[100, 300]]);
    const u1 = touch(el, "touchmove", [[103, 270]]), u2 = touch(el, "touchmove", [[106, 220]]);
    ok(!u1.defaultPrevented && !u2.defaultPrevented, "a mostly-up drag scrolls the page");
    ok(J(`__opts`).some(o => /"horzTouchDrag":false/.test(o) && /"pinch":false/.test(o)), "…and the chart doesn't pan or pinch meanwhile");
    touch(el, "touchend", [], [[106, 220]]);
    ok(/"horzTouchDrag":true/.test(J(`__opts`).slice(-1)[0]), "…until the finger lifts");
    // pinch: page held
    touch(el, "touchstart", [[100, 300], [200, 300]]);
    ok(touch(el, "touchmove", [[90, 300], [220, 300]]).defaultPrevented, "a pinch holds the page");
    touch(el, "touchend", [], [[90, 300]]);
    // double tap: back to the chosen range
    E(`__ranges = []`);
    touch(el, "touchstart", [[150, 300]]); touch(el, "touchend", [], [[150, 300]]);
    touch(el, "touchstart", [[150, 300]]); touch(el, "touchend", [], [[150, 300]]);
    ok(J(`__ranges`).length === 1 && J(`__ranges`)[0] === E(`chCfg.range`), "a double tap snaps back to the chosen range");
    // the range button un-lights after a pan, and lights again once it snaps back
    E(`window.__lr = { from: 10, to: 20 }; chChart = { timeScale: () => ({ getVisibleLogicalRange: () => __lr }) }; chArmRange();`);
    await sleep(150);
    E(`renderChartsChrome()`);
    ok(d.querySelectorAll("#ch-ranges .on").length === 1, "lit while the view is where the range put it");
    E(`__lr = { from: 7.2, to: 17.2 }; chOnViewMoved();`);
    ok(d.querySelectorAll("#ch-ranges .on").length === 0, "panned away: no range button lit");
    E(`__lr = { from: 10, to: 20 }; chOnViewMoved();`);
    ok(d.querySelectorAll("#ch-ranges .on").length === 1, "back: lit again");
    E(`chChart = null;`);

    // ── version ────────────────────────────────────────────────────────────────────────────
    const vf = txt("version-footer");
    const v = (vf.match(/^v(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
    ok(v.length === 3 && (v[0] > 7 || (v[0] === 7 && (v[1] > 2 || (v[1] === 2 && v[2] >= 1)))) && html.includes(`Version ${vf}<`), "version v7.2.1 or later, About matches: " + vf);
  } catch (e) { fail++; console.log("FAIL (threw):", e.stack.split("\n").slice(0, 3).join(" | ")); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => { fail++; console.log("PAGE ERROR:", e); });
  console.log(`v7.2.1: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 400);
