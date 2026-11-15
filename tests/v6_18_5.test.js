// v6.18.5 regression tests (15 Nov 2026), from Eliot's 13 Nov video of opening Vault: a grey
// flash, then the bare list markup ("FY 20--", empty tabs), then Home all at once. The page is now
// dark from the start, hidden until Home is drawn, and fades in once.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_18_5.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const FIXED = new Date("2026-11-15T08:30:00+10:00").getTime();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── The page source ──────────────────────────────────────────────────────────
const headEnd = html.indexOf("</head>");
const head = html.slice(0, headEnd);
ok(/^<!DOCTYPE html>\n<html lang="en" class="vboot">\n/.test(html), "the page starts hidden (html.vboot)");
ok(/<meta name="color-scheme" content="dark">/.test(head), "the canvas is dark before any style arrives (no white or grey flash)");
ok(/html \{ background: var\(--bg0\); \}/.test(html), "…and the page background is the app's own --bg0");
ok(/html\.vboot body \{ opacity: 0; animation: vbootShow 0s linear 3s forwards; \}/.test(html), "nothing shows until the first screen is drawn, with a 3 s fallback if start-up fails");
ok(/html\.vboot-in body \{ transition: opacity 0\.2s ease-out; \}/.test(html), "then the page fades in once, over 0.2 s");
ok(/@media \(prefers-reduced-motion: reduce\) \{ html\.vboot-in body \{ transition: none; \} \}/.test(html), "…or appears at once with reduced motion");
ok(!head.includes("SheetJS") && !head.includes("var XLSX={}"), "the spreadsheet library isn't in <head> any more (it held up the page's styles)");
const appStart = html.indexOf("<script>", html.indexOf("<body>", headEnd));
const appEnd = html.indexOf("</script>", appStart);
const lib = html.indexOf("<!-- SheetJS 0.18.5");
ok(html.slice(appStart, appEnd).includes("function initApp()") && lib > appEnd, "it runs after the app's own script, once Home is drawn");
ok(/\ntry \{ initApp\(\); \} finally \{ vaultBootReveal\(\); \}\n/.test(html), "the page is shown after start-up even if start-up throws");

const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
  beforeParse(w) {
    const RD = w.Date;
    class MD extends RD { constructor(...a) { if (!a.length) super(FIXED); else super(...a); } static now() { return FIXED; } }
    MD.UTC = RD.UTC; MD.parse = RD.parse; w.Date = MD;
    w.fetch = () => Promise.reject(new Error("offline (test)"));
    w.scrollTo = () => {};
    w.Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
  },
});
const w = dom.window, d = w.document;

setTimeout(async () => {
  try {
    const h = d.documentElement;
    ok(!h.classList.contains("vboot"), "after start-up the page is shown");
    ok(h.classList.contains("vboot-in"), "…fading in");
    await sleep(320);
    ok(!h.classList.contains("vboot-in"), "…and the fade class is gone once it's in");
    ok(typeof w.XLSX === "object" && typeof w.XLSX.utils === "object", "export still has its spreadsheet library");
    ok(typeof w.initApp === "function" && typeof w.exportRowsXLSX === "function", "the app's functions are all there");
    // Calling it again does nothing
    w.vaultBootReveal(); await sleep(30);
    ok(!h.classList.contains("vboot") && !h.classList.contains("vboot-in"), "revealing twice is harmless");
    const v = s => s.replace(/^\D*/, "").split(".").map(Number);
    const about = v(d.getElementById("about-version-meta").textContent), foot = v(d.getElementById("version-footer").textContent);
    const ge = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    ok(ge(about, [6, 18, 5]) >= 0 && about.join() === foot.join(), "version is 6.18.5 or later, About matches the footer");
  } catch (e) { fail++; console.log("ERROR:", e.stack); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => console.log("PAGE ERROR:", e));
  console.log(`v6.18.5: ${pass} passed, ${fail} failed, ${pageErrors.length} page errors`);
  process.exit(fail || pageErrors.length ? 1 : 0);
}, 120);
