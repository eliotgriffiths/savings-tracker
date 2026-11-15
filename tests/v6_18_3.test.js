// v6.18.3 regression tests (15 Nov 2026): rows on a deleted account can't come back.
// Eliot's PC had stale data from August. Its sync put 217 rows of his deleted old UBank account
// and 7 posts of a deleted fortnightly rule back into Drive, and Home's totals more than doubled.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_18_3.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const FIXED = new Date("2026-11-15T08:30:00+10:00").getTime();
const errors = [];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Live accounts ING and UBank; "old" is the deleted old UBank account, "gone" a deleted one with a rule.
const ACCOUNTS = [{ id: "ing", name: "ING", color: "#e07a40", currency: "AUD", ts: 1 }, { id: "ub", name: "UBank", color: "#4a8fc0", currency: "AUD", ts: 1 }];
const row = (date, amt, id, ts, acc, recur = null, kind = null) => [date, amt, id, ts, kind, recur, acc];
const LIVE = {
  "2025": { saved: [row("2025-03-01", 1000, "imp_1", 500, "ub"), row("2025-04-01", 500, "imp_2", 500, "ing")], removed: [row("2025-05-01", 200, "imp_3", 500, "ub")] },
  "2026": { saved: [row("2026-02-01", 300, "imp_4", 500, "ub")], removed: [] },
};
const STALE = {   // what the PC still held: copies on the deleted account, plus a deleted rule's posts
  "2025": { saved: [row("2025-03-01", 1000, "old_1", 100, "old"), row("2025-04-01", 500, "old_2", 100, "old")], removed: [row("2025-05-01", 200, "old_3", 100, "old")] },
  "2026": { saved: [row("2026-02-01", 300, "old_4", 100, "old"), row("2026-10-08", 25, "rc_777_2026-10-08", 900, "gone", "777"), row("2026-10-22", 25, "rc_777_2026-10-22", 900, "gone", "777")], removed: [] },
};
const merge = (...ds) => { const out = {}; ds.forEach(dd => Object.entries(dd).forEach(([y, b]) => { out[y] = out[y] || { saved: [], removed: [] }; out[y].saved.push(...b.saved); out[y].removed.push(...b.removed); })); return out; };

function makeDom(storage) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e.message || e)));
  return new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
    beforeParse(w) {
      const RD = w.Date;
      class MD extends RD { constructor(...a) { if (!a.length) super(FIXED); else super(...a); } static now() { return FIXED; } }
      MD.UTC = RD.UTC; MD.parse = RD.parse; w.Date = MD;
      w.fetch = () => Promise.reject(new Error("offline (test)"));
      w.confirm = w.alert = w.prompt = () => { throw new Error("native dialog used"); };
      w.scrollTo = () => {};
      w.Element.prototype.scrollIntoView = () => {};
      Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
      Object.entries(storage || {}).forEach(([k, v]) => w.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)));
    },
  });
}
const rowsOf = E => E(`Object.values(data).flatMap(y => [...y.saved, ...y.removed])`);
const net = E => E(`vhAllTx().reduce((s, t) => s + vhSigned(t), 0)`);

