// v6.15.0 regression tests: the "Brass, punchier" look. Every app colour comes from
// the named roles in :root, every text role is readable, warnings are orange.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/look.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
  beforeParse(w) { w.fetch = () => Promise.reject(new Error("offline (test)")); w.scrollTo = () => {}; },
});
const w = dom.window, d = w.document;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };

// ── the roles ────────────────────────────────────────────────────────────────
const root = html.match(/:root \{([\s\S]*?)\n  \}/)[1];
const role = n => (root.match(new RegExp(`--${n}:\\s*([^;]+);`)) || [])[1]?.trim();
const ROLES = ["bg0", "bg1", "bg2", "bg3", "bg4", "text-1", "text-2", "text-3", "accent", "accent-ink", "accent-dim", "hero", "in", "out", "interest", "attention", "fill-ink"];
ROLES.forEach(r => ok(/^#[0-9a-f]{6}$/i.test(role(r) || ""), `role --${r} is a colour: ${role(r)}`));
ok(role("bg0") === "#07080b" && role("accent") === "#f2c14e" && role("in") === "#3ddc97" && role("out") === "#ff6b62", "it's Brass, punchier");
["gold", "green", "red", "vh-blue", "gold-dim", "gold-glow"].forEach(r => ok(/^var\(--|^color-mix/.test(role(r) || ""), `old name --${r} follows a role: ${role(r)}`));

// ── contrast: 4.5:1 for every text role on the page and both card surfaces ──
const lum = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
["text-1", "text-2", "text-3", "accent", "hero", "in", "out", "interest", "attention"].forEach(t => {
  const worst = Math.min(...["bg0", "bg2", "bg3"].map(bg => ratio(role(t), role(bg))));
  ok(worst >= 4.5, `--${t} is readable everywhere: ${worst.toFixed(2)}:1`);
});
ok(ratio(role("accent-ink"), role("accent")) >= 4.5, "text on the accent is readable");
["in", "out", "interest", "attention"].forEach(f => ok(ratio(role("fill-ink"), role(f)) >= 4.5, `text on a --${f} fill is readable: ${ratio(role("fill-ink"), role(f)).toFixed(2)}:1`));

// ── no stray colours ─────────────────────────────────────────────────────────
// Strip what's allowed: the role block, fonts, the spreadsheet library, the print
// documents (white paper, own palette), account colour palettes, Google's logos.
let app = html.replace(/:root \{[\s\S]*?\n  \}/, "")
  .replace(/<style id="vault-fonts">[\s\S]*?<\/style>/, "")
  .replace(/<!-- SheetJS[\s\S]*?<\/script>/, "");
const cut = (start) => { const a = app.indexOf(start); const b = app.indexOf("\n}\n", a); app = app.slice(0, a) + app.slice(b); };
cut("function openPdfWindow("); cut("function printCharts(");
app = app.replace(/const ACCOUNT_COLORS[^\n]*/, "").replace(/const VH_CX_PALETTE[^\]]*\]/, "").replace(/const colors = \[[^\]]*\]/, "")
  .replace(/\{ id: "acc_[^}]*\}/g, "");
const OLD = ["#c9a84c", "#8a6f2e", "#3d9e6e", "#5ec497", "#cf5f57", "#c0504a", "#e07a75", "#c0392b", "#5ba6d3", "#4a95c2", "#c8923a", "#0f0f11", "#2c6b4a"];
OLD.forEach(h => { const n = app.toLowerCase().split(h).length - 1; ok(n === 0, `old palette colour ${h} is gone (${n} left)`); });
const oldRgba = app.match(/rgba\(\s*(201,\s*168,\s*76|212,\s*175,\s*55|61,\s*158,\s*110|192,\s*80,\s*74|207,\s*95,\s*87|192,\s*57,\s*43|91,\s*166,\s*211|200,\s*146,\s*58|201,\s*140,\s*40)/g) || [];
ok(oldRgba.length === 0, `no tints of the old palette (${oldRgba.length} left)`);
ok(!/toast\([^;]*"#[0-9a-f]{3,6}"\)/i.test(app), "toasts take a kind, not a colour");

// ── behaviour ────────────────────────────────────────────────────────────────
setTimeout(() => {
  const cs = el => w.getComputedStyle(el);
  const probe = v => { const el = d.createElement("span"); el.style.color = v; d.body.appendChild(el); const c = cs(el).color; el.remove(); return c; };
  ok(probe("var(--in)") === "rgb(61, 220, 151)", "the page resolves --in: " + probe("var(--in)"));
  ok(/<meta name="theme-color" content="#07080b">/.test(html), "Safari's toolbar matches the page");
  // Notices are orange (attention), errors red, both with dark ink
  ok(/#toast\[data-kind="notice"\] \{ background: var\(--attention\); border-color: transparent; color: var\(--fill-ink\); \}/.test(html), "notice toasts are orange with dark ink");
  ok(/#toast\[data-kind="error"\]  \{ background: var\(--out\); border-color: transparent; color: var\(--fill-ink\); \}/.test(html), "error toasts are red with dark ink");
  ["local-permission-info", "cc-no-rates-warn", "cm-rates-warn", "ai-enc-warning", "import-review-problem"].forEach(id => {
    const st = d.getElementById(id).getAttribute("style");
    ok(/--attention/.test(st) && !/--accent|--gold/.test(st), `${id} is a warning, so orange`);
  });
  // The punch
  ok(/\.vh-hero-total \{[^}]*background:var\(--hero-grad\); -webkit-background-clip:text;/.test(html), "the Home balance has the gold gradient");
  ok(/#tb-add \{[\s\S]*?0 6px 22px color-mix\(in srgb, var\(--accent\) 38%, transparent\)/.test(html), "＋ glows");
  ok(/\.tb-btn\.nav-on svg \{ filter: drop-shadow/.test(html), "the current tab glows");
  ok(/\.pbtn-primary \{ background: var\(--accent\); color: var\(--accent-ink\);[^}]*box-shadow/.test(html), "primary buttons: accent, its ink, a glow");
  // Coloured fills take dark ink
  ok(/\.add-type-btn\.active-interest \{ background: var\(--interest\); color: var\(--fill-ink\); \}/.test(html), "the interest type button uses dark ink");
  ok(/\.pbtn-danger \{ background: var\(--out\); color: var\(--fill-ink\);/.test(html), "danger buttons use dark ink");
  // Charts follow the look, and print maps the roles to paper colours
  ok(/const C_GREEN = "var\(--in\)";/.test(html) && /const C_RED   = "var\(--out\)";/.test(html) && /const C_BLUE  = "var\(--interest\)";/.test(html), "charts use the roles");
  ok(/\.replace\(\/var\\\(--in\\\)\/g,\s*"#2a7a52"\)/.test(html) && /\.replace\(\/var\\\(--accent\\\)\/g,\s*"#8a7530"\)/.test(html), "printed charts map the roles to the print palette");

  const vf = d.getElementById("version-footer").textContent.trim();
  ok(/^v6\.(1[5-9]|[2-9]\d)\.\d+$/.test(vf) && html.includes(`Version ${vf}<`), "version v6.15.0 or later, About matches: " + vf);

  console.log(`look: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
  errors.slice(0, 5).forEach(e => console.log("PAGE ERROR:", e.slice(0, 300)));
  process.exit(fail || errors.length ? 1 : 0);
}, 400);
