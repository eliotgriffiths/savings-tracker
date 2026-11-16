// Export harness, trial fixes: take the workbook Vault's export makes and apply the tweaks under
// test, then save it like export.js does, so compare_apps.py can show whether each tweak holds
// up in every program. Nothing here changes the app: once a tweak proves itself, it moves into
// exportRowsXLSX in index.html.
// Usage: TZ=Australia/Brisbane node tests/export/candidate.js [path/to/index.html] [outDir]
// Options (environment): CANDIDATE_FONT sets the file's font (default Arial: iPhone's file preview
// has no Calibri and drew it as Times; "" keeps SheetJS's Calibri); CANDIDATE_FREEZE=0 leaves the
// header row unfrozen. The defaults are "trial 3", which Eliot checked on his iPhone on 16 Nov.
const FONT = process.env.CANDIDATE_FONT === undefined ? "Arial" : process.env.CANDIDATE_FONT;
const FREEZE = process.env.CANDIDATE_FREEZE !== "0";
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const here = __dirname;
const htmlPath = path.resolve(process.argv[2] || path.join(here, "..", "..", "index.html"));
const outDir = path.resolve(process.argv[3] || path.join(here, "out-candidate"));
fs.mkdirSync(outDir, { recursive: true });
const html = fs.readFileSync(htmlPath, "utf8");
const FIXTURE = fs.readFileSync(path.join(here, "fixture.js"), "utf8");
const NOW = new Date("2026-11-16T09:00:00+10:00").getTime();

const vc = new VirtualConsole();
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

// ── the tweaks under test ────────────────────────────────────────────────────────────────────
const MONEY = "#,##0.00;-#,##0.00";            // 2 decimals, thousands separators, a minus
const DATE = "d mmm yyyy";                     // 3 Jan 2025, the app's own date style
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const serial = (y, m, d) => (Date.UTC(y, m, d) - Date.UTC(1899, 11, 30)) / 86400000;

function tweak(X, wb) {
  const tx = wb.Sheets["Transactions"], sum = wb.Sheets["Summary"];
  const r = X.utils.decode_range(tx["!ref"]);
  const head = [];
  for (let C = r.s.c; C <= r.e.c; C++) head.push((tx[X.utils.encode_cell({ r: 0, c: C })] || {}).v || "");
  const money = head.map(h => /^(Native Amount|Amount|Deposits|Withdrawals)/.test(h));
  for (let R = 1; R <= r.e.r; R++) {
    for (let C = r.s.c; C <= r.e.c; C++) {
      const a = X.utils.encode_cell({ r: R, c: C }), c = tx[a];
      if (!c) continue;
      if (c.t === "s" && c.v === "") { delete tx[a]; continue; }          // truly empty
      if (C === 0 && c.t === "s") {                                        // real dates
        const m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(c.v);
        if (m) tx[a] = { t: "n", v: serial(+m[3], MON[m[2]], +m[1]), z: DATE };
      }
      if (money[C] && c.t === "n") c.z = MONEY;                            // 2 decimals
    }
  }
  ["B6", "B7", "B8"].forEach(a => { if (sum[a] && sum[a].t === "n") sum[a].z = MONEY; });
  // widths from the longest text each column shows, in characters, with room to spare
  const shown = (c) => c ? (c.z ? X.SSF.format(c.z, c.v) : String(c.v)) : "";
  const fit = (ws) => {
    const rr = X.utils.decode_range(ws["!ref"]), cols = [];
    for (let C = rr.s.c; C <= rr.e.c; C++) {
      let n = 6;
      for (let R = rr.s.r; R <= rr.e.r; R++) n = Math.max(n, shown(ws[X.utils.encode_cell({ r: R, c: C })]).length);
      // Arial's letters run wider than Calibri's, which "characters" are measured in
      cols.push({ wch: Math.min(66, Math.ceil(n * (FONT ? 1.15 : 1)) + 3) });
    }
    ws["!cols"] = cols;
    // a set row height on every row: a taller glyph (✓) isn't clipped, and iPhone's file preview
    // no longer drops the totals to the bottom of the screen (it did with no heights set)
    ws["!rows"] = Array.from({ length: rr.e.r + 1 }, () => ({ hpt: 17 }));
  };
  fit(tx);
  // Summary's title in A1 runs across B; size A to its labels only
  fit(sum); sum["!cols"][0] = { wch: 18 };
}

