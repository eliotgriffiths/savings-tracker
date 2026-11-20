// v7.3.0 regression tests: Home: every section rotates (no anchors, no floors), and a section can
// be pinned to a place (1–11) while the other places rotate. A section with nothing to show gives
// its place to the next in line. Customise Home: places, pin buttons, drag to a place, Unpin all.
// Pins sync; a manual order from before v7.3.0 becomes rotation, once, with a note.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v7_3_0.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
const NOW = new Date("2026-11-16T08:30:00+10:00").getTime();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
function page(beforeParse) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e.message || e)));
  let now = NOW;
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
    beforeParse(w) {
      const RD = w.Date;
      class MD extends RD { constructor(...a) { if (!a.length) super(now); else super(...a); } static now() { return now; } }
      MD.UTC = RD.UTC; MD.parse = RD.parse; w.Date = MD;
      w.fetch = () => Promise.reject(new Error("offline (test)"));
      w.confirm = w.alert = w.prompt = () => { throw new Error("native dialog used"); };
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
      Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
      w.__toasts = [];
      if (beforeParse) beforeParse(w);
    },
  });
  const w = dom.window;
  return { w, d: w.document, E: s => w.eval(s), J: s => JSON.parse(w.eval(`JSON.stringify(${s})`)), tick: ms => { now += ms; } };
}

