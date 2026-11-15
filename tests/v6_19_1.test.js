// v6.19.1 regression tests (15 Nov 2026): the encryption recovery key keeps working.
// It only lived in memory, so after Vault locked or restarted, backups were written with the
// password only and vault-recovery.json couldn't open them. Also: the lock screen accepted any
// password, the Encrypted backup popup's recovery button never opened the file picker, and a
// recovery left the backup unreadable.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_19_1.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const nodeCrypto = require("crypto").webcrypto;
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const errors = [];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 4000) => { for (let t = 0; t < ms && !f(); t += 25) await sleep(25); return f(); };
const PW = "correct horse 1";

const drive = { text: null };
let downloads = [];
function device(storage = {}) {
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
  E(`gdLinked = true; gdTokens = { accessToken: "x", refreshToken: "r", expiresAt: 9e15, fileId: "f" };
     gdReadFile = async () => window.__drive.text;
     gdWriteFile = async () => { window.__drive.text = await buildVaultPayload(); return true; };`);
  const dev = {
    w, E, d: w.document,
    sync: async () => { await E("triggerCloudSync()"); await sleep(10); },
    has: id => E(`Object.values(data).flatMap(y => [...y.saved, ...y.removed]).some(r => r[2] === "${id}")`),
    add: (id, amt = 10) => E(`data["2026"].saved.push(["2026-11-12", ${amt}, "${id}", Date.now(), null, null, "ub"]); saveLocal();`),
    storage: () => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; },
  };
  dev.reload = () => { const st = dev.storage(); w.close(); return device(st); };
  return dev;
}
const BASE = {
  vault_accounts_v1: JSON.stringify([{ id: "ub", name: "UBank", color: "#4a8fc0", currency: "AUD", ts: 1 }]),
  savings_data_v4: JSON.stringify({ "2026": { saved: Array.from({ length: 10 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}-05`, 100 + i, "t" + i, 1000, null, null, "ub"]), removed: [] } }),
  vault_currency: "AUD",
};
// Open the backup's recovery copy with a recovery file, the way the recovery path does
async function openWithRecovery(text, recovB64) {
  const env = JSON.parse(text);
  if (!env.riv || !env.rct) return null;
  const k = await nodeCrypto.subtle.importKey("raw", Buffer.from(recovB64, "base64"), { name: "AES-GCM" }, false, ["decrypt"]);
  try {
    const plain = await nodeCrypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(env.riv, "base64") }, k, Buffer.from(env.rct, "base64"));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch { return null; }
}
const rowsOf = o => Object.values(o._data || {}).flatMap(y => [...y.saved, ...y.removed]).map(r => r[2]);
const lockUnlock = async (D, pw) => { D.d.getElementById("lock-screen-pass").value = pw; await D.E("unlockVault()"); await sleep(20); };

setTimeout(async () => {
  try {
    // ── Setting a password ──────────────────────────────────────────────────
    let A = device(BASE); await sleep(40);
    await A.sync();
    downloads = [];
    ok(await A.E(`enablePasswordEncryption(${JSON.stringify(PW)})`) === true, "encryption turns on");
    const recov = JSON.parse(await downloads[0].text());
    ok(recov.vault_recovery === 1 && typeof recov.key === "string", "a recovery file is downloaded");
    ok(!!A.w.localStorage.getItem("vault_enc_check") && !!A.w.localStorage.getItem("vault_recov_check"), "the password check and the recovery check are stored");
    ok(!A.w.localStorage.getItem("vault_enc_check").includes(recov.key), "…and the recovery key is never stored in the clear");
    A.add("a1"); await A.sync();
    const env1 = JSON.parse(drive.text);
    ok(env1.vault_enc === 3 && env1.riv && env1.rk, "the backup carries the recovery copy and the wrapped key");
    ok(rowsOf(await openWithRecovery(drive.text, recov.key)).includes("a1"), "the recovery file opens it");

    // ── After a lock (15 minutes idle), the recovery copy is still written ──
    A.E(`showLockScreen()`);
    ok(A.E("vaultRecovKey") === null && A.E("vaultEncKey") === null, "locking wipes the keys from memory");
    await lockUnlock(A, "wrong password!");
    ok(A.E("vaultIsLocked") === true, "a wrong password doesn't unlock Vault (any password did)");
    ok(/Incorrect password/.test(A.d.getElementById("lock-screen-error").textContent), "…and says so");
    await lockUnlock(A, PW);
    ok(A.E("vaultIsLocked") === false && A.E("vaultRecovKey") !== null, "the right password unlocks, and the recovery key comes back");
    A.add("a2"); await A.sync(); await until(() => !A.E("_syncInProgress")); await A.sync(); await until(() => !A.E("_syncInProgress"));
    const after = await openWithRecovery(drive.text, recov.key);
    ok(after && rowsOf(after).includes("a2"), "a backup made after the lock still opens with the recovery file (it lost the recovery copy)");

    // ── After a restart ─────────────────────────────────────────────────────
    // Data on the phone isn't encrypted, so Vault opens; the backup shows as locked until the
    // password is entered. The first backup after updating has no rk, so the key comes back
    // from this device's own check.
    const env0 = JSON.parse(drive.text); delete env0.rk; drive.text = JSON.stringify(env0);
    A = A.reload(); await sleep(60);
    A.E(`gdLinked = true; gdTokens = { accessToken: "x", refreshToken: "r", expiresAt: 9e15, fileId: "f" };
         gdReadFile = async () => window.__drive.text; gdWriteFile = async () => { window.__drive.text = await buildVaultPayload(); return true; };`);
    if (A.E("vaultIsLocked")) {
      // v6.20.0 and later: the data on the device is encrypted, so Vault opens to the lock screen
      await lockUnlock(A, PW); await sleep(60);
      A.E(`gdLinked = true; gdTokens = { accessToken: "x", refreshToken: "r", expiresAt: 9e15, fileId: "f" };
           gdReadFile = async () => window.__drive.text; gdWriteFile = async () => { window.__drive.text = await buildVaultPayload(); return true; };`);
      ok(true, "after a restart Vault asks for the password");
      A.add("a3");
    } else {
      A.add("a3"); await A.sync(); await sleep(30);
      ok(!A.d.getElementById("enc-decrypt-popup").classList.contains("hidden"), "after a restart the backup asks for the password");
      A.d.getElementById("enc-decrypt-pass").value = PW;
      A.d.getElementById("enc-decrypt-btn").click();
      await until(() => A.E("vaultEncActive && !!vaultEncKey"));
      await sleep(100);
    }
    ok(A.E("vaultRecovKey") !== null, "…and the recovery key comes back on this device, even from a backup without rk");
    await A.sync();
    ok(rowsOf(await openWithRecovery(drive.text, recov.key) || {}).includes("a3"), "a backup made after a restart opens with the recovery file too");

    // ── Another device that opens the backup with the password ───────────────
    const B = device(BASE); await sleep(40);
    B.add("b1"); await B.sync(); await sleep(30);
    ok(!B.d.getElementById("enc-decrypt-popup").classList.contains("hidden"), "a device without the password is asked for it");
    B.d.getElementById("enc-decrypt-pass").value = PW;
    B.d.getElementById("enc-decrypt-btn").click();
    await until(() => B.has("a3"));
    await sleep(100);
    ok(B.E("vaultRecovKey") !== null, "…and learns the recovery key from the backup");
    const fromB = await openWithRecovery(drive.text, recov.key);
    ok(fromB && rowsOf(fromB).includes("b1"), "…so its backups open with the same recovery file");

    // ── The Encrypted backup popup's recovery button ─────────────────────────
    const C = device(BASE); await sleep(40);
    C.E(`window.__res = "pending"; promptAndDecrypt(window.__drive.text).then(r => window.__res = r);`); await sleep(20);
    const fileInput = C.d.getElementById("enc-recovery-file");
    let picked = 0; fileInput.click = () => { picked++; };
    C.d.getElementById("enc-recovery-btn").click(); await sleep(20);
    ok(picked === 1, "Use recovery key file opens the file picker");
    ok(!/Please select/.test(C.d.getElementById("enc-decrypt-error").textContent), "…instead of complaining there's no file (it never opened the picker)");
    Object.defineProperty(fileInput, "files", { value: [{ text: async () => JSON.stringify(recov) }], configurable: true });
    fileInput.dispatchEvent(new C.w.Event("change"));
    await until(() => C.E("window.__res") !== "pending");
    ok(C.E("!!window.__res && !!window.__res._data"), "choosing the file opens the backup");
    ok(C.E("vaultEncActive") === false && C.E("vaultRecovReadKey") !== null, "encryption is switched off for a new password, and the backup stays readable");
    C.add("c1"); await C.sync();
    ok(!/vault_enc/.test(drive.text) && rowsOf(JSON.parse(drive.text)).includes("b1") && rowsOf(JSON.parse(drive.text)).includes("c1"), "after recovering, the next sync merges the backup (it was stuck as locked)");

    // ── A wrong recovery file on the lock screen ────────────────────────────
    const fake = await nodeCrypto.subtle.exportKey("raw", await nodeCrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]));
    const fakeFile = JSON.stringify({ vault_recovery: 1, key: Buffer.from(fake).toString("base64") });
    A.E(`showLockScreen()`);
    const lf = A.d.getElementById("lock-recovery-file");
    Object.defineProperty(lf, "files", { value: [{ text: async () => fakeFile }], configurable: true });
    await A.E(`unlockWithRecoveryFile(document.getElementById("lock-recovery-file"))`);
    ok(A.E("vaultIsLocked") === true, "a recovery file that isn't this vault's doesn't unlock it (any file with a key did)");
    Object.defineProperty(lf, "files", { value: [{ text: async () => JSON.stringify(recov) }], configurable: true });
    await A.E(`unlockWithRecoveryFile(document.getElementById("lock-recovery-file"))`);
    ok(A.E("vaultIsLocked") === false && A.E("vaultEncActive") === false, "the right one does, with encryption off for a new password");

    // ── A device whose backups already lost the recovery key ─────────────────
    const D = device(Object.assign({}, BASE)); await sleep(40);
    await D.E(`(async () => { vaultEncKey = await deriveKeyFromPassword(${JSON.stringify(PW)}); vaultEncActive = true; })()`);
    D.E(`updateEncUI()`);
    ok(!D.d.getElementById("enc-recov-row").classList.contains("folded"), "Encryption settings say the recovery key isn't attached");
    downloads = [];
    await D.E(`makeNewRecoveryKey()`); await sleep(30);
    const recov2 = JSON.parse(await downloads[0].text());
    await D.sync();
    ok(rowsOf(await openWithRecovery(drive.text, recov2.key) || {}).length > 0, "Make a new recovery key downloads one that opens new backups");
    ok(D.d.getElementById("enc-recov-row").classList.contains("folded"), "…and the warning goes");
    ok(/vault_enc/.test(drive.text) && !!JSON.parse(drive.text).rk, "…and it travels with the backup");

    // ── Older versions can still read the backup ─────────────────────────────
    const env = JSON.parse(drive.text);
    ok(env.vault_enc === 3 && env.iv && env.ct, "the format is unchanged for older versions (rk is just an extra field)");

    // ── Version ─────────────────────────────────────────────────────────────
    const v = s => s.replace(/^\D*/, "").split(".").map(Number);
    const about = v(D.d.getElementById("about-version-meta").textContent), foot = v(D.d.getElementById("version-footer").textContent);
    const ge = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    ok(ge(about, [6, 19, 1]) >= 0 && about.join() === foot.join(), "version is 6.19.1 or later, About matches the footer");
    [A, B, C, D].forEach(x => { try { x.w.close(); } catch {} });
  } catch (e) { fail++; console.log("ERROR:", e.stack); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => console.log("PAGE ERROR:", e));
  console.log(`v6.19.1: ${pass} passed, ${fail} failed, ${pageErrors.length} page errors`);
  process.exit(fail || pageErrors.length ? 1 : 0);
}, 100);
