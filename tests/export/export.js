// Export harness, step 1: run Vault's real Export spreadsheet and save the file it makes.
// Usage: TZ=Australia/Brisbane node tests/export/export.js [path/to/index.html] [outDir]
// Writes <outDir>/vault-export.xlsx (the app's own file), plus the same workbook written as
// .ods and .csv by the app's SheetJS, so other formats can be compared on the same data.
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
    let captured = null;
    const realWrite = w.XLSX.writeFile;
    w.XLSX.writeFile = (wb, fname, opts) => { captured = { wb, fname, opts }; };
    w.eval(`switchTab("home"); menuExportXLSX();`);
    w.XLSX.writeFile = realWrite;
    if (!captured) throw new Error("the export didn't produce a file");
    const { wb } = captured;
    const write = (bookType, file) => {
      const buf = w.XLSX.write(wb, Object.assign({ type: "buffer", bookType }, captured.opts || {}));
      fs.writeFileSync(path.join(outDir, file), Buffer.from(buf));
    };
    write("xlsx", "vault-export.xlsx");
    write("ods", "vault-export.ods");
    // CSV holds one sheet: the transactions
    const csv = w.XLSX.utils.sheet_to_csv(wb.Sheets["Transactions"]);
    fs.writeFileSync(path.join(outDir, "vault-export.csv"), "﻿" + csv);
    const ver = w.document.getElementById("about-version-meta").textContent.trim();
    fs.writeFileSync(path.join(outDir, "export-info.json"), JSON.stringify({
      appVersion: ver, appFileName: captured.fname, sheets: wb.SheetNames, sheetjs: w.XLSX.version, made: new Date(NOW).toISOString(),
    }, null, 2));
    console.log(`exported ${captured.fname} from ${ver} (SheetJS ${w.XLSX.version}) -> ${outDir}`);
  } catch (e) { console.log("ERROR:", e.stack); process.exitCode = 1; }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(harness\)/.test(e));
  pageErrors.forEach(e => console.log("PAGE ERROR:", e));
  if (pageErrors.length) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode || 0), 50);
}, 400);
