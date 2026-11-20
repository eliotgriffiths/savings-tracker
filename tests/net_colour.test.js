// v6.12.1 regression tests: every Net figure is green for a surplus (zero
// included) and red for a deficit. Never gold. design-rules.md §1.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/net_colour.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
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
  },
});
const w = dom.window, d = w.document;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const E = s => w.eval(s);
const color = el => w.getComputedStyle(el).color;
// The look's roles, read from the page so a new look doesn't break this test.
let GREEN, RED, GOLD;
const roleColor = role => { const el = d.createElement("span"); el.style.color = `var(${role})`; d.body.appendChild(el); const c = w.getComputedStyle(el).color; el.remove(); return c; };

// net = in - out, all in November 2026 so Home's This Month sees them.
const load = (dep, wit) => E(`triggerCloudSync = () => {}; tombstones = new Set(); yearMode = "calendar";
  accounts = [{ id: "ing", name: "ING", color: "#e8834a", currency: "AUD" }, { id: "ub", name: "UBank", color: "#6aa2d8", currency: "AUD" }];
  data = { "2026": { saved: [["2026-11-02", ${dep}, "d1", 1, null, null, "ing"]], removed: [["2026-11-03", ${wit}, "w1", 2, null, null, "ub"]] } };
  _dataVersion++; _invalidateYearCache(); activeTab = "all"; asF = asBlank(); asSetQuery("");
  renderSidebar(); renderMain(); vhRenderMonth(); asRender();`);

setTimeout(() => {
  GREEN = roleColor("--in"); RED = roleColor("--out"); GOLD = roleColor("--accent");
  ok(GREEN !== RED && GREEN !== GOLD && /^rgb/.test(GREEN), "roles resolve: " + [GREEN, RED, GOLD].join(" / "));
  ok(E(`typeof netNeg`) === "function" && E(`typeof netColor`) === "function", "shared net helpers exist");
  ok(E(`netNeg(-0.004)`) === false && E(`netNeg(0)`) === false && E(`netNeg(-0.01)`) === true, "rounds-to-zero counts as a surplus");
  E(`showPdfPreview = h => { window.__pdf = h; };`);

  const cases = [["surplus", 500, 200, GREEN, "surplus"], ["deficit", 200, 500, RED, "deficit"], ["zero", 300, 300, GREEN, "surplus"], ["tiny negative", 300, 300.004, GREEN, "surplus"]];
  for (const [name, dep, wit, want, word] of cases) {
    load(dep, wit);
    const hdr = d.getElementById("grand-net");
    ok(color(hdr) === want, `${name}: header Net ${color(hdr)}`);
    const asNet = d.getElementById("as-net");
    ok(color(asNet) === want, `${name}: Advanced Search Net card ${color(asNet)}`);
    ok(d.getElementById("as-net-c").textContent === word, `${name}: search card says ${word}`);
    const ft = d.getElementById("as-foot-total");
    ok(color(ft) === want, `${name}: search Total row ${color(ft)}`);
    const hm = d.querySelector("#vh-month-body .vh-month-card.net .vh-month-card-val");
    ok(hm && color(hm) === want, `${name}: Home This Month Net ${hm && color(hm)}`);
    // v8.0.0: the old list's Net and Total (stat-net, foot-total) and the sidebar's years are
    // gone; Transactions' Net card and Total row above are the list's now.
    ok(!d.getElementById("stat-net") && !d.getElementById("foot-total") && !d.getElementById("sidebar-all-net"), `${name}: no second list`);
    ok(![hdr, asNet, ft, hm].some(el => color(el) === GOLD), `${name}: nothing gold`);

    // Print: rendered from the same rows, with the print palette.
    E(`window.__pdf = ""; openPdfWindow({ title: "t", subLine: "", rows: [
      { date: "2026-11-02", type: "Deposit", amt: ${dep}, gAmt: ${dep}, accName: "ING", accCur: "AUD" },
      { date: "2026-11-03", type: "Withdrawal", amt: ${wit}, gAmt: ${wit}, accName: "UBank", accCur: "AUD" }] });`);
    const pdf = E(`window.__pdf`);
    const pd = new JSDOM(pdf).window;
    const card = pd.document.querySelector(".summary-card.net");
    const pc = pd.getComputedStyle(card.querySelector(".value")).color;
    ok(pc === (want === RED ? "rgb(160, 48, 48)" : "rgb(42, 122, 82)"), `${name}: print Net ${pc}`);
    ok(card.querySelector(".count").textContent === word, `${name}: print says ${word}`);
    ok(!/7a6020/.test(pdf), `${name}: old print gold gone`);
  }

  // Single foreign-currency account: the cards in its own currency (v8.0.0: ported from the list).
  E(`accounts.push({ id: "us", name: "USD acc", color: "#999", currency: "USD" }); exchangeRates = Object.assign(exchangeRates || {}, { USD: 1.5 });
     data = { "2026": { saved: [["2026-11-02", 10, "u1", 1, null, null, "us"]], removed: [["2026-11-03", 30, "u2", 2, null, null, "us"]] } };
     _dataVersion++; _invalidateYearCache(); asF = asBlank(); asF.accs = ["us"]; renderMain();`);
  ok(color(d.getElementById("as-net")) === RED && /USD/.test(d.getElementById("as-net-l").textContent), "single foreign account: deficit Net is red, in USD");

  // v6.12.1 or later, with About matching the footer.
  const vf = d.getElementById("version-footer").textContent.trim();
  ok((([M, m, p]) => M > 6 || (M === 6 && (m > 12 || (m === 12 && p >= 1))))((vf.match(/^v(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number)), "footer version is v6.12.1 or later: " + vf);
  ok(html.includes(`Version ${vf}<`), "About matches the footer");
  ok(!/\.net[^{]*\{[^}]*var\(--gold\)/.test(html.replace(/\.vh-heat[^{]*\{[^}]*\}/g, "")), "no Net rule left in gold");

  console.log(`net_colour: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
  errors.forEach(e => console.log("PAGE ERROR:", e));
  process.exit(fail || errors.length ? 1 : 0);
}, 400);