setTimeout(async () => {
  try {
    // ── a manual order from before v7.3.0 becomes rotation, once, with a note ──────────────
    const M = page(w => {
      w.localStorage.setItem("vault_home_ui", JSON.stringify({ homeLayout: { order: ["goals", "month", "recent"], hidden: ["heatmap"], auto: false, ts: 5, v: 1 } }));
      w.addEventListener("DOMContentLoaded", () => { const t = w.toast; w.toast = (m, k) => { w.__toasts.push(m); }; });
    });
    await sleep(1800);
    M.E(`toast = (m, k) => { window.__toasts.push(m); };`);
    ok(M.E(`homeLayout.auto`) === true && M.E(`homeLayout.order.length`) === 0, "a hand-made order is now rotation");
    ok(M.J(`homeLayout.hidden`).join() === "heatmap", "…its hidden sections stay hidden");
    ok(M.E(`homeLayout.chosen`) === true && M.E(`homeLayout.ts`) > 5, "…marked as chosen, with a fresh time, so other devices follow");
    ok(M.J(`__toasts`).some(t => /^Home now rotates automatically\. Pin a section/.test(t)), "a one-time note says so: " + JSON.stringify(M.J(`__toasts`)));
    M.w.close();

    const P = page(), { E, J, d } = P, $ = id => d.getElementById(id);
    await sleep(400);
    E(SEED);
    E(`_dataVersion++; _invalidateYearCache(); document.getElementById("welcome-modal")?.classList.add("hidden");
       window.__toasts = []; toast = (m, k) => { window.__toasts.push(m); }; window.__syncs = 0; triggerCloudSync = () => { __syncs++; };
       homeLayout = { order: [], hidden: [], pins: {}, auto: true, ts: 0, v: 1 }; autoLayout = { order: [], ranked: [], computedAt: 0, reasons: {}, shown: {}, cycle: 0 };`);
    ok(E(`vhAllTx().length`) >= 8, "(enough history to rank)");

    // ── no anchors: every section rotates ──────────────────────────────────────────────────
    ok(E(`VH_AUTO_ANCHORS.length`) === 0, "no built-in anchors");
    const firsts = new Set(), missingMonth = [];
    const cycles = [];
    for (let i = 0; i < 24; i++) {
      P.tick(7 * 3600 * 1000); E(`vhMaybeReorder("test"); _frozenOrder = null; vhLayoutOrder(); switchTab("home"); renderHome();`);   // v7.3.1: stamped when drawn
      const o = J(`_vhShowList`); cycles.push(o);
      firsts.add(o[0]); if (!o.includes("month")) missingMonth.push(i);
    }
    ok(cycles.every(o => o.length === 11), "11 places each time");
    ok(firsts.size >= 2, "different sections take the first place over time: " + [...firsts].join(", "));
    // Nothing is floored: the order is the ranking (news, then rotation); This Month leads only on news
    const sc = J(`(() => { const s = vhAutoScores(); return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.score])); })()`);
    ok(["month", "goals", "recent", "upcoming", "overview", "chart"].some(k => sc[k] < 60), "the old anchors and floors are gone: " + ["month", "goals", "recent", "upcoming", "overview", "chart"].map(k => k + " " + sc[k]).join(", "));
    E(`_frozenOrder = null; vhLayoutOrder();`);
    const top = Object.keys(sc).sort((a, b) => sc[b] - sc[a] || 0)[0];
    ok(cycles.some(o => o[0] !== "month") && cycles.every(o => o.length === 11), "This Month doesn't always lead");

    // ── pins hold their places ─────────────────────────────────────────────────────────────
    E(`homeLayout.pins = { goals: 2, chart: 7 }; _frozenOrder = null;`);
    const pinned = [];
    for (let i = 0; i < 12; i++) {
      P.tick(7 * 3600 * 1000); E(`vhMaybeReorder("test"); _frozenOrder = null; vhLayoutOrder(); switchTab("home"); renderHome();`);   // v7.3.1: stamped when drawn
      pinned.push(J(`_vhShowList`));
    }
    ok(pinned.every(o => o[1] === "goals" && o[6] === "chart"), "a pinned section stays in its place every cycle");
    ok(pinned.every(o => o[0] !== "goals") && new Set(pinned.flatMap(o => [o[0], o[2], o[3], o[4], o[5]])).size >= 6, "…while the places around it still rotate: " + [...new Set(pinned.map(o => o[0]))].join(", "));
    ok(pinned.every(o => o.filter(k => k === "goals").length === 1), "…and it isn't shown twice");
    // cleaning
    ok(JSON.stringify(E(`vhCleanPins({ goals: 2, month: 2, chart: 0, nope: 3, recent: 12, overview: "4", streak: 3.4 })`)) === JSON.stringify({ goals: 2, overview: 4, streak: 3 }),
       "pins are checked: places 1–11, one per place, known sections only");

    // ── a section with nothing to show gives its place to the next in line ────────────────
    E(`homeLayout.pins = { currency: 3, goals: 2 }; _frozenOrder = null; switchTab("home"); renderHome();`);
    await sleep(20);
    const vis = J(`[...document.querySelectorAll("#home-panel .vh-section")].filter(e => !e.hidden && e.style.display !== "none").map(e => e.dataset.vhSection)`);
    ok(J(`_vhShowList`)[2] === "currency", "Currency Exposure is pinned to place 3");
    ok(!vis.includes("currency"), "it has nothing to show in a one-currency vault");
    ok(vis[1] === "goals", "Goals keeps place 2: " + vis.slice(0, 4).join(", "));
    ok(vis.length === 11 && J(`_vhSpares`).includes(vis[2]), "a spare fills place 3, so Home still shows 11: " + vis[2]);
    E(`homeLayout.pins = { goals: 2 }; _frozenOrder = null; renderHome();`);

    // ── Customise Home ─────────────────────────────────────────────────────────────────────
    E(`openLayoutModal()`); await sleep(20);
    const groups = J(`[...document.querySelectorAll("#layout-list .layout-group")].map(g => g.textContent)`);
    ok(groups[0] === "On Home" && groups.includes("Not on Home this time"), "groups: " + groups.join(" | "));
    const rowsHome = J(`[...document.querySelectorAll('#layout-list .layout-row[data-group="home"]')].map(r => [r.dataset.key, r.querySelector(".layout-place").textContent, r.querySelector("small").textContent])`);
    ok(rowsHome.length === 11 && rowsHome.every((r, i) => r[1] === String(i + 1)), "the 11 places, numbered");
    ok(rowsHome[1][0] === "goals" && rowsHome[1][2] === "Pinned here" && d.querySelector('#layout-list [data-key="goals"]').classList.contains("pinned"), "the pinned one says so");
    ok(rowsHome.filter(r => r[2] === "Rotates").length === 10, "the rest say Rotates");
    ok(/^Pinned sections keep their place\./.test($("layout-mode").textContent), "the mode line: " + $("layout-mode").textContent);
    ok(!$("layout-auto-btn").disabled && $("layout-auto-btn").textContent === "Unpin all", "Unpin all, ready while something's pinned");
    // pin a rotating row where it is
    const fifth = rowsHome[4][0];
    E(`document.querySelector('#layout-list [data-key="${fifth}"] .layout-pin').click()`);
    ok(J(`vhCleanPins(homeLayout.pins)`)[fifth] === 5, "pinning a row keeps it in the place it's in: " + fifth);
    // pin one that isn't on Home: it takes the last rotating place
    const restKey = J(`[...document.querySelectorAll('#layout-list .layout-row[data-group="rest"]')].map(r => r.dataset.key)`)[0];
    E(`document.querySelector('#layout-list [data-key="${restKey}"] .layout-pin').click()`);
    ok(J(`vhCleanPins(homeLayout.pins)`)[restKey] === 11 && J(`_vhShowList`)[10] === restKey, "pinning one that isn't on Home puts it in the last rotating place");
    // unpin
    E(`document.querySelector('#layout-list [data-key="${restKey}"] .layout-pin').click()`);
    ok(!J(`vhCleanPins(homeLayout.pins)`)[restKey], "tapping the pin again unpins it");
    // drag a row to place 1: it's pinned there, and the other pins move with the list
    E(`(() => { const list = document.getElementById("layout-list"), row = list.querySelector('[data-key="${fifth}"]');
        list.insertBefore(row, list.querySelector('.layout-row[data-group="home"]')); commitLayoutOrder("${fifth}"); })()`);
    ok(J(`vhCleanPins(homeLayout.pins)`)[fifth] === 1 && J(`_vhShowList`)[0] === fifth, "dragged to the top: pinned to place 1");
    ok(J(`vhCleanPins(homeLayout.pins)`).goals === 3, "Goals, which was below it, is now in place 3 (where the list put it): " + J(`vhCleanPins(homeLayout.pins)`).goals);
    // drag below the places: it rotates again
    E(`(() => { const list = document.getElementById("layout-list"), row = list.querySelector('[data-key="${fifth}"]');
        list.appendChild(row); commitLayoutOrder("${fifth}"); })()`);
    ok(!J(`vhCleanPins(homeLayout.pins)`)[fifth], "dragged below the places: it rotates again");
    // hiding unpins
    E(`toggleLayoutSection("goals")`);
    ok(!J(`vhCleanPins(homeLayout.pins)`).goals && J(`homeLayout.hidden`).includes("goals"), "hiding a pinned section unpins it");
    ok(!J(`_vhShowList`).includes("goals") && J(`[...document.querySelectorAll('#layout-list .layout-row[data-group="off"]')].map(r => r.dataset.key)`).includes("goals"), "…and lists it under Hidden");
    E(`toggleLayoutSection("goals"); homeLayout.pins = { goals: 3 }; _frozenOrder = null; renderLayoutList();`);
    // Save
    E(`saveLayoutModal()`); await sleep(10);
    ok(E(`homeLayout.chosen`) === true && E(`homeLayout.ts`) > 0, "Save keeps it (chosen, stamped)");   // v7.3.1: no toast
    const saved = JSON.parse(E(`localStorage.getItem("vault_home_ui")`)).homeLayout;
    ok(saved.pins && saved.pins.goals === 3, "…stored on this device");
    const _ts0 = E(`homeLayout.ts`); P.tick(1000);
    E(`openLayoutModal(); saveLayoutModal();`);
    ok(E(`homeLayout.ts`) === _ts0, "opening and saving with no change doesn't save again");
    // the cap
    E(`openLayoutModal(); homeLayout.pins = Object.fromEntries(_vhShowList.map((k, i) => [k, i + 1])); _frozenOrder = null; renderLayoutList();`);
    ok(/^Every place is pinned\./.test($("layout-mode").textContent), "all 11 pinned: it says nothing's left to rotate");
    const spare = J(`[...document.querySelectorAll('#layout-list .layout-row[data-group="rest"]')].map(r => r.dataset.key)`)[0];
    E(`document.querySelector('#layout-list [data-key="${spare}"] .layout-pin').click()`);
    ok(/Every place is pinned/.test(E(`__toasts.slice(-1)[0]`)), "…and pinning a twelfth says to unpin one first");
    E(`cancelLayoutModal()`);
    ok(J(`vhCleanPins(homeLayout.pins)`).goals === 3 && Object.keys(J(`vhCleanPins(homeLayout.pins)`)).length === 1, "Cancel puts it back");

    // ── Unpin all ──────────────────────────────────────────────────────────────────────────
    ok($("vh-home-menu-auto").textContent === "Unpin all", "Home ⋯ › Unpin all");
    E(`vhHomeMenuReset()`); await sleep(10);
    ok($("del-title").textContent === "Unpin all sections?" && /Every section goes back to rotating/.test($("del-lead").textContent) && /Hidden sections come back/.test($("del-lead").textContent), "it asks first, and says what happens");
    ok($("del-ok").textContent === "Unpin all", "button: Unpin all");
    $("del-ok").click(); await sleep(20);
    ok(Object.keys(J(`vhCleanPins(homeLayout.pins)`)).length === 0 && J(`homeLayout.hidden`).length === 0, "everything rotates again");   // v7.3.1: no toast
    await sleep(400);
    E(`vhHomeMenuToggle()`);
    ok($("vh-home-menu-auto").disabled, "nothing pinned or hidden: Unpin all is off");
    E(`vhHomeMenuClose()`);

    // ── sync ───────────────────────────────────────────────────────────────────────────────
    E(`homeLayout = { order: [], hidden: [], pins: { recent: 4 }, auto: true, ts: 100, v: 1 };`);
    ok(J(`buildWrappedPayload()._homeLayout`).pins.recent === 4, "pins travel in the backup, even with nothing else chosen");
    E(`mergeHomeLayout({ order: [], hidden: [], pins: { journey: 1, bad: 2 }, auto: true, chosen: true, ts: 200, v: 1 })`);
    E(`vhLayoutOrder()`);
    ok(JSON.stringify(J(`homeLayout.pins`)) === JSON.stringify({ journey: 1 }) && J(`_vhShowList`)[0] === "journey", "a newer chosen layout's pins arrive, checked, and Home follows");
    E(`mergeHomeLayout({ order: ["goals", "month"], hidden: ["records"], auto: false, ts: 300, v: 1 })`);
    ok(E(`homeLayout.auto`) === true && E(`homeLayout.order.length`) === 0 && J(`homeLayout.hidden`).join() === "records", "a hand-made order from an older device arrives as rotation (its hides kept)");
    E(`autoLayout = { order: ["recap", "records", "journey"], computedAt: 1, reasons: {}, shown: {}, cycle: 1 }; homeLayout.pins = {}; homeLayout.hidden = []; _frozenOrder = null; vhLayoutOrder();`);
    ok(J(`_vhShowList`).slice(0, 3).join() === "recap,records,journey", "an order from an older device (no ranking) is still used");

    // ── version ────────────────────────────────────────────────────────────────────────────
    const vf = $("version-footer").textContent.trim();
    const v = (vf.match(/^v(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
    ok(v.length === 3 && (v[0] > 7 || (v[0] === 7 && v[1] >= 3)) && html.includes(`Version ${vf}<`), "version v7.3.0 or later, About matches: " + vf);
  } catch (e) { fail++; console.log("FAIL (threw):", e.stack.split("\n").slice(0, 3).join(" | ")); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => { fail++; console.log("PAGE ERROR:", e); });
  console.log(`v7.3.0: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 400);
