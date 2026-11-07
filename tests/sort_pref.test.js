// Remembered sort: persistence, vault-file payload, sync guards, restore (v6.10.0).
// Run from the repo root: npm install jsdom && node tests/sort_pref.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
function boot(ls) {
  const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
    beforeParse(w) { Object.entries(ls || {}).forEach(([k, v]) => w.localStorage.setItem(k, v)); } });
  return { w: dom.window, errors };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let { w, errors } = boot();
  await wait(1500);
  const E = s => w.eval(s);
  E("window.__syncs = 0; triggerCloudSync = () => { window.__syncs++; };");
  ok(E("sortKey") === "date" && E("sortDir") === "asc" && E("buildSortPayload()") === null, "fresh device: Date ↑ default, nothing pushed");
  E("setSort('amount')");
  ok(E("sortKey") === "amount" && E("sortDir") === "desc", "amount defaults desc");
  E("setSort('amount')");
  ok(E("sortDir") === "asc", "second tap flips");
  E("setSort('type')");
  const saved = JSON.parse(w.localStorage.getItem("vault_sort_v1"));
  ok(saved.key === "type" && saved.dir === "asc" && saved.ts > 0, "new choice replaces old in storage " + JSON.stringify(saved));
  const raw = await E("buildVaultPayload()");
  const pay = JSON.parse(raw);
  ok(pay._sort && pay._sort.key === "type" && pay._sort.dir === "asc", "vault JSON carries _sort " + JSON.stringify(pay._sort));
  ok(!("sort" in pay) && Object.keys(pay).filter(k => /sort/i.test(k)).length === 1, "exactly one sort record in the file");
  ok(E("window.__syncs") === 0, "no sync per tap"); await wait(2200);
  ok(E("window.__syncs") === 1, "one debounced sync after taps, got " + E("window.__syncs"));
  // regression guards
  const ts = E("sortTs");
  ok(E(`applyRemoteSortPref({key:'date',dir:'desc',ts:${ts - 1000}})`) === false && E("sortKey") === "type", "older remote can't overwrite newer local");
  ok(E(`applyRemoteSortPref({key:'date',dir:'desc',ts:${ts}})`) === false, "equal ts ignored");
  ok(E(`applyRemoteSortPref({key:'evil',dir:'desc',ts:${ts + 9e9}})`) === false && E("sortKey") === "type", "invalid key rejected");
  ok(E(`applyRemoteSortPref({key:'amount',dir:'sideways',ts:${ts + 9e9}})`) === false, "invalid dir rejected");
  ok(E(`applyRemoteSortPref(null)`) === false && E(`applyRemoteSortPref("x")`) === false, "junk payload rejected");
  ok(E(`applyRemoteSortPref({key:'account',dir:'desc',ts:${ts + 5000}})`) === true && E("sortKey") === "account" && E("sortDir") === "desc", "newer remote adopted");
  ok(JSON.parse(w.localStorage.getItem("vault_sort_v1")).key === "account", "adopted remote persisted locally");
  // header arrows
  E("updateSortButtons()");
  ok(/↓/.test(w.document.getElementById("sort-account").textContent) && /⇅/.test(w.document.getElementById("sort-date").textContent), "header shows active column + direction");
  const stored = w.localStorage.getItem("vault_sort_v1");
  // reload restores
  ({ w, errors: errors } = boot({ vault_sort_v1: stored }));
  await wait(1500);
  ok(w.eval("sortKey") === "account" && w.eval("sortDir") === "desc", "reload opens in remembered order");
  ({ w } = boot({ vault_sort_v1: "{not json" })); await wait(1200);
  ok(w.eval("sortKey") === "date" && w.eval("sortDir") === "asc", "corrupt local value falls back to default");
  console.log(`${pass} passed, ${fail} failed; page errors: ${errors.length}`);
  process.exit(fail ? 1 : 0);
})();
