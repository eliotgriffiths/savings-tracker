// iOS zooms the page when a text field under 16px is focused. The app forces 16px on
// touch devices (@media (hover: none)), but any rule using !important with a smaller
// size on a form field outranks it. This finds such rules (v6.10.4).
// Run from the repo root: npm install jsdom && node tests/ios_zoom.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8");
const dom = new JSDOM(html, { virtualConsole: new VirtualConsole() });   // no scripts: CSS + markup only
const doc = dom.window.document;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };

const fields = [...doc.querySelectorAll("input, select, textarea")]
  .filter(e => !["checkbox", "radio", "hidden", "file", "range", "color"].includes((e.type || "").toLowerCase()));
ok(fields.length > 20, "found the app's form fields (" + fields.length + ")");

const css = [...doc.querySelectorAll("style")].map(s => s.textContent).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
const offenders = [];
// Leaf rule blocks: "selectors { declarations }" with no nested braces.
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = m[1].trim(), body = m[2];
  const fsm = body.match(/font-size\s*:\s*([\d.]+)px\s*!important/);
  if (!fsm || parseFloat(fsm[1]) >= 16) continue;
  sel.split(",").map(x => x.trim()).filter(Boolean).forEach(one => {
    let hits = [];
    try { hits = [...doc.querySelectorAll(one.replace(/:(hover|focus|active|focus-visible|placeholder|disabled)\b/g, ""))]; } catch { return; }
    hits.filter(h => fields.includes(h)).forEach(h => offenders.push(`${one} → #${h.id || h.className} at ${fsm[1]}px`));
  });
}
ok(offenders.length === 0, "no !important font-size under 16px on a form field:\n  " + offenders.join("\n  "));

// The touch-device rule itself must still be there.
ok(/@media\s*\(hover:\s*none\)\s*\{\s*input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),\s*select,\s*textarea\s*\{\s*font-size:\s*16px\s*!important/.test(css), "16px touch rule present");
// And the two FY pickers that used to be 15px.
ok(/#fy-start-day-select,\s*#fy-start-month-select\s*\{[^}]*font-size:\s*16px\s*!important/.test(css), "FY start pickers are 16px");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
