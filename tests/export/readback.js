// Export harness helper: read a spreadsheet back with SheetJS (the same library as Vault's import)
// and print each sheet's cells as JSON: shown text, type and number format.
// Usage: node tests/export/readback.js file.xlsx   (SheetJS is taken from index.html)
const fs = require("fs"), path = require("path"), vm = require("vm");
const html = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
const i = html.indexOf("make_xlsx_lib");
const start = html.lastIndexOf("<script", i), end = html.indexOf("</script>", i);
const code = html.slice(html.indexOf(">", start) + 1, end);
const ctx = { console }; ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx); vm.runInContext(code, ctx);
const X = ctx.XLSX;
const wb = X.read(fs.readFileSync(process.argv[2]), { type: "buffer", cellNF: true, cellDates: false });
const out = {};
wb.SheetNames.forEach(n => {
  const ws = wb.Sheets[n], r = X.utils.decode_range(ws["!ref"] || "A1:A1"), rows = [];
  for (let R = r.s.r; R <= r.e.r; R++) {
    const row = [];
    for (let C = r.s.c; C <= r.e.c; C++) {
      const c = ws[X.utils.encode_cell({ r: R, c: C })];
      row.push(c ? { w: c.w != null ? c.w : String(c.v), t: c.t, z: c.z || null } : null);
    }
    rows.push(row);
  }
  out[n] = { rows, cols: (ws["!cols"] || []).map(c => c && (c.wch || c.wpx || c.width)), freeze: ws["!freeze"] || null };
});
console.log(JSON.stringify({ version: X.version, sheets: out }));
