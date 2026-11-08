// Interest card: rate caveats are numbered ¹ ² ³ in reading order — the first marker
// down the list is ¹ — and the notes print in that order (v6.10.1; reading order v6.12.0).
// Run from the repo root: npm install jsdom && node tests/footnote_marks.test.js
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
  w.eval(`
    accounts = [{id:"ing",name:"ING",color:"#e8834a",currency:"AUD"},{id:"ub",name:"UBank",color:"#6aa2d8",currency:"AUD"},{id:"new",name:"Macquarie",color:"#5a9",currency:"AUD"}];
    window.__Y = {};
    vhAccountYield = id => window.__Y[id] || null;
    vhAllTx = () => [{kind:"int",amt:20,cur:"AUD",date:"2026-03-31"},{kind:"int",amt:25,cur:"AUD",date:"2026-09-30"}];
  `);
  const Y = w.__Y;
  const base = { bal: 5000, low: 0.026, high: 0.028, payments: 10, stale: false, lastKey: "2026-08" };
  const render = () => {
    w.eval("vhRenderInterest()");
    const b = w.document.getElementById("vh-interest-body");
    const marks = {};
    b.querySelectorAll(".vh-yield-row").forEach(r => {
      const m = r.querySelector(".vh-yield-mark");
      marks[r.querySelector(".vh-yield-name").textContent] = m ? m.textContent : "";
    });
    const foot = [...b.querySelectorAll(".vh-yield-foot > span")].map(s => s.textContent);
    const fn = [...b.querySelectorAll(".vh-yield-foot .vh-yield-fn")].map(s => s.textContent);
    const proj = b.querySelector(".vh-int-proj-val .vh-yield-mark");
    return { marks, foot, fn, proj: proj ? proj.textContent : "", text: b.textContent };
  };

  // 1. Screenshot case: ING variable, UBank stale
  Y.ing = { ...base, apy: 0.027, low: 0, high: 0.056 };
  Y.ub = { ...base, apy: 0.051, stale: true };
  delete Y.new;
  let r = render();
  // ING is listed above UBank, so ING's marker is ¹ (Eliot, 8 Nov: a ² must never sit above a ¹).
  ok(r.marks.ING === "¹", "ING variable (first row) → ¹ got " + r.marks.ING);
  ok(r.marks.UBank === "²", "UBank stale (second row) → ² got " + r.marks.UBank);
  ok(r.fn.join("") === "¹²", "footnote markers ¹² got " + r.fn.join(""));
  ok(/^¹This rate has varied recently/.test(r.foot[0]), "variable note first: " + r.foot[0]);
  ok(/^²UBank has paid no interest since Aug 2026\. .*left out of the 12-month projection\./.test(r.foot[1]), "stale note second, no 'below': " + r.foot[1]);
  ok(!/[†*~]/.test(r.text), "no † * ~ left in card");

  // 2. Only variable → it becomes ¹
  Y.ub = { ...base, apy: 0.051 };
  r = render();
  ok(r.marks.ING === "¹" && r.marks.UBank === "", "lone variable → ¹ " + JSON.stringify(r.marks));
  ok(r.fn.join("") === "¹" && r.foot.length === 1, "one footnote ¹");

  // 3. All three, plus projection carries the history mark
  Y.ub = { ...base, apy: 0.051, stale: true };
  Y.new = { ...base, apy: 0.045, payments: 1, low: 0.045, high: 0.045 };
  r = render();
  ok(r.marks.ING === "¹" && r.marks.UBank === "²" && r.marks.Macquarie === "³", "¹²³ in row order " + JSON.stringify(r.marks));
  ok(r.fn.join("") === "¹²³", "footnotes ¹²³ got " + r.fn.join(""));
  ok(/^³Based on very little interest history/.test(r.foot[2]), "history note third, like its row");
  ok(r.proj === "³", "projection value carries history mark ³ got " + r.proj);

  // 4. Nothing to flag
  Y.ing = { ...base, apy: 0.027 }; Y.ub = { ...base, apy: 0.051 }; delete Y.new;
  r = render();
  ok(Object.values(r.marks).every(m => m === "") && r.foot.length === 0 && r.proj === "", "no caveats → no marks, no footnotes");


  console.log(`${pass} passed, ${fail} failed; page errors: ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log("  err:", e.slice(0, 200)));
  process.exit(fail ? 1 : 0);
}, 1500);
