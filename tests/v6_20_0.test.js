// v6.20.0 regression tests (15 Nov 2026): with encryption on, nothing is readable before the
// password. Before, the data on the device was kept in the clear, so Vault opened straight to
// Home, and start-up switched encryption off until the backup was unlocked.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_20_0.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const nodeCrypto = require("crypto").webcrypto;
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const errors = [];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 4000) => { for (let t = 0; t < ms && !f(); t += 25) await sleep(25); return f(); };
const PW = "correct horse 1", AIKEY = "sk-test-SECRET-123456";

const drive = { text: null };
let downloads = [];
function device(storage = {}, withDrive = true) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
    beforeParse(w) {
      w.fetch = () => Promise.reject(new Error("offline (test)"));
      w.confirm = w.alert = w.prompt = () => { throw new Error("native dialog used"); };
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
      Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
      Object.defineProperty(w, "crypto", { value: nodeCrypto, configurable: true });
      w.URL.createObjectURL = b => { downloads.push(b); return "blob:test"; };
      w.URL.revokeObjectURL = () => {};
      Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, v));
    },
  });
  const w = dom.window, E = s => w.eval(s);
  w.__drive = drive;
  const dev = {
    w, E, d: w.document,
    link: () => E(`gdLinked = true; gdTokens = { accessToken: "x", refreshToken: "r", expiresAt: 9e15, fileId: "f" };
                   gdReadFile = async () => window.__drive.text;
                   gdWriteFile = async () => { window.__drive.text = await buildVaultPayload(); return true; };`),
    sync: async () => { await E("triggerCloudSync()"); await sleep(10); },
    rows: () => E(`Object.values(data).flatMap(y => [...y.saved, ...y.removed]).map(r => r[2])`),
    add: (id, amt = 10) => E(`data["2026"].saved.push(["2026-11-12", ${amt}, "${id}", Date.now(), null, null, "ub"]); saveLocal();`),
    storage: () => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; },
    dump: () => JSON.stringify(dev.storage()),
    locked: () => E("vaultIsLocked") === true && !dev.d.getElementById("vault-lock-screen").classList.contains("hidden"),
    unlock: async pw => { dev.d.getElementById("lock-screen-pass").value = pw; await E("unlockVault()"); await sleep(60); },
  };
  if (withDrive) dev.link();
  dev.reload = (wd = true) => { const st = dev.storage(); w.close(); return device(st, wd); };
  return dev;
}
const BASE = {
  vault_accounts_v1: JSON.stringify([{ id: "ub", name: "UBankSecretName", color: "#4a8fc0", currency: "AUD", ts: 1 }]),
  savings_data_v4: JSON.stringify({ "2026": { saved: Array.from({ length: 10 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}-05`, 100 + i, "txid" + i, 1000, null, null, "ub"]), removed: [] } }),
  vault_goals: JSON.stringify([{ id: "g1", name: "GoalSecretName", target: 5000, ts: 1 }]),
  vault_currency: "AUD",
};
async function openWithRecovery(text, recovB64) {
  const env = JSON.parse(text);
  if (!env.riv || !env.rct) return null;
  const k = await nodeCrypto.subtle.importKey("raw", Buffer.from(recovB64, "base64"), { name: "AES-GCM" }, false, ["decrypt"]);
  try { return JSON.parse(new TextDecoder().decode(await nodeCrypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(env.riv, "base64") }, k, Buffer.from(env.rct, "base64")))); } catch { return null; }
}
const rowsOf = o => Object.values((o && o._data) || {}).flatMap(y => [...y.saved, ...y.removed]).map(r => r[2]);
const secrets = /UBankSecretName|GoalSecretName|txid3|sk-test-SECRET|RuleSecretName/;

setTimeout(async () => {
  try {
    // ── Encryption off: opens as normal, data in the clear ──────────────────
    let A = device(BASE, false); await sleep(60);
    ok(!A.locked() && A.rows().includes("txid3"), "with encryption off, Vault opens straight in");
    A.E(`setAIKey("anthropic", ${JSON.stringify(AIKEY)});`);
    A.E(`recurRules.push({ id: "r1", name: "RuleSecretName", amount: 25, type: "saved", freq: "monthly", startDate: "2026-11-01", accountId: "ub", ts: 1 }); saveRecurring();`);
    A.E(`asRecent = ["txid3 search"]; asSaveRecent();`);
    ok(secrets.test(A.dump()), "…and its data is stored in the clear");

    // ── Turning encryption on encrypts what's on the device ─────────────────
    downloads = [];
    ok(await A.E(`enablePasswordEncryption(${JSON.stringify(PW)})`) === true, "encryption turns on");
    const recov = JSON.parse(await downloads[0].text());
    await sleep(50);
    ok(!secrets.test(A.dump()), "nothing readable is left on the device: transactions, accounts, goals, rules, searches, AI key");
    ok(A.E(`isEncryptedEnvelope(localStorage.getItem(DATA_KEY))`) && !A.w.localStorage.getItem("vault_accounts_v1"), "it's all in one encrypted envelope");
    ok(A.E(`getAIKey("anthropic")`) === AIKEY && A.E("accounts[0].name") === "UBankSecretName", "…and Vault still works with it while open");
    A.add("new1"); await sleep(50);
    ok(!/new1/.test(A.dump()), "a new transaction is stored encrypted too");

    // ── Restart: nothing shows or loads before the password ─────────────────
    A = A.reload(false); await sleep(80);
    ok(A.locked(), "Vault opens to the lock screen");
    ok(!A.rows().includes("txid3") && A.E("accounts.length") === 0 && A.E("goals.length") === 0, "…with nothing loaded behind it");
    ok(A.d.getElementById("welcome-modal").classList.contains("hidden"), "…and no Welcome screen");
    ok(!/1,0\d\d\.\d\d/.test(A.d.body.textContent), "…and no totals anywhere on the page");
    const before = A.dump();
    await A.unlock("wrong password!");
    ok(A.locked() && /Incorrect password/.test(A.d.getElementById("lock-screen-error").textContent), "a wrong password is refused");
    ok(A.dump() === before, "…and nothing on the device changes");
    A.link();
    await A.unlock(PW);
    ok(!A.locked(), "the right password opens it");
    ok(A.rows().includes("txid3") && A.rows().includes("new1"), "transactions are back, including the newest");
    ok(A.E("accounts[0].name") === "UBankSecretName" && A.E("goals[0].name") === "GoalSecretName" && A.E("recurRules.some(r => r.name === 'RuleSecretName')"), "accounts, goals and rules are back");
    ok(A.E(`getAIKey("anthropic")`) === AIKEY && A.E("asRecent[0]") === "txid3 search", "the AI key and recent searches are back");
    ok(A.E("vaultEncActive") === true && A.E("!!vaultEncKey") && A.E("!!vaultRecovKey"), "encryption stays on, with the password and recovery key ready");
    ok(/\$1,0\d\d\.\d\d/.test(A.d.getElementById("grand-net").textContent), "the totals are drawn after opening");

    // ── Backups straight after a restart are encrypted (they were written unencrypted) ──
    A.add("new2"); await A.sync(); await sleep(30);
    ok(/vault_enc/.test(drive.text) && !secrets.test(drive.text), "the first backup after a restart is encrypted");
    ok(rowsOf(await openWithRecovery(drive.text, recov.key)).includes("new2"), "…and opens with the recovery file");
    A.E(`buildVaultPayload().then(t => window.__dl = t)`); await sleep(50);
    ok(/vault_enc/.test(A.E("window.__dl")), "a downloaded or auto-saved backup is encrypted too");

    // ── Idle lock keeps working; changes made while open survive a restart ─
    A.E(`showLockScreen("Vault locked after 15 minutes of inactivity. Enter your password to continue.")`);
    ok(A.locked(), "the 15-minute lock still locks");
    await A.unlock(PW);
    ok(!A.locked() && A.rows().includes("new2"), "…and unlocks with everything as it was");
    A.add("new3"); await sleep(50);
    A = A.reload(false); await sleep(80);
    await A.unlock(PW);
    ok(A.rows().includes("new3"), "a change made after an idle unlock is there after a restart");

    // ── An older version can still open it ──────────────────────────────────
    const plainEnv = await A.E(`(async () => decryptDataObj(localStorage.getItem(DATA_KEY), await deriveKeyFromPassword(${JSON.stringify(PW)})))()`);
    ok(plainEnv && plainEnv._data && Array.isArray(plainEnv._accounts) && plainEnv._accounts[0].name === "UBankSecretName", "the envelope is the backup's own payload, so an older version's lock screen opens it");

    // ── Recovery file on the lock screen ────────────────────────────────────
    A = A.reload(false); await sleep(80);
    const lf = A.d.getElementById("lock-recovery-file");
    const fake = await nodeCrypto.subtle.exportKey("raw", await nodeCrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]));
    Object.defineProperty(lf, "files", { value: [{ text: async () => JSON.stringify({ vault_recovery: 1, key: Buffer.from(fake).toString("base64") }) }], configurable: true });
    await A.E(`unlockWithRecoveryFile(document.getElementById("lock-recovery-file"))`); await sleep(30);
    ok(A.locked(), "a recovery file that isn't this vault's is refused");
    Object.defineProperty(lf, "files", { value: [{ text: async () => JSON.stringify(recov) }], configurable: true });
    await A.E(`unlockWithRecoveryFile(document.getElementById("lock-recovery-file"))`); await sleep(80);
    ok(!A.locked() && A.rows().includes("new3") && A.E("accounts[0].name") === "UBankSecretName", "the recovery file opens it with everything there");
    ok(A.E("vaultEncActive") === false && !A.E(`isEncryptedEnvelope(localStorage.getItem(DATA_KEY))`) && /txid3/.test(A.dump()), "…and encryption is off, with the data back in the clear");
    A = A.reload(false); await sleep(80);
    ok(!A.locked() && A.rows().includes("new3") && A.E(`getAIKey("anthropic")`) === AIKEY, "after that, Vault opens without a password");

    // ── Remove encryption ───────────────────────────────────────────────────
    await A.E(`enablePasswordEncryption(${JSON.stringify(PW)})`); await sleep(50);
    ok(!secrets.test(A.dump()), "encryption back on hides it again");
    A.E(`disablePasswordEncryption()`); await sleep(30);
    ok(/txid3/.test(A.dump()) && /UBankSecretName/.test(A.dump()) && /sk-test-SECRET/.test(A.dump()), "removing encryption puts everything back in the clear");
    A = A.reload(false); await sleep(80);
    ok(!A.locked() && A.rows().includes("new3"), "…and Vault opens straight in");

    // ── A device from before: data in the clear with encryption on ──────────
    const L = device(Object.assign({}, BASE, { vault_enc_active: "true" }), false); await sleep(80);
    ok(!L.locked() && L.rows().includes("txid3") && L.E("accounts.length") === 1, "data kept in the clear from before opens, and Home is drawn (it stopped before drawing)");
    const B = device(BASE); await sleep(60);
    await B.E(`enablePasswordEncryption(${JSON.stringify(PW)})`); await sleep(30); await B.sync();
    L.link(); await L.sync(); await sleep(30);
    L.d.getElementById("enc-decrypt-pass").value = PW;
    L.d.getElementById("enc-decrypt-btn").click();
    await until(() => L.E("!!vaultEncKey")); await sleep(120);
    ok(!secrets.test(L.dump().replace(/"vault_enc_check"[^,]*/, "")), "once the password opens the backup, that device's data is encrypted too");
    const L2 = L.reload(false); await sleep(80);
    ok(L2.locked(), "…and from then on it opens to the lock screen");

    // ── Version ─────────────────────────────────────────────────────────────
    const v = s => s.replace(/^\D*/, "").split(".").map(Number);
    const about = v(A.d.getElementById("about-version-meta").textContent), foot = v(A.d.getElementById("version-footer").textContent);
    const ge = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    ok(ge(about, [6, 20, 0]) >= 0 && about.join() === foot.join(), "version is 6.20.0 or later, About matches the footer");
    [A, B, L2].forEach(x => { try { x.w.close(); } catch {} });
  } catch (e) { fail++; console.log("ERROR:", e.stack); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => console.log("PAGE ERROR:", e));
  console.log(`v6.20.0: ${pass} passed, ${fail} failed, ${pageErrors.length} page errors`);
  process.exit(fail || pageErrors.length ? 1 : 0);
}, 100);
