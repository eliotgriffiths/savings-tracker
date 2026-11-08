// v6.15.1 regression tests: readable figures. DM Serif Display is only for word titles
// and the big Home balance; every other figure is DM Sans 600 with tabular digits.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/figures.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
  beforeParse(w) {
    w.fetch = () => Promise.reject(new Error("offline (test)")); w.scrollTo = () => {};
    w.Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
  },
});
const w = dom.window, d = w.document;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const norm = s => s.replace(/\s+/g, " ").trim();

// Every style rule in the page, including those inside @media blocks
const rules = [];
const walk = list => { for (const r of list) { if (r.selectorText) rules.push(r); else if (r.cssRules) walk(r.cssRules); } };
for (const sh of d.styleSheets) walk(sh.cssRules);
const ruleFor = sel => rules.find(r => norm(r.selectorText) === sel && r.style.fontFamily);

// ── the serif is only for titles and the Home balance ───────────────────────
const SERIF_OK = new Set([
  "#header h1", ".fy-title", ".tx-popup-box h3", ".modal-box h2", ".recur-history-title h3", ".as-title",
  ".as-sh-head h3", ".sheet-title", ".sp-head h2", ".info-popup-box h3", "#native-print-notice h1",
  "#privacy-header h2, #about-header h2", "#privacy-body .pp-title, #about-body .pp-title",
  "#privacy-body .pp-section-title, #about-body .pp-section-title", "#privacy-body .pp-contact-title, #about-body .pp-contact-title",
  "#home-panel .vh-hero-total", "#home-panel .vh-home-title", "#home-panel .vh-chart-title", "#home-panel .vh-modal-title",
]);
const serifRules = rules.filter(r => /DM Serif Display/.test(r.style.fontFamily || ""));
serifRules.forEach(r => ok(SERIF_OK.has(norm(r.selectorText)), "serif used only for a title: " + norm(r.selectorText)));
ok(serifRules.length >= 15, "the titles keep the serif: " + serifRules.length);
ok(/DM Serif Display/.test(ruleFor("#home-panel .vh-hero-total").style.fontFamily), "the Home balance stays serif");

// Serif set inline in the markup is only ever on a heading made of words
const inline = [...d.querySelectorAll("[style*='DM Serif Display']")];
ok(inline.length > 0, "inline serif headings found: " + inline.length);
inline.forEach(el => ok(!/\d/.test(el.textContent), "inline serif is a word heading: " + el.textContent.trim().slice(0, 30)));

// ── every figure is DM Sans 600 with tabular digits ─────────────────────────
const FIGURES = [
  ".as-sum .v", "#home-panel .vh-recap-hero", "#home-panel .vh-jrn-age", "#home-panel .vh-rhy-big", "#home-panel .vh-rcd-val",
  "#home-panel .vh-draw-hero", "#home-panel .vh-fxs-hero", "#home-panel .vh-donut-pct", "#home-panel .vh-int-fig-val",
  "#home-panel .vh-month-card-val", "#home-panel .vh-streak-n", "#home-panel .vh-streak-best-n",
  "#vh-chart-tooltip strong", "#vh-heat-pop strong",
];
FIGURES.forEach(sel => {
  const r = ruleFor(sel);
  ok(!!r, "figure rule exists: " + sel);
  if (!r) return;
  ok(/^'?"?DM Sans/.test(r.style.fontFamily), `${sel} is DM Sans: ${r.style.fontFamily}`);
  ok(r.style.fontWeight === "600", `${sel} is weight 600: ${r.style.fontWeight}`);
  ok(/tabular-nums/.test(r.style.fontVariantNumeric), `${sel} has tabular digits`);
});
// The Search cards come down a size so the wider sans fits
ok(ruleFor(".as-sum .v").style.fontSize === "17px", "Search card figures are 17px");
ok(rules.some(r => norm(r.selectorText) === ".as-sum .v" && r.style.fontSize === "15px" && r.parentRule && /360px/.test(r.parentRule.conditionText || r.parentRule.media?.mediaText || "")), "and 15px on the narrowest phones");

// ── on screen ────────────────────────────────────────────────────────────────
setTimeout(async () => {
  try {
    w.eval(SEED);
    w.eval("switchTab('home')");
    await new Promise(r => setTimeout(r, 50));
    const fam = el => w.getComputedStyle(el).fontFamily;
    const month = d.querySelectorAll("#home-panel .vh-month-card-val");
    ok(month.length === 3, "This Month cards rendered: " + month.length);
    month.forEach(el => ok(/DM Sans/.test(fam(el)), "This Month figure shows in DM Sans: " + el.textContent));
    const hero = d.querySelector("#home-panel .vh-hero-total");
    ok(hero && /DM Serif Display/.test(fam(hero)), "the balance shows in the serif");
    const title = d.querySelector("#home-panel .vh-chart-title");
    ok(!title || /DM Serif Display/.test(fam(title)), "chart titles stay serif");

    // version
    const vf = d.getElementById("version-footer").textContent.trim();
    const [, mi, pa] = vf.match(/^v6\.(\d+)\.(\d+)$/) || [];
    ok(+mi > 15 || (+mi === 15 && +pa >= 1), "version v6.15.1 or later: " + vf);
    ok(html.includes(`Version ${vf}<`), "About matches the footer");
  } catch (e) { fail++; console.log("FAIL: threw", e); }
  ok(errors.length === 0, "no page errors: " + errors.join(" | "));
  console.log(`figures: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 400);
