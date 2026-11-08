// Print current view follows the remembered sort, in the same order as the list on screen (v6.10.3).
// Run from the repo root: npm install jsdom && node tests/print_sort.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8");
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc });
const w = dom.window;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };

setTimeout(() => {
  const E = s => w.eval(s);
  E(`
    triggerCloudSync = () => {};
    accounts = [{id:"ing",name:"ING",color:"#e8834a",currency:"AUD"},{id:"ub",name:"UBank",color:"#6aa2d8",currency:"AUD"}];
    const fy = yearKeyForDate("2026-06-15");
    data = {}; data[fy] = { saved: [
        ["2026-03-01", 500, "t1", 1, null, null, "ub"],
        ["2026-03-31", 12.5, "t2", 2, "interest", null, "ing"],
        ["2026-05-10", 75, "t3", 3, null, null, "ing"],
        ["2026-05-10", 900, "t4", 4, null, null, "ub"],
      ], removed: [
        ["2026-04-02", 200, "t5", 5, null, null, "ing"],
        ["2026-06-01", 60, "t6", 6, null, null, "ub"],
      ] };
    activeYear = fy; activeMonth = null; activeTab = "all"; activeAccountFilter = "all";
    window.__print = null;
    openPdfWindow = o => { window.__print = o; };
  `);
  const sig = r => r.date + "|" + r.amt + "|" + r.type;
  const screen = () => E(`(_dataVersion = (_dataVersion||0) + 1, render(), _currentRows.map(r => r[0] + "|" + r[1] + "|" + (r[2] === "removed" ? "Withdrawal" : r[4] === "interest" ? "Interest" : "Deposit")))`);
  const printed = () => { E("printCurrentView()"); return { rows: w.__print.rows.map(sig), sub: w.__print.subLine }; };

  const cases = [["date","asc"],["date","desc"],["amount","desc"],["amount","asc"],["account","asc"],["account","desc"],["type","asc"],["type","desc"]];
  cases.forEach(([k, d]) => {
    E(`sortKey = ${JSON.stringify(k)}; sortDir = ${JSON.stringify(d)};`);
    const sc = screen(), pr = printed();
    ok(sc.length === 6 && JSON.stringify(sc) === JSON.stringify(pr.rows), `${k} ${d}: print matches screen\n  screen ${sc}\n  print  ${pr.rows}`);
  });

  // Spot-check actual orders
  E(`sortKey = "amount"; sortDir = "desc";`);
  ok(printed().rows[0] === "2026-05-10|900|Deposit" && printed().rows[5] === "2026-03-31|12.5|Interest", "amount desc: largest first, smallest last");
  E(`sortKey = "type"; sortDir = "asc";`);
  ok(printed().rows.map(r => r.split("|")[2]).join(",") === "Deposit,Deposit,Deposit,Interest,Withdrawal,Withdrawal", "type asc groups deposit < interest < withdrawal");
  ok(printed().rows[0] === "2026-03-01|500|Deposit", "type ties fall back to oldest first");

  // Subtitles
  E(`sortKey = "date"; sortDir = "asc";`);
  ok(!/Sorted/.test(printed().sub), "default Date ↑ adds nothing to subtitle: " + printed().sub);
  const want = { "date desc": "Sorted by date, newest first", "amount desc": "Sorted by amount, largest first", "amount asc": "Sorted by amount, smallest first",
                 "account asc": "Sorted by account, A to Z", "type desc": "Sorted by type, withdrawals first" };
  Object.entries(want).forEach(([kd, text]) => {
    const [k, d] = kd.split(" ");
    E(`sortKey = "${k}"; sortDir = "${d}";`);
    const sub = printed().sub;
    ok(sub.endsWith(" · " + text) && sub.startsWith("All transactions"), `${kd} subtitle: ${sub}`);
  });

  // Filters still respected alongside sort
  E(`sortKey = "amount"; sortDir = "desc"; activeTab = "removed";`);
  ok(JSON.stringify(printed().rows) === JSON.stringify(["2026-04-02|200|Withdrawal","2026-06-01|60|Withdrawal"]), "withdrawals tab + amount desc");
  E(`activeTab = "all"; activeAccountFilter = "ing";`);
  ok(JSON.stringify(printed().rows) === JSON.stringify(["2026-04-02|200|Withdrawal","2026-05-10|75|Deposit","2026-03-31|12.5|Interest"]), "account filter + amount desc");

  // Printing doesn't change the remembered sort
  ok(E("sortKey") === "amount" && E("sortDir") === "desc", "print leaves sort untouched");

  console.log(`${pass} passed, ${fail} failed; page errors: ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log("  err:", e.slice(0, 200)));
  process.exit(fail ? 1 : 0);
}, 1500);
