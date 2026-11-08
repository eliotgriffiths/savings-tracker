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
const GREEN = "rgb(61, 158, 110)", RED = "rgb(207, 95, 87)", GOLD = "rgb(201, 168, 76)";

// net = in - out, all in November 2026 so Home's This Month sees them.
const load = (dep, wit) => E(`triggerCloudSync = () => {}; tombstones = new Set(); yearMode = "calendar";
  accounts = [{ id: "ing", name: "ING", color: "#e8834a", currency: "AUD" }, { id: "ub", name: "UBank", color: "#6aa2d8", currency: "AUD" }];
  data = { "2026": { saved: [["2026-11-02", ${dep}, "d1", 1, null, null, "ing"]], removed: [["2026-11-03", ${wit}, "w1", 2, null, null, "ub"]] } };
  _dataVersion++; _invalidateYearCache(); activeTab = "all"; activeYear = "all-years"; activeAccountFilter = "all";
  renderSidebar(); renderMain(); vhRenderMonth(); asRender();`);

setTimeout(() => {
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
    const sn = d.getElementById("stat-net");
    ok(color(sn) === want, `${name}: transaction list Net ${color(sn)}`);
    const lt = d.getElementById("foot-total");
    ok(color(lt) === want, `${name}: transaction list Total row ${color(lt)}`);
    const sb = d.getElementById("sidebar-all-net");
    ok(!sb || color(sb) === want, `${name}: sidebar all-years Net`);
    ok(![hdr, asNet, ft, hm, sn].some(el => color(el) === GOLD), `${name}: nothing gold`);

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

  // Single foreign-currency account path of the list's Net stat.
  E(`accounts.push({ id: "us", name: "USD acc", color: "#999", currency: "USD" }); exchangeRates = Object.assign(exchangeRates || {}, { USD: 1.5 });
     data = { "2026": { saved: [["2026-11-02", 10, "u1", 1, null, null, "us"]], removed: [["2026-11-03", 30, "u2", 2, null, null, "us"]] } };
     _dataVersion++; _invalidateYearCache(); activeYear = "all-years"; activeAccountFilter = "us"; renderMain();`);
  ok(color(d.getElementById("stat-net")) === RED, "single foreign account: deficit Net is red");

  ok(d.getElementById("version-footer").textContent.trim() === "v6.12.1", "footer version");
  ok(/Version v6\.12\.1/.test(html), "About version");
  ok(!/\.net[^{]*\{[^}]*var\(--gold\)/.test(html.replace(/\.vh-heat[^{]*\{[^}]*\}/g, "")), "no Net rule left in gold");

  console.log(`net_colour: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
  errors.forEach(e => console.log("PAGE ERROR:", e));
  process.exit(fail || errors.length ? 1 : 0);
}, 400);
