// Export harness, step 1: make Vault's real export files and save them.
// Usage: TZ=Australia/Brisbane node tests/export/export.js [path/to/index.html] [outDir]
// Writes <outDir>/vault-export.xlsx and vault-export.csv: exactly the bytes the Export tray's
// Spreadsheet and Plain text make (v7.1.0 on), from Home, so they cover every transaction.
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const here = __dirname;
const htmlPath = path.resolve(process.argv[2] || path.join(here, "..", "..", "index.html"));
const outDir = path.resolve(process.argv[3] || path.join(here, "out"));
fs.mkdirSync(outDir, { recursive: true });
const html = fs.readFileSync(htmlPath, "utf8");
const FIXTURE = fs.readFileSync(path.join(here, "fixture.js"), "utf8");
const NOW = new Date("2026-11-16T09:00:00+10:00").getTime();

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
  beforeParse(w) {
    const RealDate = w.Date;
    class FixedDate extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
    w.Date = FixedDate;
    w.fetch = () => Promise.reject(new Error("offline (harness)"));
    w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
  },
});
const w = dom.window;
setTimeout(() => {
  try {
    w.eval(FIXTURE);
    w.eval(`switchTab("home"); window.__sc = exportScope();
            window.__xf = exportBuild(__sc, "xlsx"); window.__cf = exportBuild(__sc, "csv");`);
    const xf = w.__xf, cf = w.__cf;
    if (!xf || !xf.data || !xf.data.length) throw new Error("the export didn't produce a file");
    fs.writeFileSync(path.join(outDir, "vault-export.xlsx"), Buffer.from(xf.data));
    fs.writeFileSync(path.join(outDir, "vault-export.csv"), cf.data, "utf8");
    const ver = w.document.getElementById("about-version-meta").textContent.trim();
    fs.writeFileSync(path.join(outDir, "export-info.json"), JSON.stringify({
      appVersion: ver, appFileName: xf.name, csvFileName: cf.name, sheets: ["Summary", "Transactions"], sheetjs: w.XLSX.version, made: new Date(NOW).toISOString(),
    }, null, 2));
    console.log(`exported ${xf.name} and ${cf.name} from ${ver} (SheetJS ${w.XLSX.version}) -> ${outDir}`);
  } catch (e) { console.log("ERROR:", e.stack); process.exitCode = 1; }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(harness\)/.test(e));
  pageErrors.forEach(e => console.log("PAGE ERROR:", e));
  if (pageErrors.length) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode || 0), 50);
}, 400);