// SheetJS's free build writes neither frozen panes nor bold text, so those go into the file's
// XML after it's written: open the .xlsx (a zip) with SheetJS's own CFB, edit, zip it again.
function patchXlsx(X, buf, wb) {
  const zip = X.CFB.read(buf, { type: "buffer" });
  const get = p => X.CFB.find(zip, "/" + p);
  const txt = e => Buffer.from(e.content).toString("utf8");
  const put = (e, s) => { e.content = Buffer.from(s, "utf8"); e.size = e.content.length; };
  // bold: a second font, and a copy of each cell style that uses it
  const st = get("xl/styles.xml"); let css = txt(st);
  // every font in the file uses FONT (Calibri isn't on iPhone, so its file preview drew Times)
  if (FONT) css = css.replace(/<name val="[^"]*"\/>/g, `<name val="${FONT}"/>`).replace(/<scheme val="minor"\/>/g, "");
  css = css.replace(/<fonts count="(\d+)">([\s\S]*?)<\/fonts>/, (m, n, body) => {
    const first = /<font>[\s\S]*?<\/font>/.exec(body)[0];
    return `<fonts count="${+n + 1}">${body}${first.replace("<font>", "<font><b/>")}</fonts>`;
  });
  const boldFont = +/<fonts count="(\d+)"/.exec(css)[1] - 1;
  const xfs = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(css);
  const boldXf = +xfs[1];
  css = css.replace(xfs[0], `<cellXfs count="${boldXf + 1}">${xfs[2]}<xf numFmtId="0" fontId="${boldFont}" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`);
  // dates left-aligned (as numbers they sit right, against the Type column); currency codes
  // centred (left-aligned, they touch the amount before them)
  const xf2 = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(css);
  const dateFmt = (/<numFmt numFmtId="(\d+)" formatCode="d mmm yyyy"\/>/.exec(css) || [])[1];
  const dateXf = xf2[2].match(/<xf [^>]*\/>/g).findIndex(x => x.includes(`numFmtId="${dateFmt}"`));
  let body = xf2[2].replace(new RegExp(`<xf numFmtId="${dateFmt}"([^>]*?)/>`), '<xf numFmtId="' + dateFmt + '"$1 applyAlignment="1"><alignment horizontal="left"/></xf>');
  const centreXf = +xf2[1];
  body += '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf>';
  css = css.replace(xf2[0], `<cellXfs count="${centreXf + 1}">${body}</cellXfs>`);
  put(st, css);
  wb.SheetNames.forEach((name, i) => {
    const e = get(`xl/worksheets/sheet${i + 1}.xml`); let x = txt(e);
    const boldRow = name === "Transactions" ? /<c r="[A-Z]+1"( s="\d+")?/g : /<c r="A1"( s="\d+")?/g;
    x = x.replace(boldRow, m => m.replace(/ s="\d+"/, "") + ` s="${boldXf}"`);
    if (name === "Transactions" && !FREEZE) {
      x = x.replace(/<c r="E(\d+)"( s="\d+")?/g, (m, row) => row === "1" ? m : `<c r="E${row}" s="${centreXf}"`);
    } else if (name === "Transactions") {
      x = x.replace(/<c r="E(\d+)"( s="\d+")?/g, (m, row) => row === "1" ? m : `<c r="E${row}" s="${centreXf}"`);
      x = x.replace(/<sheetView ([^>]*?)\/>/, '<sheetView $1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView>');
    }
    put(e, x);
  });
  return Buffer.from(X.CFB.write(zip, { fileType: "zip", type: "buffer", compression: true }));
}

setTimeout(() => {
  try {
    w.eval(FIXTURE);
    let wb = null;
    const realWrite = w.XLSX.writeFile;
    w.XLSX.writeFile = (b) => { wb = b; };
    w.eval(`switchTab("home"); menuExportXLSX();`);
    w.XLSX.writeFile = realWrite;
    tweak(w.XLSX, wb);
    const xlsx = Buffer.from(w.XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    fs.writeFileSync(path.join(outDir, "vault-export.xlsx"), patchXlsx(w.XLSX, xlsx, wb));
    fs.writeFileSync(path.join(outDir, "vault-export.ods"), Buffer.from(w.XLSX.write(wb, { type: "buffer", bookType: "ods" })));
    fs.writeFileSync(path.join(outDir, "vault-export.csv"), "﻿" + w.XLSX.utils.sheet_to_csv(wb.Sheets["Transactions"]));
    fs.writeFileSync(path.join(outDir, "export-info.json"), JSON.stringify({
      appVersion: w.document.getElementById("about-version-meta").textContent.trim() + " + candidate tweaks",
      appFileName: "candidate.xlsx", sheets: wb.SheetNames, sheetjs: w.XLSX.version, made: new Date(NOW).toISOString(),
    }, null, 2));
    console.log("candidate written to " + outDir);
  } catch (e) { console.log("ERROR:", e.stack); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 50);
}, 400);
