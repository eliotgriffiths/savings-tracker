// v6.18.6 regression tests (15 Nov 2026): the sync sweep (claude/sync-sweep-2026-11-15.md).
// Two devices, each its own page with its own storage, share one in-memory "Drive" file;
// gdReadFile/gdWriteFile are swapped for the fake. Every check here failed on v6.18.5.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_18_6.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const errors = [];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const drive = { text: null, readFails: false };
let clock = new Date("2026-11-15T08:00:00+10:00").getTime();
const tick = (ms = 1000) => (clock += ms);
function device(storage = {}) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
    beforeParse(w) {
      const RD = w.Date;
      class MD extends RD { constructor(...a) { if (!a.length) super(clock); else super(...a); } static now() { return clock; } }
      MD.UTC = RD.UTC; MD.parse = RD.parse; w.Date = MD;
      w.fetch = () => Promise.reject(new Error("offline (test)"));
      w.confirm = w.alert = w.prompt = () => { throw new Error("native dialog used"); };
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
      Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
      Object.defineProperty(w, "crypto", { value: require("crypto").webcrypto, configurable: true });   // jsdom has no crypto.subtle
      Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, v));
    },
  });
  const w = dom.window, E = s => w.eval(s);
  w.__drive = drive;
  E(`window.__realGdRead = gdReadFile; window.__realNasRead = readFromNAS;`);
  E(`window.__toasts = []; const __t = toast; toast = function (m, k, d) { window.__toasts.push(String(m)); return __t(m, k, d); };
     gdLinked = true; gdTokens = { accessToken: "x", refreshToken: "r", expiresAt: 9e15, fileId: "f" };
     gdReadFile = async () => { if (window.__drive.readFails) throw new Error("read failed (test)"); return window.__drive.text; };
     gdWriteFile = async () => { window.__drive.text = await buildVaultPayload(); return true; };`);
  const dev = {
    w, E, d: w.document,
    sync: async () => { await E("triggerCloudSync()"); await sleep(5); },
    rows: () => E("Object.values(data).flatMap(y => [...y.saved, ...y.removed])"),
    has: id => dev.rows().some(r => r[2] === id),
    add: (id, amt = 10, date = "2026-11-12") => E(`data[yearKeyForDate("${date}")] = data[yearKeyForDate("${date}")] || { saved: [], removed: [] };
      data[yearKeyForDate("${date}")].saved.push(["${date}", ${amt}, "${id}", Date.now(), null, null, "ub"]); saveLocal();`),
    pill: () => w.document.getElementById("save-status").textContent,
    storage: () => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; },
  };
  dev.reload = () => { const s = dev.storage(); w.close(); return device(s); };
  return dev;
}
const driveRows = () => Object.values(JSON.parse(drive.text)._data).flatMap(y => [...y.saved, ...y.removed]).map(r => r[2]);
const BASE = {
  vault_accounts_v1: JSON.stringify([{ id: "ing", name: "ING", color: "#e07a40", currency: "AUD", ts: 1 }, { id: "ub", name: "UBank", color: "#4a8fc0", currency: "AUD", ts: 1 }]),
  savings_data_v4: JSON.stringify({ "2026": { saved: Array.from({ length: 10 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}-05`, 100 + i, "t" + i, 1000, null, null, i % 2 ? "ub" : "ing"]), removed: [] } }),
  vault_currency: "AUD",
};
const fresh = async (st = BASE) => { drive.text = null; drive.readFails = false; const A = device(st), B = device(st); await sleep(40); await A.sync(); await B.sync(); return [A, B]; };

setTimeout(async () => {
  try {
    // ── #1 An encrypted backup is never overwritten by a device without the password ──
    {
      const [A, B] = await fresh();
      await B.E(`(async () => { vaultEncKey = await deriveKeyFromPassword("pw"); vaultEncActive = true; })()`);
      tick(); B.add("bEnc", 70); await B.sync();
      const enc = drive.text;
      tick(); A.add("aPlain", 5); await A.sync(); await sleep(20);
      ok(drive.text === enc, "#1 a device without the password leaves the encrypted backup alone (it wrote plain text over it)");
      ok(A.pill() === "Backup locked", "#1 …and says the backup is locked: " + A.pill());
      ok(!A.d.getElementById("enc-decrypt-popup").classList.contains("hidden"), "#1 …and asks for the password");
      A.d.getElementById("enc-decrypt-pass").value = "pw";
      A.d.getElementById("enc-decrypt-btn").click();
      for (let i = 0; i < 40 && !A.has("bEnc"); i++) await sleep(50);
      await sleep(50);
      ok(A.has("bEnc") && A.has("aPlain"), "#1 with the password it merges both devices' changes");
      ok(/vault_enc/.test(drive.text) && A.E("vaultEncActive") === true, "#1 …and keeps the backup encrypted");
      ok(A.w.localStorage.getItem("vault_enc_active") === "true", "#1 …from now on");
      A.w.close(); B.w.close();
    }

    // ── #2 A failed read never becomes a write ──────────────────────────────
    {
      const [A, B] = await fresh();
      tick(); A.add("phone1", 300); await A.sync();
      drive.readFails = true;
      tick(); B.add("pc1", 40); await B.sync();
      drive.readFails = false;
      ok(driveRows().includes("phone1"), "#2 a sync whose read failed doesn't write over the backup");
      ok(B.pill() === "Sync failed" && B.E("pendingRetry") === true, "#2 …it fails and retries instead");
      await B.sync();
      ok(driveRows().includes("phone1") && driveRows().includes("pc1"), "#2 the retry merges both");
      // The real readers: a failed read throws; only "no file" is null
      const st = async (D, fn, status) => D.E(`(async () => { fetch = async () => ({ ok: ${status} < 300, status: ${status}, text: async () => "{}" });
        try { const r = await ${fn}; return r === null ? "null" : "text"; } catch (e) { return "throw"; } })()`);
      B.E(`nasConfig = { url: "https://nas/v.json", user: "u", pass: "p" };`);
      const r500 = await st(B, "__realGdRead()", 500), r404 = await st(B, "__realGdRead()", 404);
      const n500 = await st(B, "__realNasRead()", 503), n404 = await st(B, "__realNasRead()", 404);
      ok(r500 === "throw" && n500 === "throw", "#2 a Drive or NAS read that fails is a failure, not an empty file (both returned null): " + r500 + ", " + n500);
      ok(r404 === "null" && n404 === "null", "#2 …while a missing file still reads as empty");
      A.w.close(); B.w.close();
    }

    // ── #3 Closing the page writes nothing ──────────────────────────────────
    {
      const [A, B] = await fresh();
      tick(); A.add("phone2", 77); await A.sync();
      B.w.dispatchEvent(new B.w.Event("beforeunload")); await sleep(20);
      ok(driveRows().includes("phone2"), "#3 closing or reloading a stale page no longer writes over the backup");
      ok(!/if \(gdLinked\) gdWriteFile\(\);\n\}\);/.test(html), "#3 the blind flush is gone");
      A.w.close(); B.w.close();
    }

    // ── #4 Recurring rule edits sync ────────────────────────────────────────
    {
      const rule = { id: 555, type: "deposit", amount: 50, freq: "weekly", startDate: "2026-10-01", endDate: null, dow: 3, nextDate: "2099-01-01", account: "ub" };
      const [A, B] = await fresh(Object.assign({}, BASE, { vault_recurring_v1: JSON.stringify([rule]) }));
      tick();
      A.E(`openRecurEditPopup(0)`);
      A.d.getElementById("rep-amt").value = "80"; A.d.getElementById("rep-end").value = "2026-11-10";
      A.E(`saveRecurEditPopup()`); await sleep(20);
      ok(A.E("recurRules[0].ts") === clock, "#4 editing a rule stamps it");
      tick(); await A.sync(); tick(); await B.sync();
      ok(B.E("recurRules[0].amount") === 80 && B.E("recurRules[0].endDate") === "2026-11-10", "#4 the edit reaches the other device (it kept 50, no end date)");
      ok(B.E("recurRules[0].skippedDates === undefined || Array.isArray(recurRules[0].skippedDates)"), "#4 …skips and moves are still kept");
      // An older copy doesn't undo it
      tick(); B.E(`recurRules[0].ts = 5; saveRecurring();`);
      A.E(`recurRules[0].amount = 90; recurRules[0].ts = Date.now(); saveRecurring();`); await A.sync(); await B.sync();
      ok(B.E("recurRules[0].amount") === 90, "#4 the newer edit wins");
      A.w.close(); B.w.close();
    }

    // ── #5 Year format changes sync ─────────────────────────────────────────
    {
      let [A, B] = await fresh();
      tick(10000); A.E(`switchYearMode("financial")`); await A.sync();
      tick(10000); await B.sync();
      ok(B.E("_pendingYearModeChange && _pendingYearModeChange.yearMode") === "financial", "#5 the other device picks up the new year format (it never did)");
      ok(B.E("window.__toasts").some(t => /Year format was changed/.test(t)), "#5 …and says it takes effect next time");
      tick(); B.add("b1", 3); await B.sync();
      ok(JSON.parse(drive.text)._yearMode === "financial", "#5 …and doesn't write the old one back meanwhile");
      ok(B.E("window.__toasts").filter(t => /Year format was changed/.test(t)).length === 1, "#5 …and says so once");
      B = B.reload(); await sleep(40);
      ok(B.E("yearMode") === "financial", "#5 after a restart it's in use");
      tick(); await B.sync(); tick(); await A.sync();
      ok(A.E("yearMode") === "financial" && JSON.parse(drive.text)._yearMode === "financial", "#5 both stay on it");
      // A currency stamp doesn't count as a year format change
      tick(); A.E(`bumpSettingsTs()`); await A.sync(); B.E("window.__toasts.length = 0"); tick(); await B.sync();
      ok(!B.E("window.__toasts").some(t => /Year format/.test(t)), "#5 a currency change isn't taken for a year format change");
      ok(typeof JSON.parse(drive.text)._yearTs === "number" && typeof JSON.parse(drive.text)._currencyTs === "number", "#5 each has its own time in the backup");
      A.w.close(); B.w.close();
    }

    // ── #6 Undo import sticks ───────────────────────────────────────────────
    {
      const [A, B] = await fresh();
      tick(); A.E(`_importResults = [{ tx: { date: "2026-11-11", amount: 999, type: "deposit" }, skip: false }]; _importTargetAccountId = "ub"; confirmImport();`);
      await sleep(20);
      const id = A.E(`_importLastIds[0]`);
      A.E(`undoLastImport()`); await sleep(30);
      tick(); A.add("later", 1); await A.sync();
      ok(!A.has(id) && !driveRows().includes(id), "#6 an undone import stays undone (its own sync brought it back)");
      A.w.close(); B.w.close();
    }

    // ── #7 Converting an account's currency syncs the new amounts ───────────
    {
      const [A, B] = await fresh();
      tick();
      A.E(`_pendingAccountCurrencyChange = { accountId: "ub", oldCur: "AUD", newCode: "USD" }; _selectedCurrencyOption = "convert";
           exchangeRates = { date: todayLocal(), base: "AUD", rates: { AUD: 1, USD: 0.65 } }; _confirmAccountCurrencyChange();`);
      await sleep(20);
      const a1 = A.E(`data["2026"].saved.find(t => t[2] === "t1").slice()`);
      tick(); await A.sync(); tick(); await B.sync();
      const b1 = B.E(`data["2026"].saved.find(t => t[2] === "t1").slice()`);
      ok(a1[1] === 65.65 && b1[1] === 65.65 && B.E(`getAccountCurrency("ub")`) === "USD", "#7 the other device gets the converted amount (it kept 101 under USD): " + b1[1]);
      A.w.close(); B.w.close();
    }

    // ── #8 Reset Home layout sticks ─────────────────────────────────────────
    {
      const [A, B] = await fresh();
      tick(); B.E(`homeLayout = { order: ["goals","month","recent"], hidden: ["heatmap"], auto: false, ts: Date.now(), v: 1 }; saveHomeLayout(false);`); await sleep(20);
      tick(); await A.sync();
      tick(60000); A.E(`const __s = triggerCloudSync; triggerCloudSync = () => {}; vhResetLayoutConfirmed(); triggerCloudSync = __s;`);
      tick(); await A.sync(); tick(); await B.sync(); tick(); await A.sync();
      ok(A.E("homeLayout.auto") === true && A.E("homeLayout.hidden.length") === 0, "#8 Reset Home layout isn't undone by the next sync");
      ok(B.E("homeLayout.auto") === true, "#8 …and reaches the other device");
      // The ranker still can't undo a hand-made layout
      tick(); B.E(`homeLayout = { order: ["goals","month"], hidden: [], auto: false, ts: Date.now(), v: 1 }; saveHomeLayout(false);`); await sleep(20);
      tick(); A.E(`homeLayout = { order: [], hidden: [], auto: true, ts: Date.now() + 99999, v: 1 };`); await A.sync();
      ok(A.E("homeLayout.auto") === false, "#8 a layout nobody chose still loses to a hand-made one, whatever its time");
      A.w.close(); B.w.close();
    }

    // ── #9 AI keys ──────────────────────────────────────────────────────────
    {
      const [A, B] = await fresh();
      tick(); A.E(`localStorage.setItem(AI_PRIVACY_KEY, "1"); vaultConfirm = async () => true; renderAIProviderCards && renderAIProviderCards();`);
      const setKey = async (D, k) => { D.E(`(document.getElementById("aikey-gemini") || (() => { const i = document.createElement("input"); i.id = "aikey-gemini"; document.body.appendChild(i); return i; })()).value = "${k}"`); await D.E(`saveAIKey("gemini")`); };
      await setKey(A, "OLDKEY"); await sleep(10);
      tick(); await A.sync(); tick(); await B.sync();
      ok(B.E(`getAIKey("gemini")`) === "OLDKEY", "#9 a key reaches the other device");
      tick(); A.E(`clearAIKey("gemini")`); await sleep(10);
      tick(); await B.sync(); tick(); await A.sync();
      ok(A.E(`getAIKey("gemini")`) === "", "#9 a deleted key stays deleted (it came back)");
      ok(B.E(`getAIKey("gemini")`) === "" || (await B.sync(), B.E(`getAIKey("gemini")`) === ""), "#9 …on the other device too");
      tick(); await setKey(A, "NEWKEY");
      tick(); await B.sync(); tick(); await A.sync();
      ok(A.E(`getAIKey("gemini")`) === "NEWKEY", "#9 a new key isn't replaced by the other device's old one");
      const keys = JSON.parse(drive.text)._aiSettings.keys;
      ok(keys.gemini && keys.gemini.ts < clock, "#9 the backup carries when the key was set, not when it was written");
      A.w.close(); B.w.close();
    }

    // ── #10 No endless sync in a small vault ────────────────────────────────
    {
      drive.text = null;
      const SMALL = Object.assign({}, BASE, { savings_data_v4: JSON.stringify({ "2026": { saved: [["2026-11-01", 100, "s1", 1000, null, null, "ub"]], removed: [] } }) });
      const A = device(SMALL), B = device(SMALL); await sleep(40);
      for (const D of [A, B]) D.E(`gdReadFile = () => new Promise(r => setTimeout(() => r(window.__drive.text), 15));
        gdWriteFile = async () => { window.__drive.text = await buildVaultPayload(); window.__w = (window.__w || 0) + 1; return true; };`);
      A.E("triggerCloudSync()"); await sleep(200);
      B.E("triggerCloudSync()"); await sleep(900);
      ok(B.E("window.__w") <= 2, "#10 a vault under 8 transactions syncs once, not non-stop: " + B.E("window.__w") + " writes");
      A.w.close(); B.w.close();
    }

    // ── #11 The currency question settles ───────────────────────────────────
    {
      drive.text = null;
      const D = device(Object.assign({}, BASE, { vault_currency: "USD", vault_account_tombstones: JSON.stringify(["ing"]) })); await sleep(40);
      await D.sync();
      const C = device(BASE); await sleep(40);
      const open = () => !C.d.getElementById("currency-mismatch-popup").classList.contains("hidden");
      C.E("triggerCloudSync()"); await sleep(60);
      ok(open() && C.pill() === "Choose a currency", "#11 the question opens, and the pill says what's waiting (it stuck on Syncing…)");
      await C.E(`resolveCurrencyMismatch("keep-local")`); await sleep(80);
      ok(!open(), "#11 after Keep AUD it doesn't ask again (it asked on every sync)");
      ok(JSON.parse(drive.text)._currency === "AUD" && C.pill() === "Backed up", "#11 …and the backup is written");
      ok(!C.E(`accounts.some(a => a.id === "ing")`), "#11 …with the file's deletions applied too");
      C.w.close(); D.w.close();
    }

    // ── #12 NAS ─────────────────────────────────────────────────────────────
    {
      drive.text = null;
      const A = device(BASE); await sleep(40);
      A.E(`gdLinked = false; window.__nas = null;
           readFromNAS = async () => window.__nas; writeToNAS = async () => { window.__nas = await buildVaultPayload(); return true; };
           showDriveMergeDialog = async () => "merge";`);
      // Load from NAS + Merge
      A.E(`window.__nas = JSON.stringify({ _data: { "2026": { saved: [["2026-11-03", 12, "n0", Date.now(), null, null, "ub"]], removed: [] } } }); nasConfig = { url: "https://nas/v.json", user: "u", pass: "p" };`);
      await A.E(`loadFromNAS()`); await sleep(20);
      ok(A.d.getElementById("nas-status").textContent === "Connected." && A.has("n0"), "#12 Load + Merge says Connected (it said Could not parse server data.)");
      // Encrypted server file
      A.E(`nasLinked = true;`);
      await A.E(`(async () => { vaultEncKey = await deriveKeyFromPassword("pw"); vaultEncActive = true; })()`);
      await A.sync();
      await A.E(`(async () => { const o = await decryptDataObj(window.__nas, vaultEncKey); o._data["2026"].saved.push(["2026-11-12", 55, "other1", Date.now() + 5000, null, null, "ub"]); window.__nas = await encryptDataObj(o, vaultEncKey); })()`);
      tick(); await A.sync();
      ok(A.has("other1"), "#12 an encrypted NAS file is merged (it was overwritten)");
      // Connecting reads what's there first
      A.E(`nasLinked = false; nasConfig = null; vaultEncActive = false; vaultEncKey = null; window.__put = 0;
           window.__nas = JSON.stringify({ _data: { "2026": { saved: [["2026-11-04", 13, "srv1", Date.now(), null, null, "ub"]], removed: [] } } });
           readFromNAS = async () => window.__nas;
           fetch = async (u, o) => { if (o && o.method === "PUT") { window.__put++; window.__nas = o.body; } return { ok: true, status: 200, text: async () => "" }; };
           document.getElementById("nas-url").value = "https://nas/v.json"; document.getElementById("nas-user").value = "u";`);
      await A.E(`connectNAS()`); await sleep(20);
      ok(A.has("srv1") && /srv1/.test(A.E("window.__nas")), "#12 connecting a NAS merges the file already there (it wrote over it)");
      A.w.close();
    }

    // ── #14 A file loaded over this device's data can't bring back what it deleted ──
    {
      drive.text = null;
      const A = device(Object.assign({}, BASE, { vault_tombstones: JSON.stringify(["t3"]) })); await sleep(40);
      A.E(`vaultApplyLoadChoice("overwrite-app", { "2026": { saved: [["2026-04-05", 103, "t3", 1000, null, null, "ub"], ["2026-05-05", 104, "t4", 1000, null, null, "ing"]], removed: [] } }, [], {})`);
      ok(!A.has("t3") && A.has("t4"), "#14 Replace this device's data leaves out rows it had deleted");
      ok((html.match(/data = vaultDropTombstoned\(/g) || []).length >= 4 && !/\n\s+data = safe;\n/.test(html), "#14 every Replace path drops them");
      A.w.close();
    }

    // ── #15 Clear all data ──────────────────────────────────────────────────
    {
      const A = device(Object.assign({}, BASE, { vault_ai_key_gemini: "K", vault_goals: "[]", vault_gd_v1: "{}", vault_nas_v1: JSON.stringify({ url: "u", user: "u", pass: "p" }) })); await sleep(40);
      A.E(`vaultDelete = async () => "clear";`);
      await A.E(`clearBrowserData()`); await sleep(20);
      const left = Object.keys(A.storage()).filter(k => /^(vault|savings_)/.test(k));
      ok(!left.length, "#15 Clear all data leaves nothing of Vault's behind: " + left.join(", "));
      ok(A.E("gdLinked") === false && A.E("nasLinked") === false, "#15 …and disconnects the backups, so nothing merges straight back in");
      A.w.close();
    }

    // ── Version ─────────────────────────────────────────────────────────────
    {
      const A = device({}); await sleep(30);
      const v = s => s.replace(/^\D*/, "").split(".").map(Number);
      const about = v(A.d.getElementById("about-version-meta").textContent), foot = v(A.d.getElementById("version-footer").textContent);
      const ge = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      ok(ge(about, [6, 18, 6]) >= 0 && about.join() === foot.join(), "version is 6.18.6 or later, About matches the footer");
      A.w.close();
    }
  } catch (e) { fail++; console.log("ERROR:", e.stack); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)|read failed \(test\)/.test(e));
  pageErrors.forEach(e => console.log("PAGE ERROR:", e));
  console.log(`v6.18.6: ${pass} passed, ${fail} failed, ${pageErrors.length} page errors`);
  process.exit(fail || pageErrors.length ? 1 : 0);
}, 100);
