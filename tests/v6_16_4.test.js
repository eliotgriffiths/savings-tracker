// v6.16.4 regression tests (9 Nov 2026):
// Add transaction folds the recurring row instead of jumping when you pick Interest;
// the period picker folds a year's months open and shut; Home, Transactions and Search
// share one title size on a phone.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_16_4.test.js
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
const $$ = s => [...d.querySelectorAll(s)];
const txt = el => (el && el.textContent || "").trim();

setTimeout(() => {
  w.eval(SEED);
  w.eval("render()");
  const css = $$("style").map(s => s.textContent).join("\n");

  // The fold itself
  ok(/\.vp-fold \{ display: grid; grid-template-rows: 1fr;/.test(css) && /\.vp-fold\.folded \{ grid-template-rows: 0fr; opacity: 0; visibility: hidden;/.test(css),
    "a fold animates its height (grid rows 1fr ↔ 0fr) and hides what's folded");
  ok(/\.vp-fold > \.vp-fold-in \{ min-height: 0; overflow: hidden; \}/.test(css), "the fold clips its content, so padding and margins fold too");
  ok(/cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/.test((css.match(/\.vp-fold \{[^}]*\}/) || [""])[0]), "it uses the trays' easing");
  ok(/prefers-reduced-motion: reduce\) \{ \.vp-fold, \.vp-fold\.folded \{ transition: none; \}/.test(css), "Reduce Motion switches it off");

  // 1. Add transaction (phone)
  w.eval("openAddSheet()");
  const mFold = d.getElementById("mob-recur-fold");
  ok(mFold && mFold.contains(d.getElementById("mob-recur-toggle")), "the recurring row sits in a fold");
  ok(!mFold.classList.contains("folded"), "Deposit shows the recurring row");
  w.eval("setMobType('interest')");
  ok(mFold.classList.contains("folded"), "Interest folds it shut");
  ok(d.getElementById("mob-recur-toggle").style.display !== "none", "…without display:none (which made the tray jump)");
  w.eval("setMobType('withdraw')");
  ok(!mFold.classList.contains("folded"), "Withdrawal folds it open again");
  w.eval("setMobType('interest'); closeSheets(); openAddSheet()");
  ok(!mFold.classList.contains("folded") && mFold.style.transition === "", "opening the tray shows it straight away and leaves the animation on");
  // Recurring on, then Interest: the row folds and recurring switches off
  w.eval("setMobType('deposit'); toggleMobRecur(); setMobType('interest')");
  ok(mFold.classList.contains("folded") && w.eval("mobRecurOn") === false && txt(d.getElementById("mob-add-btn")) === "Add interest",
    "Interest with recurring on folds the row and turns recurring off");
  w.eval("closeSheets()");

  // Wide-screen Add popup
  const dFold = d.getElementById("desk-recur-fold");
  ok(dFold && dFold.contains(d.getElementById("desk-recur-toggle")), "the wide-screen recurring row sits in a fold too");
  w.eval("setDeskType('interest')"); ok(dFold.classList.contains("folded"), "wide screen: Interest folds it");
  w.eval("setDeskType('deposit')"); ok(!dFold.classList.contains("folded"), "wide screen: Deposit opens it");

  // 2. Period picker: gone in v8.0.0 (its years and months are the Filters sheet's Dates menu,
  // and the Filters sheet's own folds use vpFold: tested in v8_0_0.test.js)
  ok(!d.getElementById("ps-body") && !d.getElementById("year-sheet"), "no period picker");

  // 3. Titles
  ok(/@media \(max-width: 640px\) \{\s*\.fy-title, \.as-title, #home-panel \.vh-home-title \{ font-size: 22px;/.test(css),
    "Home, Transactions and Search titles are the same size on a phone");
  ok(css.lastIndexOf(".fy-title, .as-title, #home-panel .vh-home-title") > css.lastIndexOf(".fy-title { font-size: 15px"),
    "…and that rule comes after the old 15 px one, so it wins");

  // 4. Summary cards: since v8.0.0 there's one set (Transactions'), with the count lines, centred
  w.eval("navTab('list')");
  const plural = n => n + " transaction" + (n === 1 ? "" : "s");
  const nIn = w.eval("vhAllTx().filter(t => t.kind !== 'wit').length"), nOut = w.eval("vhAllTx().filter(t => t.kind === 'wit').length");
  ok(txt(d.getElementById("as-in-c")) === plural(nIn), "Saved card counts its transactions: " + txt(d.getElementById("as-in-c")));
  ok(txt(d.getElementById("as-out-c")) === plural(nOut), "Withdrawn card counts its transactions: " + txt(d.getElementById("as-out-c")));
  ok(txt(d.getElementById("as-net-c")) === "surplus", "Net card says surplus");
  w.eval("asF.accs = ['ing']; render()");
  const ingIn = w.eval("Object.values(data).reduce((s, y) => s + y.saved.filter(r => (r[6] || getDefaultAccountId()) === 'ing').length, 0)");
  ok(txt(d.getElementById("as-in-c")) === plural(ingIn), "…and follows the account filter: " + txt(d.getElementById("as-in-c")));
  w.eval("asF.accs = []; render()");
  ok(txt(d.getElementById("as-in-c")) === plural(nIn), "…and back for all accounts");
  ok(!d.getElementById("year-summary"), "the list's second set of cards is gone");
  ok(/\.as-sum \{ text-align: center; \}/.test(css), "the cards are centred");
  ok(/@media \(max-width: 380px\) \{[^@]*\.as-sum \.v \{ font-size: 15px; \}/.test(css), "below 380 px the figures drop to 15 px, so six-figure amounts fit");

  // Version
  const ver = t => (t.match(/v(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
  const a = ver(txt(d.getElementById("about-version-meta"))), f = ver(txt(d.getElementById("version-footer")));
  const atLeast = (v, x) => v[0] !== x[0] ? v[0] > x[0] : v[1] !== x[1] ? v[1] > x[1] : v[2] >= x[2];
  ok(atLeast(a, [6, 16, 4]), "version is v6.16.4 or later");
  ok(a.join(".") === f.join("."), "About and footer show the same version");

  ok(errors.length === 0, "no page errors: " + errors.slice(0, 3).join(" | "));
  console.log(`v6.16.4: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 1500);
