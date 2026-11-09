// v6.15.2 regression tests: the period picker opens collapsed (P1) with a bigger
// expand chevron (P2); This month's note names the days it compares (P3); the
// tab bar clears the iPhone home indicator (T1).
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_15_2.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];

function load(nowIso) {
  const FIXED = new Date(nowIso).getTime();
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
  return dom.window;
}
const txt = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

(async () => {
  // ── P1 / P2: period picker ─────────────────────────────────────────────────
  {
    const w = load("2026-11-09T07:30:00+10:00"); await sleep(300);
    const d = w.document, E = s => w.eval(s), $$ = s => [...d.querySelectorAll(s)];
    E(SEED);
    E(`_dataVersion++; _invalidateYearCache(); document.getElementById("welcome-modal")?.classList.add("hidden");`);
    E(`switchTab("all"); activeYear = "all-years"; activeMonth = null; render(); openPeriodSheet();`);
    ok(d.getElementById("year-sheet").classList.contains("open"), "the picker opens");
    ok($$("#ps-body .ps-fold:not(.folded) .ps-months").length === 0, "from All, every year is collapsed");
    ok($$("#ps-body .ps-exp").every(b => b.getAttribute("aria-expanded") === "false" && txt(b) === "▾"), "every chevron points down");
    E(`psPick("2026", "2026-11"); openPeriodSheet();`);
    ok($$("#ps-body .ps-fold:not(.folded) .ps-months").length === 0, "from November 2026, every year is still collapsed");
    d.querySelector('#ps-body [data-exp="2026"]').click();
    ok($$("#ps-body .ps-fold:not(.folded) .ps-months").length === 1 && $$("#ps-body .ps-fold:not(.folded) .ps-months button").some(b => txt(b) === "Nov"), "▾ opens that year's months");
    ok(txt(d.querySelector('#ps-body [data-exp="2026"]')) === "▴", "…and its chevron points up");
    d.querySelector('#ps-body [data-exp="2026"]').click();
    ok($$("#ps-body .ps-fold:not(.folded) .ps-months").length === 0, "▴ closes it again");
    E(`closeSheets(); openPeriodSheet();`);
    ok($$("#ps-body .ps-fold:not(.folded) .ps-months").length === 0, "reopening starts collapsed again");
    const rule = html.match(/\.ps-exp \{[^}]*\}/)[0];
    const fs_ = +rule.match(/font-size:\s*(\d+)px/)[1], wd = +rule.match(/width:\s*(\d+)px/)[1], ht = +rule.match(/height:\s*(\d+)px/)[1];
    ok(fs_ >= 18, "chevron is at least 18px: " + fs_);
    ok(wd >= 40 && ht >= 40, "expand button is at least 40×40: " + wd + "×" + ht);
    ok(/justify-content:\s*center/.test(rule) && /align-items:\s*center/.test(rule), "chevron is centred");
    ok(E(`document.getElementById("about-version-meta").textContent.trim().replace("Version ", "")`) === E(`document.getElementById("version-footer").textContent.trim()`), "About matches the footer");
    const v = E(`document.getElementById("version-footer").textContent.trim()`).replace("v", "").split(".").map(Number);
    ok(v[0] > 6 || (v[0] === 6 && (v[1] > 15 || (v[1] === 15 && v[2] >= 2))), "version is v6.15.2 or later");
    w.close();
  }

  // ── P3: This month's note ─────────────────────────────────────────────────
  const note = async (nowIso) => {
    const w = load(nowIso); await sleep(300);
    w.eval(SEED);
    w.eval(`_dataVersion++; _invalidateYearCache(); document.getElementById("welcome-modal")?.classList.add("hidden"); switchTab("home"); vhRenderMonth();`);
    const t = txt(w.document.querySelector("#vh-month-body .vh-month-note"));
    const body = txt(w.document.getElementById("vh-month-body"));
    w.close();
    return { t, body };
  };
  let r = await note("2026-11-09T07:30:00+10:00");
  ok(r.t === "Compared with 1–9 Oct, the same days last month.", "9 Nov: " + JSON.stringify(r.t));
  ok(!/first \d+ days? of each month/.test(r.body), "…the old wording is gone");
  r = await note("2026-11-01T07:30:00+10:00");
  ok(r.t === "Compared with 1 Oct, the same day last month.", "1 Nov: " + JSON.stringify(r.t));
  r = await note("2027-03-30T07:30:00+10:00");
  ok(r.t === "Compared with 1–28 Feb, all of last month.", "30 Mar 2027: " + JSON.stringify(r.t));
  r = await note("2026-12-31T07:30:00+10:00");
  ok(r.t === "", "no note on the last day of the month: " + JSON.stringify(r.t));
  r = await note("2026-10-31T07:30:00+10:00");
  ok(r.t === "", "no note on 31 Oct either");
  r = await note("2026-12-30T07:30:00+10:00");
  ok(r.t === "Compared with 1–30 Nov, the same days last month.", "30 Dec: " + JSON.stringify(r.t));

  // ── T1: safe areas ─────────────────────────────────────────────────────────
  ok(/<meta name="viewport" content="[^"]*viewport-fit=cover/.test(html), "viewport-fit=cover, so safe-area insets are real");
  const tb = html.match(/#tabbar \{[^}]*\}/g).find(x => /position: fixed/.test(x));
  ok(/padding: 6px 4px max\((\d+)px, env\(safe-area-inset-bottom/.test(tb) && +tb.match(/max\((\d+)px/)[1] >= 12, "tab bar leaves at least 12px under the labels, or the home indicator's inset");
  ok(/#header \{ padding: env\(safe-area-inset-top, 0px\) 16px 0; height: calc\(52px \+ env\(safe-area-inset-top, 0px\)\); \}/.test(html), "phone header clears the status bar");
  ok(/body \{ padding-left: env\(safe-area-inset-left, 0px\); padding-right: env\(safe-area-inset-right, 0px\); \}/.test(html), "landscape content clears the notch");
  ok(/#add-sheet  \{ padding: 0 20px calc\(\d+px \+ env\(safe-area-inset-bottom/.test(html), "the Add sheet clears the home indicator");

  console.log(`v6.15.2: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
  if (errors.length) console.log(errors.slice(0, 5));
  process.exit(fail || errors.length ? 1 : 0);
})();
