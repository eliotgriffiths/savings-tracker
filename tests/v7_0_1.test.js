// v7.0.1 regression test (15 Nov 2026): the handle stays at the top of the Menu, period and Add
// sheets while they scroll. It was the first thing inside the scrolling sheet, so it scrolled
// away with the rows (Eliot's screen recording, 22:21). Checked in headless Chrome too: after
// scrolling the Menu 200 px the handle stayed at the sheet's top edge (it moved 200 px up).
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v7_0_1.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const errors = [];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };

const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
  beforeParse(w) {
    w.fetch = () => Promise.reject(new Error("offline (test)"));
    w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
  },
});
const w = dom.window, d = w.document;

setTimeout(() => {
  try {
    // The CSS as written (jsdom's stylesheet reader drops some of these declarations)
    const rule = sel => { const m = html.match(new RegExp(sel.replace(/[.#:]/g, c => "\\" + c) + "\\s*\\{([^}]*)\\}")); return m ? m[1] : ""; };
    const decl = (sel, prop) => { const m = rule(sel).match(new RegExp("(?:^|[;\\s])" + prop + ":\\s*([^;]+);")); return m ? m[1].trim() : ""; };

    ok(decl(".sheet-handle", "position") === "sticky" && decl(".sheet-handle", "top") === "0",
       "the sheets' handle is pinned to the top of the sheet (it scrolled away with the rows)");
    // v7.2.1: the strip became see-through (rows scroll up to the sheet's own edge, the bar floats)
    ok(/--bg2|transparent/.test(decl(".sheet-handle", "background")), "…on a strip that rows scroll under (solid until v7.2.1, see-through since)");
    ok(+decl(".sheet-handle", "z-index") >= 3, "…above the rows");
    ok(decl(".sheet-handle::before", "top") === "9px" && decl(".sheet-handle::before", "width") === "36px" && decl(".sheet-handle::before", "height") === "4px",
       "the bar is where it was (9 px down, 36 × 4), so the hand-over in a tray move doesn't shift it");
    ok(decl("#add-sheet .sheet-handle", "margin") === "0 -20px", "Add's strip reaches the sheet's edges past its padding");
    ["menu-sheet", "year-sheet", "add-sheet"].forEach(id => {
      const sh = d.getElementById(id);
      ok(sh && sh.firstElementChild && sh.firstElementChild.classList.contains("sheet-handle"), `${id} starts with the handle`);
    });

    const v = s => s.replace(/^\D*/, "").split(".").map(Number);
    const about = v(d.getElementById("about-version-meta").textContent), foot = v(d.getElementById("version-footer").textContent);
    const ge = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    ok(ge(about, [7, 0, 1]) >= 0 && about.join() === foot.join(), "version is 7.0.1 or later, About matches the footer");
  } catch (e) { fail++; console.log("ERROR:", e.stack); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => console.log("PAGE ERROR:", e));
  console.log(`v7.0.1: ${pass} passed, ${fail} failed, ${pageErrors.length} page errors`);
  process.exit(fail || pageErrors.length ? 1 : 0);
}, 300);
