// v6.19.0 regression tests (15 Nov 2026): Vault picks up other devices' changes when it opens,
// when it comes back to the screen and on the hourly tick (sync sweep #13). Quietly: no
// "Syncing…", no dialogs. Start-up's recurring check waits for that first sync.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_19_0.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const errors = [];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let clock = new Date("2026-11-15T08:00:00+10:00").getTime();

const ACCOUNTS = JSON.stringify([{ id: "ub", name: "UBank", color: "#4a8fc0", currency: "AUD", ts: 1 }]);
const rows = Array.from({ length: 10 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}-05`, 100 + i, "t" + i, 1000, null, null, "ub"]);
const RULE = { id: 777, type: "deposit", amount: 25, freq: "weekly", startDate: "2026-10-01", endDate: null, dow: 3, nextDate: "2099-01-01", account: "ub" };
const drive = { text: null, gets: 0, puts: 0 };

function device(storage, opts = {}) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
    beforeParse(w) {
      const RD = w.Date;
      class MD extends RD { constructor(...a) { if (!a.length) super(clock); else super(...a); } static now() { return clock; } }
      MD.UTC = RD.UTC; MD.parse = RD.parse; w.Date = MD;
      // A fake Drive behind the real read and write code
      w.fetch = async (url, o = {}) => {
        const res = (status, body) => ({ ok: status < 300, status, text: async () => body, json: async () => JSON.parse(body) });
        if (/alt=media/.test(url)) { drive.gets++; return drive.text == null ? res(404, "") : res(200, drive.text); }
        if (/upload\/drive/.test(url)) { drive.puts++; drive.text = o.body; return res(200, JSON.stringify({ id: "f" })); }
        throw new Error("offline (test)");
      };
      w.confirm = w.alert = w.prompt = () => { throw new Error("native dialog used"); };
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
      Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
      Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, v));
    },
  });
  const w = dom.window, E = s => w.eval(s);
  return { w, E, d: w.document, rows: () => E("Object.values(data).flatMap(y => [...y.saved, ...y.removed])") };
}
const signedIn = { vault_gd_v1: JSON.stringify({ accessToken: "x", refreshToken: "r", expiresAt: 9e15, fileId: "f" }) };

setTimeout(async () => {
  try {
    // ── Opening Vault syncs before it posts recurring transactions ───────────
    // The backup says rule 777 was deleted on the phone; this device still has it
    drive.text = JSON.stringify({ _data: { "2026": { saved: rows, removed: [] } }, _accounts: JSON.parse(ACCOUNTS), _recurDeleted: ["777"], _recurring: [], _currency: "AUD" });
    const A = device(Object.assign({ vault_accounts_v1: ACCOUNTS, savings_data_v4: JSON.stringify({ "2026": { saved: rows, removed: [] } }),
      vault_recurring_v1: JSON.stringify([RULE]), vault_currency: "AUD" }, signedIn));
    for (let i = 0; i < 40 && !drive.gets; i++) await sleep(25);
    await sleep(150);
    ok(drive.gets >= 1, "opening Vault reads the backup straight away (it waited for a change)");
    ok(A.E("recurRules.length") === 0, "…and learns the rule was deleted on the other device");
    ok(!A.rows().some(r => String(r[5]) === "777"), "…before posting anything for it");

    // ── Coming back to the screen picks up the other device's changes ────────
    const before = drive.gets;
    const remote = JSON.parse(drive.text);
    remote._data["2026"].saved.push(["2026-11-14", 42, "phone1", clock + 1000, null, null, "ub"]);
    drive.text = JSON.stringify(remote);
    A.E(`window.__pills = []; const __ss = setSaveStatus; setSaveStatus = function (s, m) { window.__pills.push(m); return __ss(s, m); };`);
    clock += 6 * 60 * 1000;
    Object.defineProperty(A.d, "visibilityState", { value: "visible", configurable: true });
    A.d.dispatchEvent(new A.w.Event("visibilitychange"));
    for (let i = 0; i < 40 && !A.rows().some(r => r[2] === "phone1"); i++) await sleep(25);
    ok(A.rows().some(r => r[2] === "phone1"), "coming back to Vault brings in what the phone added");
    ok(!A.E("window.__pills").includes("Syncing…"), "…quietly: no Syncing… in the pill");
    // Throttled: again within 5 minutes does nothing
    const g2 = drive.gets;
    clock += 60 * 1000;
    A.d.dispatchEvent(new A.w.Event("visibilitychange")); await sleep(80);
    ok(drive.gets === g2 && g2 > before, "…at most once every 5 minutes");
    // Not under an open form
    clock += 6 * 60 * 1000;
    A.E(`openGoalsModal()`); await sleep(20);
    A.d.dispatchEvent(new A.w.Event("visibilitychange")); await sleep(80);
    ok(drive.gets === g2, "…and never while a tray is open (Goals ends in -modal; the guard missed those)");
    A.E(`closeGoalsModal()`); await sleep(400);

    // ── Hidden page, hourly tick, online ─────────────────────────────────────
    ok(/maybeAutoSync\("hourly tick"\);/.test(html), "the hourly tick syncs too, for a page left open");
    ok(/window\.addEventListener\("online", \(\) => \{ if \(!pendingRetry\) maybeAutoSync\("online"\); \}\);/.test(html), "…and coming back online");
    Object.defineProperty(A.d, "visibilityState", { value: "hidden", configurable: true });
    clock += 6 * 60 * 1000;
    const g3 = drive.gets;
    ok(await A.E(`maybeAutoSync("test")`) === false && drive.gets === g3, "nothing syncs while the page is hidden");

    // ── A background sync never opens a dialog ───────────────────────────────
    Object.defineProperty(A.d, "visibilityState", { value: "visible", configurable: true });
    const r2 = JSON.parse(drive.text); r2._currency = "USD"; drive.text = JSON.stringify(r2);
    clock += 6 * 60 * 1000;
    await A.E(`maybeAutoSync("test")`); await sleep(40);
    ok(A.d.getElementById("currency-mismatch-popup").classList.contains("hidden"), "a background sync doesn't open the currency question (the next sync you start asks)");
    ok(JSON.parse(drive.text)._currency === "USD", "…and leaves that backup alone");

    // ── No backup: the recurring check runs at once, as before ───────────────
    const B = device({ vault_accounts_v1: ACCOUNTS, savings_data_v4: JSON.stringify({ "2026": { saved: rows, removed: [] } }), vault_recurring_v1: JSON.stringify([RULE]), vault_currency: "AUD" });
    await sleep(60);
    ok(B.rows().some(r => String(r[5]) === "777"), "without a backup, recurring transactions post as Vault opens");
    B.w.close(); A.w.close();

    // ── Version ─────────────────────────────────────────────────────────────
    const V = device({}); await sleep(30);
    const v = s => s.replace(/^\D*/, "").split(".").map(Number);
    const about = v(V.d.getElementById("about-version-meta").textContent), foot = v(V.d.getElementById("version-footer").textContent);
    const ge = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    ok(ge(about, [6, 19, 0]) >= 0 && about.join() === foot.join(), "version is 6.19.0 or later, About matches the footer");
    V.w.close();
  } catch (e) { fail++; console.log("ERROR:", e.stack); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => console.log("PAGE ERROR:", e));
  console.log(`v6.19.0: ${pass} passed, ${fail} failed, ${pageErrors.length} page errors`);
  process.exit(fail || pageErrors.length ? 1 : 0);
}, 100);
