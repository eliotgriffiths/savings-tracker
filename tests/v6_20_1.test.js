// v6.20.1 regression tests (15 Nov 2026), encryption sweep #1, #3, #4:
//  #1 nothing is written unencrypted while Vault is locked (a background sync could write the
//     whole backup in the clear to a location with no file, or when the lock landed mid-sync)
//  #3 after a recovery, nothing is backed up until a new password is chosen (or the choice to
//     go without), and Vault asks for one straight away
//  #4 the wrong-password messages mention a password changed on another device
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_20_1.test.js
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
const secrets = /UBankSecretName|txid3/;

const drive = { text: null, writes: 0 };
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
  const dev = {
    w, E, d: w.document,
    link: () => E(`gdLinked = true; gdTokens = { accessToken: "x", refreshToken: "r", expiresAt: 9e15, fileId: "f" };
                   gdReadFile = async () => window.__drive.text;
                   gdWriteFile = async () => { window.__drive.text = await buildVaultPayload(); window.__drive.writes++; return true; };`),
    sync: async () => { await E("triggerCloudSync()"); await sleep(10); },
    rows: () => E(`Object.values(data).flatMap(y => [...y.saved, ...y.removed]).map(r => r[2])`),
    add: (id, amt = 10) => E(`data["2026"].saved.push(["2026-11-12", ${amt}, "${id}", Date.now(), null, null, "ub"]); saveLocal();`),
    storage: () => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; },
    pill: () => dev.d.getElementById("save-status").textContent.trim(),
    unlock: async pw => { dev.d.getElementById("lock-screen-pass").value = pw; await E("unlockVault()"); await sleep(60); },
    open: id => !dev.d.getElementById(id).classList.contains("hidden"),
  };
  dev.reload = () => { const st = dev.storage(); w.close(); return device(st); };
  return dev;
}
const BASE = {
  vault_accounts_v1: JSON.stringify([{ id: "ub", name: "UBankSecretName", color: "#4a8fc0", currency: "AUD", ts: 1 }]),
  savings_data_v4: JSON.stringify({ "2026": { saved: Array.from({ length: 10 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}-05`, 100 + i, "txid" + i, 1000, null, null, "ub"]), removed: [] } }),
  vault_currency: "AUD",
};

setTimeout(async () => {
  try {
    // ── #1 Locked: nothing is written, to an empty location or mid-sync ─────
    let A = device(BASE); await sleep(60);
    downloads = [];
    await A.E(`enablePasswordEncryption(${JSON.stringify(PW)})`); await sleep(50);
    const recov = JSON.parse(await downloads[0].text());
    A.link();
    drive.text = null; drive.writes = 0;
    A.E(`showLockScreen("locked")`);
    await A.sync(); await A.E(`triggerCloudSync()`); await sleep(30);
    ok(drive.text === null && drive.writes === 0, "a sync while locked writes nothing, even to a location with no file (it wrote everything in the clear)");
    await A.unlock(PW);
    await until(() => drive.writes > 0); await sleep(30);
    ok(drive.writes > 0 && /vault_enc/.test(drive.text) && !secrets.test(drive.text), "…and it runs after the unlock, encrypted");

    drive.text = null; drive.writes = 0;
    A.E(`gdReadFile = async () => { showLockScreen("locked"); return window.__drive.text; }`);
    await A.E(`triggerCloudSync()`); await sleep(30);
    ok(drive.text === null, "a lock that lands mid-sync stops the write (it wrote in the clear)");
    ok(A.E("_syncAfterUnlock") === true && A.pill() !== "Sync failed", "…and the sync waits for the unlock without reporting a failure");
    A.link();
    await A.unlock(PW);
    await until(() => drive.writes > 0); await sleep(30);
    ok(/vault_enc/.test(drive.text || "") && !secrets.test(drive.text || ""), "…then finishes, encrypted");

    let threw = null;
    A.E(`showLockScreen("locked")`);
    try { await A.E(`buildVaultPayload()`); } catch (e) { threw = String(e && e.message); }
    ok(threw && /locked/i.test(threw), "a backup can't be built in the clear while encryption is on and locked");
    await A.unlock(PW);

    // ── #3 Recovery: nothing backed up until a new password ─────────────────
    const recoverOnLock = async (D, file) => {
      const lf = D.d.getElementById("lock-recovery-file");
      Object.defineProperty(lf, "files", { value: [{ text: async () => JSON.stringify(file) }], configurable: true });
      await D.E(`unlockWithRecoveryFile(document.getElementById("lock-recovery-file"))`); await sleep(80);
      D.link();
    };
    const setPassword = async (D, pw) => {
      downloads = [];
      D.E(`openEncPasswordPopup()`);
      D.d.getElementById("enc-set-pass").value = pw;
      D.d.getElementById("enc-set-confirm").value = pw;
      await D.E(`encSetSubmit()`); await sleep(30);
      return JSON.parse(await downloads[0].text());
    };
    A = A.reload(); await sleep(80);
    await recoverOnLock(A, recov);
    ok(!A.E("vaultIsLocked") && A.rows().includes("txid3"), "the recovery file opens Vault");
    await until(() => A.open("enc-set-popup"), 2000);
    ok(A.open("enc-set-popup"), "…and asks for a new password straight away");
    ok(!A.d.getElementById("enc-set-recov").classList.contains("folded"), "…explaining nothing is backed up until there is one");
    let before = drive.text; drive.writes = 0;
    A.add("r1"); await A.sync(); await sleep(30);
    ok(drive.writes === 0 && drive.text === before, "nothing is written to the backup during the hold (it was saved unencrypted)");
    ok(A.pill() === "Set a password", "the status says Set a password");
    const recov2 = await setPassword(A, "a new password 2");
    await until(() => drive.writes > 0); await sleep(50);
    ok(drive.writes > 0 && /vault_enc/.test(drive.text) && !secrets.test(drive.text) && !A.E("vaultRecovHold()"), "a new password ends the hold, and the backup is written encrypted");

    // The hold survives a restart; a password set after it, plus the file, reads the backup
    A = A.reload(); await sleep(80);
    await recoverOnLock(A, recov2);
    A.d.getElementById("enc-set-popup").classList.add("hidden");
    A = A.reload(); await sleep(80); A.link();
    before = drive.text; drive.writes = 0;
    A.add("r2"); await A.sync(); await sleep(30);
    ok(drive.writes === 0 && drive.text === before && A.E("vaultRecovHold()"), "the hold survives a restart: still nothing written");
    await setPassword(A, "a third password 3");
    await sleep(50);
    ok(A.pill() === "Backup locked", "after a restart the old backup needs the recovery file again");
    A.E(`unlockBackup()`); await until(() => A.open("enc-decrypt-popup"), 2000);
    const fi = A.d.getElementById("enc-recovery-file");
    Object.defineProperty(fi, "files", { value: [{ text: async () => JSON.stringify(recov2) }], configurable: true });
    fi.dispatchEvent(new A.w.Event("change"));
    await until(() => drive.writes > 0, 3000); await sleep(80);
    ok(A.E("vaultEncActive") === true && !!A.E("vaultEncKey"), "using the file there keeps this device's new password (it switched encryption off)");
    ok(drive.writes > 0 && /vault_enc/.test(drive.text) && !secrets.test(drive.text), "…and the backup is written back encrypted with it");
    ok(!!(await A.E(`(async () => decryptDataObj(window.__drive.text, await deriveKeyFromPassword("a third password 3", typeof encKdfOf === "function" ? encKdfOf(window.__drive.text) : undefined)))()`)), "…which opens it");

    // Recover, then choose to go without encryption
    const recov3 = JSON.parse(await downloads[0].text());
    A = A.reload(); await sleep(80);
    await recoverOnLock(A, recov3);
    await A.sync(); await sleep(30);
    A.E(`window.__kp = vaultRecovKeepPlain()`); await sleep(50);
    A.d.getElementById("vd-c-ok").click(); await A.E("window.__kp"); await sleep(50);
    await until(() => !/vault_enc/.test(drive.text)); await sleep(30);
    ok(!A.E("vaultRecovHold()") && !/vault_enc/.test(drive.text) && /txid3/.test(drive.text), "choosing Back up unencrypted ends the hold and backs up as asked");

    // ── #4 Messages ─────────────────────────────────────────────────────────
    await A.E(`enablePasswordEncryption(${JSON.stringify(PW)})`); await sleep(50);
    A = A.reload(); await sleep(80);
    await A.unlock("an old password");
    ok(/another device/.test(A.d.getElementById("lock-screen-error").textContent), "the lock screen mentions a password changed on another device");
    ok(/another device/.test(A.E(`SS_NOW["Backup locked"].text`) || A.d.documentElement.innerHTML.match(/"Backup locked":\s*\{[^}]*/)[0]), "so does the Backup locked explanation");

    // ── Version ─────────────────────────────────────────────────────────────
    const v = s => s.replace(/^\D*/, "").split(".").map(Number);
    const about = v(A.d.getElementById("about-version-meta").textContent), foot = v(A.d.getElementById("version-footer").textContent);
    const ge = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    ok(ge(about, [6, 20, 1]) >= 0 && about.join() === foot.join(), "version is 6.20.1 or later, About matches the footer");
    try { A.w.close(); } catch {}
  } catch (e) { fail++; console.log("ERROR:", e.stack); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => console.log("PAGE ERROR:", e));
  console.log(`v6.20.1: ${pass} passed, ${fail} failed, ${pageErrors.length} page errors`);
  process.exit(fail || pageErrors.length ? 1 : 0);
}, 100);
