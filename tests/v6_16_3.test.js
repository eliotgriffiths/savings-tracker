// v6.16.3 regression tests (9 Nov 2026):
// Popup trays follow the finger while dragged (no transition mid-drag), and the
// Settings rows use the Menu's row look.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_16_3.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };

const FIXED = new Date("2026-11-09T07:30:00+10:00").getTime();
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
const d = dom.window.document;

setTimeout(() => {
  // All rule text, flattened (media blocks included), for selector → declarations lookups.
  const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");
  const decl = (sel, prop) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("(?:^|[}\\n,]\\s*)" + esc + "\\s*\\{([^}]*)\\}", "g");
    let m, val = null;
    while ((m = re.exec(css))) { const v = new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)").exec(m[1]); if (v) val = v[1].trim(); }
    return val;
  };

  // 1. Dragging: the panel's transition is switched off by a rule that outranks it.
  ok(/\.pop-anim\.vp \.vp-panel\.vp-drag\s*\{\s*transition:\s*none !important;?\s*\}/.test(css),
    "a drag switches the popup panel's transition off (outranking .pop-anim.vp .vp-panel)");
  ok(!/\.pop-anim\.vp \.vp-panel\.vp-drag\s*\{[^}]*animation/.test(css),
    "the drag rule leaves the slide-up animation alone (no replay on release)");

  // 2. Settings rows = Menu rows.
  const pairs = [
    [".sp-t", ".menu-item-label", "font-size"], [".sp-t", ".menu-item-label", "font-weight"],
    [".sp-s", ".menu-item-sub", "font-size"], [".sp-s", ".menu-item-sub", "color"],
    [".sp-ic", ".menu-item-icon", "width"], [".sp-ic", ".menu-item-icon", "height"],
    [".sp-ic", ".menu-item-icon", "background"], [".sp-ic", ".menu-item-icon", "border"],
    [".sp-item", ".menu-item-btn", "padding"], [".sp-item", ".menu-item-btn", "gap"],
    [".sp-item", ".menu-item-btn", "border-bottom"],
    [".sp-item:active", ".menu-item-btn:active", "background"],
    [".sp-label", ".menu-section-label", "font-size"], [".sp-label", ".menu-section-label", "padding"],
  ];
  pairs.forEach(([a, b, prop]) => {
    const va = decl(a, prop), vb = decl(b, prop);
    ok(va && va === vb, `Settings ${a} ${prop} (${va}) matches Menu ${b} (${vb})`);
  });
  ok(decl(".sp-group", "border") === "0" && decl(".sp-group", "background") === "none" && decl(".sp-group", "margin") === "0",
    "Settings rows aren't boxed in groups");
  ok(decl(".sp-arr", "display") === "none", "no chevrons on Settings rows (the Menu has none on rows that open a popup)");
  ok(/\.sp-group:last-child > \.sp-item:last-child\s*\{\s*border-bottom:\s*none/.test(css),
    "only the very last Settings row drops its divider, like the Menu");
  ok(d.querySelectorAll("#settings-popup .sp-item").length === 7, "Settings still has its 7 rows");

  // Version: this or later, About matches footer.
  const ver = t => (t.match(/v(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
  const a = ver(d.getElementById("about-version-meta").textContent), f = ver(d.getElementById("version-footer").textContent);
  const atLeast = (v, w) => v[0] !== w[0] ? v[0] > w[0] : v[1] !== w[1] ? v[1] > w[1] : v[2] >= w[2];
  ok(atLeast(a, [6, 16, 3]), "version is v6.16.3 or later");
  ok(a.join(".") === f.join("."), "About and footer show the same version");

  ok(errors.length === 0, "no page errors: " + errors.slice(0, 3).join(" | "));
  console.log(`v6.16.3: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 1500);