setTimeout(async () => {
  try {
    // ── 1. Already stored copies are cleaned when the app starts ─────────────
    {
      const dom = makeDom({ savings_data_v4: merge(LIVE, STALE), vault_accounts_v1: ACCOUNTS, vault_account_tombstones: ["old", "gone"] });
      const w = dom.window, E = s => w.eval(s);
      await sleep(50);
      const rows = rowsOf(E);
      ok(rows.length === 4 && rows.every(r => r[6] === "ub" || r[6] === "ing"), "start-up drops every row on a deleted account (" + rows.length + " left)");
      ok(Math.abs(net(E) - 1600) < 0.01, "Home's total is the live accounts' $1,600, not the doubled figure (" + net(E) + ")");
      const stored = JSON.parse(w.localStorage.getItem("savings_data_v4"));
      ok(Object.values(stored).flatMap(y => [...y.saved, ...y.removed]).length === 4, "…and the cleaned data is saved, so the next sync writes it back");
      ok(!E(`[...tombstones]`).some(id => id.startsWith("old_")), "the dropped rows aren't tombstoned (a moved copy with the same ID must survive)");
      w.close();
    }

    // ── 2. A clean device merging a stale file keeps none of the copies ──────
    {
      const dom = makeDom({ savings_data_v4: LIVE, vault_accounts_v1: ACCOUNTS, vault_account_tombstones: ["old", "gone"] });
      const w = dom.window, E = s => w.eval(s);
      await sleep(50);
      E(`triggerCloudSync = () => {}`);
      w.__remote = merge(LIVE, STALE);
      E(`autoMerge(sanitiseData(window.__remote), []); applyPayloadSettings({ accounts: ${JSON.stringify(ACCOUNTS)}, accountTombstones: ["old", "gone"] }, false)`);
      ok(rowsOf(E).length === 4 && Math.abs(net(E) - 1600) < 0.01, "the phone (which deleted the accounts) ignores the copies in a stale file");
      w.close();
    }

    // ── 3. The stale device learns of the delete in the same sync ────────────
    {
      const dom = makeDom({ savings_data_v4: merge(LIVE, STALE), vault_accounts_v1: ACCOUNTS.concat([{ id: "old", name: "UBank (old)", color: "#888", currency: "AUD", ts: 1 }, { id: "gone", name: "Saver", color: "#888", currency: "AUD", ts: 1 }]) });
      const w = dom.window, E = s => w.eval(s);
      await sleep(50);
      E(`triggerCloudSync = () => {}`);
      ok(rowsOf(E).length === 10, "before syncing, the PC still shows its old account's rows (nothing deleted yet on this device)");
      w.__remote = LIVE;
      E(`autoMerge(sanitiseData(window.__remote), []); applyPayloadSettings({ accounts: ${JSON.stringify(ACCOUNTS)}, accountTombstones: ["old", "gone"] }, false)`);
      const rows = rowsOf(E);
      ok(rows.length === 4 && E(`accounts.map(a => a.id).join()`) === "ing,ub", "after the sync the PC has the deleted accounts' rows and the accounts gone");
      ok(Math.abs(net(E) - 1600) < 0.01, "…and the same total as the phone");
      const payload = JSON.parse(await E(`buildVaultPayload()`));
      const written = Object.values(payload._data || {}).flatMap(y => [...y.saved, ...y.removed]);
      ok(written.length === 4, "what it writes back to Drive has no copies (" + written.length + ")");
      w.close();
    }

    // ── 4. A moved transaction keeps its moved copy ──────────────────────────
    {
      const local = { "2025": { saved: [row("2025-06-01", 80, "mv_1", 300, "old")], removed: [] } };
      const remote = { "2025": { saved: [row("2025-06-01", 80, "mv_1", 300, "ub")], removed: [] } };   // same ts: moved by an older version
      const dom = makeDom({ savings_data_v4: local, vault_accounts_v1: ACCOUNTS.concat([{ id: "old", name: "UBank (old)", color: "#888", currency: "AUD", ts: 1 }]) });
      const w = dom.window, E = s => w.eval(s);
      await sleep(50);
      E(`triggerCloudSync = () => {}`);
      w.__remote = remote;
      E(`autoMerge(sanitiseData(window.__remote), []); applyPayloadSettings({ accounts: ${JSON.stringify(ACCOUNTS)}, accountTombstones: ["old"] }, false)`);
      const rows = rowsOf(E);
      ok(rows.length === 1 && rows[0][2] === "mv_1" && rows[0][6] === "ub", "a row moved to UBank on the other device stays, on UBank (a tie used to keep the stale copy)");
      // Moving now stamps the rows, so the moved copy wins outright
      E(`accounts.push({ id: "tmp", name: "Temp", color: "#888", currency: "AUD", ts: 1 }); data["2025"].saved.push(["2025-07-01", 10, "mv_2", 5, null, null, "tmp"]); reassignTransactions("tmp", "ing")`);
      const moved = E(`data["2025"].saved.find(t => t[2] === "mv_2")`);
      ok(moved[6] === "ing" && moved[3] === FIXED, "moving an account's rows stamps them, so the move beats a stale copy");
      w.close();
    }

    // ── 5. Posts of a rule deleted on another device ─────────────────────────
    {
      const rule = { id: 777, type: "deposit", amount: 25, freq: "fortnightly", startDate: "2026-09-10", endDate: null, dow: null, nextDate: "2099-01-01", account: "ub" };
      const local = { "2026": { saved: [
        row("2026-09-10", 25, "rc_777_2026-09-10", 400, "ub", "777"),
        row("2026-10-08", 25, "rc_777_2026-10-08", 900, "ub", "777"),
        row("2026-10-22", 25, "rc_777_2026-10-22", 900, "ub", "777"),
        row("2026-10-23", 40, "manual_1", 900, "ub", "777"),
      ], removed: [] } };
      const remote = { "2026": { saved: [row("2026-09-10", 25, "rc_777_2026-09-10", 400, "ub", "777")], removed: [] } };  // deleted, past posts kept
      const dom = makeDom({ savings_data_v4: local, vault_accounts_v1: ACCOUNTS, vault_recurring_v1: [rule] });
      const w = dom.window, E = s => w.eval(s);
      await sleep(50);
      E(`triggerCloudSync = () => {}`);
      w.__remote = remote;
      E(`autoMerge(sanitiseData(window.__remote), []); applyPayloadSettings({ accounts: ${JSON.stringify(ACCOUNTS)}, recurDeleted: ["777"], recurring: [] }, false)`);
      const ids = rowsOf(E).map(r => r[2]).sort();
      ok(E(`recurRules.length`) === 0, "the rule deleted on the phone is gone from the PC");
      ok(!ids.includes("rc_777_2026-10-08") && !ids.includes("rc_777_2026-10-22"), "the posts the PC made before it knew are removed");
      ok(ids.includes("rc_777_2026-09-10"), "a post the phone kept (delete that keeps past transactions) stays");
      ok(ids.includes("manual_1"), "a row the user added by hand stays, even if tagged with the rule");
      w.close();
    }

    // ── Version ──────────────────────────────────────────────────────────────
    {
      const dom = makeDom({});
      const d = dom.window.document;
      await sleep(30);
      const v = s => s.replace(/^\D*/, "").split(".").map(Number);
      const about = v(d.getElementById("about-version-meta").textContent), foot = v(d.getElementById("version-footer").textContent);
      const ge = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      ok(ge(about, [6, 18, 3]) >= 0 && about.join() === foot.join(), "version is 6.18.3 or later, About matches the footer");
      dom.window.close();
    }
  } catch (e) { fail++; console.log("ERROR:", e.stack); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => console.log("PAGE ERROR:", e));
  console.log(`v6.18.3: ${pass} passed, ${fail} failed, ${pageErrors.length} page errors`);
  process.exit(fail || pageErrors.length ? 1 : 0);
}, 100);
