// v7.1.0 regression tests: the Export tray (what it covers, Spreadsheet or Plain text, Share file
// on a phone, Download on a computer, the format remembered on this device) and the spreadsheet's
// formatting from the export harness's "trial 3" (real dates, 2-decimal money, Arial, row heights,
// frozen bold header, centred currency codes, no colours).
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v7_1_0.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const FIXTURE = fs.readFileSync(path.join(__dirname, "export", "fixture.js"), "utf8");
const NOW = new Date("2026-11-16T09:00:00+10:00").getTime();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
  beforeParse(w) {
    const RD = w.Date;
    class MD extends RD { constructor(...a) { if (!a.length) super(NOW); else super(...a); } static now() { return NOW; } }
    MD.UTC = RD.UTC; MD.parse = RD.parse; w.Date = MD;
    w.fetch = () => Promise.reject(new Error("offline (test)"));
    w.confirm = w.alert = w.prompt = () => { throw new Error("native dialog used"); };
    w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
    // a computer to start with: no share sheet, a mouse
    w.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.URL.createObjectURL = b => { w.__blob = b; return "blob:test"; };
    w.URL.revokeObjectURL = () => {};
  },
});
const w = dom.window, d = w.document;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const E = s => w.eval(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isOpen = id => { const el = d.getElementById(id); return !!el && !el.classList.contains("hidden"); };
const txt = id => (d.getElementById(id)?.textContent || "").trim();

setTimeout(async () => {
  try {
    E(FIXTURE);
    E(`_dataVersion++; _invalidateYearCache(); document.getElementById("welcome-modal")?.classList.add("hidden");
       window.__toasts = []; toast = (m, k) => { window.__toasts.push([m, k || ""]); };
       window.__clicks = []; HTMLAnchorElement.prototype.click = function () { window.__clicks.push(this.download); };`);
    const total = E(`vhAllTx().length`);

    // ── the Menu opens the tray, and says only what it covers ──────────────────────────────────
    const mobRow = [...d.querySelectorAll("#menu-sheet .menu-item-btn")].find(b => /Export spreadsheet/.test(b.textContent));
    const deskRow = [...d.querySelectorAll(".dmenu-btn")].find(b => /Export spreadsheet/.test(b.textContent));
    ok(mobRow && /openExportPopup\(\)/.test(mobRow.getAttribute("onclick")), "phone Menu row opens the Export tray");
    ok(deskRow && /openExportPopup\(\)/.test(deskRow.getAttribute("onclick")), "computer menu row opens the Export tray");
    E(`switchTab("home"); updateExportMenuSub();`);
    ok(txt("mob-export-sub") === "All transactions" && txt("dmenu-export-sub") === "All transactions", "Menu sub-line has no 'as XLSX': " + txt("mob-export-sub"));

    // ── Home: everything ───────────────────────────────────────────────────────────────────────
    E(`localStorage.removeItem("vault_export_fmt"); openExportPopup();`);
    await sleep(30);
    ok(isOpen("export-popup"), "the tray opens");
    ok(d.getElementById("export-popup").classList.contains("vp"), "it's a shared panel (vpInit)");
    ok(txt("exp-title") === "Export spreadsheet" && txt("exp-sub") === "All transactions", "title and what it covers: " + txt("exp-sub"));
    ok(txt("exp-n") === String(total), `count: ${txt("exp-n")} vs ${total}`);
    ok(txt("exp-dates") === "3 Jan 2025 – 13 Nov 2026", "date range: " + txt("exp-dates"));
    ok(d.getElementById("exp-applied").hidden, "no Filters/Showing row on Home");
    const opts = [...d.querySelectorAll("#exp-opts .exp-opt")];
    ok(opts.length === 2 && /Spreadsheet/.test(opts[0].textContent) && /Plain text/.test(opts[1].textContent), "two formats: Spreadsheet, Plain text");
    ok(/\.xlsx · Totals, plus every transaction, with formatting/.test(opts[0].textContent), "Spreadsheet's line");
    ok(/\.csv · Every transaction, no totals or formatting/.test(opts[1].textContent), "Plain text's line");
    ok(opts[0].getAttribute("aria-checked") === "true" && opts[1].getAttribute("aria-checked") === "false", "Spreadsheet chosen first");
    ok(!/Excel|Numbers|Google|LibreOffice/.test(d.getElementById("exp-opts").textContent), "named by what they are, not programs");
    ok(txt("exp-file-name") === "vault-all-transactions-2026-11-16.xlsx" && /^· about \d+(\.\d)? KB$/.test(txt("exp-file-size")), "file name and size: " + txt("exp-file-name") + " " + txt("exp-file-size"));
    ok(txt("exp-go-label") === "Download" && !d.getElementById("exp-go").disabled, "on a computer: Download");
    ok(/M7\.5 1\.5V11/.test(d.getElementById("exp-go-icon").innerHTML), "…with a download arrow");
    ok(d.querySelector("#export-popup .vp-foot") === d.getElementById("exp-foot"), "buttons are the tray's foot");

    // Download
    E(`exportGo()`); await sleep(20);
    ok(E(`window.__clicks.slice(-1)[0]`) === "vault-all-transactions-2026-11-16.xlsx", "downloads the file");
    ok(E(`window.__blob.type`) === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "with the xlsx type");
    ok(!isOpen("export-popup"), "the tray closes");
    ok(E(`JSON.stringify(window.__toasts.slice(-1)[0])`) === JSON.stringify(["Spreadsheet downloaded", ""]), "toast: " + E(`JSON.stringify(window.__toasts.slice(-1))`));

    // ── the spreadsheet ─────────────────────────────────────────────────────────────────────────
    E(`window.__x = exportBuild(exportScope(), "xlsx");`);
    ok(E(`__x.data instanceof Uint8Array && __x.data[0] === 0x50 && __x.data[1] === 0x4b`), "the file is a zip (xlsx)");
    E(`window.__wb = XLSX.read(__x.data, { type: "array", cellNF: true }); window.__tx = __wb.Sheets.Transactions; window.__sum = __wb.Sheets.Summary;`);
    ok(E(`__wb.SheetNames.join()`) === "Summary,Transactions", "Summary and Transactions sheets");
    ok(E(`__tx.A2.t`) === "n" && E(`__tx.A2.z`) === "d mmm yyyy" && E(`__tx.A2.w`) === "3 Jan 2025", "dates are real dates, shown 3 Jan 2025: " + E(`JSON.stringify(__tx.A2)`));
    ok(E(`__tx.D2.z`) === "#,##0.00;-#,##0.00" && E(`__tx.D2.w`) === "1,250,000.00", "money format, 2 decimals: " + E(`__tx.D2.w`));
    ok(E(`__tx.G3.w`) === "7.50", "7.5 shows as 7.50: " + E(`__tx.G3.w`));
    ok(E(`__tx.H4 === undefined`) && E(`__tx.I2 === undefined`), "empty cells are empty, not blank text");
    const lastRow = E(`XLSX.utils.decode_range(__tx["!ref"]).e.r`);
    ok(E(`__tx.H${lastRow - 1}.z`) === "#,##0.00;-#,##0.00", "totals have the money format too");
    ok(E(`__sum.B6.z`) === "#,##0.00;-#,##0.00" && E(`__sum.B8.z`) === "#,##0.00;-#,##0.00", "Summary's totals too");
    ok(E(`__tx.C3.v`) === "ING" && E(`__wb.Sheets.Transactions.C4.v`) === "Café ✓ Savings", "names keep their letters: " + E(`__tx.C4.v`));
    E(`window.__zip = XLSX.CFB.read(__x.data, { type: "array" }); window.__xml = p => new TextDecoder().decode(XLSX.CFB.find(__zip, "/" + p).content);`);
    const styles = E(`__xml("xl/styles.xml")`), sheet2 = E(`__xml("xl/worksheets/sheet2.xml")`), sheet1 = E(`__xml("xl/worksheets/sheet1.xml")`);
    ok(/<name val="Arial"\/>/.test(styles) && !/Calibri/.test(styles), "every font is Arial");
    ok(/<font><b\/>/.test(styles), "a bold font");
    ok(/<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/.test(sheet2), "header row frozen");
    const boldXf = (() => { const xfs = /<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/.exec(styles)[1].match(/<xf [^>]*?(\/>|>[\s\S]*?<\/xf>)/g);
      return xfs.findIndex(x => /fontId="1"/.test(x)); })();
    ok(boldXf > 0 && new RegExp(`<c r="A1" s="${boldXf}"`).test(sheet2) && new RegExp(`<c r="I1" s="${boldXf}"`).test(sheet2), "header row bold");
    ok(new RegExp(`<c r="A1" s="${boldXf}"`).test(sheet1), "Summary's title bold");
    ok(/<alignment horizontal="center"\/>/.test(styles) && /<c r="E2" s="\d+"/.test(sheet2), "currency codes centred");
    ok(/<alignment horizontal="left"\/>/.test(styles), "dates left-aligned");
    ok(/<row r="2"[^>]*ht="17"/.test(sheet2) && /customHeight="1"/.test(sheet2), "a height on every row");
    ok(/<col [^>]*width=/.test(sheet2), "column widths set");
    ok(!/<fgColor|<color rgb=/.test(styles.replace(/<color theme="1"\/>/g, "")), "no fill or text colours");
    const widths = E(`exportWorkbook(exportScope().rows, "All transactions").Sheets.Transactions["!cols"].map(c => c.wch)`);
    ok(widths[2] >= Math.ceil("UBank Save — Emergency Fund (joint)".length * 1.15), "account column fits the long name: " + widths[2]);

    // ── plain text ──────────────────────────────────────────────────────────────────────────────
    const csv = E(`exportBuild(exportScope(), "csv").data`);
    ok(csv.charCodeAt(0) === 0xfeff, "csv starts with a BOM");
    const lines = csv.slice(1).split("\r\n");
    ok(lines[0] === "Date,Type,Account,Native Amount,Native Currency,Exchange Rate,Amount (AUD),Deposits (AUD),Withdrawals (AUD)", "csv header: " + lines[0]);
    ok(lines[1] === "2025-01-03,Deposit,ING,1250000.00,AUD,-,1250000.00,1250000.00,", "csv row: ISO date, plain 2 decimals: " + lines[1]);
    ok(lines.length === total + 2 && lines[lines.length - 1] === "", "one line per transaction, no totals, CRLF");
    ok(!/Total Deposited/.test(csv), "no totals in plain text");
    ok(E(`exportCsvText([{ date: "2026-01-02", amt: 5, accName: 'Joint, "main"', accCur: "AUD", gAmt: 5, type: "Deposit" }])`).split("\r\n")[1]
       === '2026-01-02,Deposit,"Joint, ""main""",5.00,AUD,-,5.00,5.00,', "quotes a name with a comma and quotes");

    // ── the format is remembered on this device ────────────────────────────────────────────────
    E(`openExportPopup(); exportPick("csv");`);
    ok(d.querySelector('#exp-opts [data-fmt="csv"]').getAttribute("aria-checked") === "true", "tapping Plain text chooses it");
    ok(/^vault-all-transactions-2026-11-16\.csv/.test(txt("exp-file-name")), "file name follows: " + txt("exp-file-name"));
    ok(E(`localStorage.getItem("vault_export_fmt")`) === "csv", "remembered");
    E(`closeExportPopup(); openExportPopup();`);
    ok(d.querySelector('#exp-opts [data-fmt="csv"]').getAttribute("aria-checked") === "true", "reopening keeps Plain text");
    E(`localStorage.setItem("vault_export_fmt", "ods"); closeExportPopup(); openExportPopup();`);
    ok(d.querySelector('#exp-opts [data-fmt="xlsx"]').getAttribute("aria-checked") === "true", "an unknown stored format falls back to Spreadsheet");
    E(`closeExportPopup()`);

    // ── a phone: Share file opens the share sheet ──────────────────────────────────────────────
    E(`matchMedia = q => ({ matches: /coarse/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
       window.__shared = []; window.__shareResult = "ok";
       navigator.canShare = o => !!(o && o.files && o.files.length);
       navigator.share = o => { window.__shared.push(o.files.map(f => [f.name, f.type, f.size])); return window.__shareResult === "ok" ? Promise.resolve() : Promise.reject(Object.assign(new Error("x"), { name: window.__shareResult })); };`);
    E(`exportPick("xlsx"); openExportPopup();`);
    ok(txt("exp-go-label") === "Share file", "on a phone: Share file");
    ok(/M7\.5 11V1\.5/.test(d.getElementById("exp-go-icon").innerHTML), "…with the share icon");
    E(`window.__toasts = []; window.__clicks = []; window.__shareResult = "AbortError"; exportGo();`); await sleep(20);
    ok(E(`__shared.length`) === 1 && E(`__shared[0][0][0]`) === "vault-all-transactions-2026-11-16.xlsx" && E(`__shared[0][0][2]`) > 1000, "hands the file to the share sheet: " + E(`JSON.stringify(__shared)`));
    ok(isOpen("export-popup") && E(`__toasts.length`) === 0 && E(`__clicks.length`) === 0, "closing the share sheet goes back to the tray, no toast");
    E(`window.__shareResult = "ok"; exportGo();`); await sleep(20);
    ok(!isOpen("export-popup") && E(`JSON.stringify(__toasts)`) === JSON.stringify([["Spreadsheet exported", ""]]), "sharing closes the tray, then the toast: " + E(`JSON.stringify(__toasts)`));
    E(`window.__toasts = []; window.__shareResult = "NotAllowedError"; openExportPopup(); exportGo();`); await sleep(20);
    ok(E(`__clicks.length`) === 1 && E(`JSON.stringify(__toasts)`) === JSON.stringify([["Spreadsheet downloaded", ""]]), "if sharing fails it downloads instead");
    E(`navigator.canShare = o => !!(o.files && o.files.every(f => /csv$/.test(f.name)));`);
    E(`openExportPopup();`);
    ok(txt("exp-go-label") === "Download", "a phone that can't share .xlsx: Download");
    E(`exportPick("csv");`);
    ok(txt("exp-go-label") === "Share file", "…and Share file for .csv");
    E(`exportPick("xlsx"); closeExportPopup();
       matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });`);

    // ── Transactions (v8.0.0: was Search): exactly the results, with the filters ───────────────
    E(`switchTab("all"); asF = asBlank(); asF.accs = ["ing"]; asSetQuery(""); sortKey = "amount"; sortDir = "desc"; asRender(); openExportPopup();`);
    ok(txt("exp-sub") === "All transactions", "Search: subtitle is the dates (no dates picked)");
    ok(!d.getElementById("exp-applied").hidden && txt("exp-applied-k") === "Filters" && txt("exp-applied-v") === E(`asDescribe()`), "Search: Filters row = the search: " + txt("exp-applied-v"));
    ok(/ING/.test(txt("exp-applied-v")) && /amount, largest first/.test(txt("exp-applied-v")), "…naming the account and order");
    ok(txt("exp-n") === String(E(`_asRows.length`)), "Search: count = results");
    ok(/\.csv · Every result, no filters, totals or formatting/.test(d.querySelectorAll("#exp-opts .exp-opt")[1].textContent), "Search: Plain text's line");
    ok(/^vault-all-transactions-2026-11-16\.xlsx/.test(txt("exp-file-name")), "Search: file name from the dates");
    E(`window.__sx = XLSX.read(exportBuild(_expScope, "xlsx").data, { type: "array" });`);
    ok(JSON.stringify(E(`XLSX.utils.sheet_to_json(__sx.Sheets.Transactions, { header: 1 }).slice(1, 1 + _asRows.length).map(r => r[6])`))
       === JSON.stringify(E(`_asRows.map(t => +convertToGlobal(t.amt, t.cur).toFixed(2))`)), "Search: same rows, same order");
    ok(/ING/.test(E(`__sx.Sheets.Summary.B3.v`)), "Search: Summary says what it covers");
    E(`closeExportPopup(); asSetQuery("zzzz-nothing"); asRender(); openExportPopup();`);
    ok(txt("exp-n") === "0" && !d.getElementById("exp-none").hidden && /Change the filters or the search/.test(txt("exp-none")), "no results: says so");
    ok(d.getElementById("exp-go").disabled && d.getElementById("exp-file").hidden, "…and the button is off, no file line");
    E(`closeExportPopup(); asF = asBlank(); asSetQuery(""); sortKey = "date"; sortDir = "asc"; asRender();`);

    // ── the list (v8.0.0: Transactions with a month and filters): what's on screen ───────────
    E(`asF = asBlank(); asF.accs = ["ing"]; asF.types = ["wit"]; asF.date = "y:2026"; switchTab("all"); openExportPopup();`);
    const n = E(`vhAllTx().filter(t => t.accId === "ing" && t.kind === "wit" && t.year === "2026").length`);
    ok(txt("exp-n") === String(n), `list: count ${txt("exp-n")} vs ${n}`);
    ok(txt("exp-applied-k") === "Filters" && txt("exp-applied-v") === E(`asDescribe()`) && /Withdrawals · ING · Sorted by date, oldest first$/.test(txt("exp-applied-v")), "list: Filters row: " + txt("exp-applied-v"));
    ok(txt("exp-sub") === "2026" && txt("mob-export-sub") === E(`viewScopeLabel()`), "list: subtitle (the dates) and Menu line: " + txt("exp-sub") + " / " + txt("mob-export-sub"));
    ok(/^vault-2026-2026-11-16\.xlsx/.test(txt("exp-file-name")), "list: file name: " + txt("exp-file-name"));
    E(`asF = asBlank();`);

    // ── closing ────────────────────────────────────────────────────────────────────────────────
    ok(E(`typeof POPUP_CLOSE["export-popup"]`) === "function", "registered in POPUP_CLOSE");
    E(`dismissPopup(document.getElementById("export-popup"))`);
    ok(!isOpen("export-popup"), "Back/outside tap closes it");
    E(`switchTab("home");`);

    // ── old callers ────────────────────────────────────────────────────────────────────────────
    E(`window.__clicks = []; menuExportXLSX();`);
    ok(isOpen("export-popup"), "menuExportXLSX opens the tray");
    E(`closeExportPopup(); exportRowsXLSX(exportScope().rows, "All transactions", "x.xlsx");`);
    ok(E(`__clicks.slice(-1)[0]`) === "x.xlsx", "exportRowsXLSX still downloads a spreadsheet");

    // ── version ────────────────────────────────────────────────────────────────────────────────
    const vf = txt("version-footer");
    const v = (vf.match(/^v(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
    ok(v.length === 3 && (v[0] > 7 || (v[0] === 7 && v[1] >= 1)) && html.includes(`Version ${vf}<`), "version v7.1.0 or later, About matches: " + vf);
  } catch (e) { fail++; console.log("FAIL (threw):", e.message); }

  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => { fail++; console.log("PAGE ERROR:", e); });
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 400);
