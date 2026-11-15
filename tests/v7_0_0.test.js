// v7.0.0 regression tests (15 Nov 2026), encryption sweep #2 and the salt:
//  - a new password gets a random 16-byte salt and 600,000 PBKDF2 iterations (it was one fixed
//    app-wide salt and 310,000); every envelope says which; the old settings still open and a
//    typed password re-keys to the new ones, keeping the recovery key
//  - removing encryption on one device switches it off on the others (they wrote the backup
//    encrypted again), but only with proof it was removed by someone with the key
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v7_0_0.test.js
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
    sync: async () => { await E("triggerCloudSync()"); await sleep(20); await until(() => !E("_syncInProgress")); },
    rows: () => E(`Object.values(data).flatMap(y => [...y.saved, ...y.removed]).map(r => r[2])`),
    add: (id, amt = 10) => E(`data["2026"].saved.push(["2026-11-12", ${amt}, "${id}", Date.now(), null, null, "ub"]); saveLocal();`),
    storage: () => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; },
    pill: () => dev.d.getElementById("save-status").textContent.trim(),
    locked: () => E("vaultIsLocked") === true,
    unlock: async pw => { dev.d.getElementById("lock-screen-pass").value = pw; await E("unlockVault()"); await sleep(80); },
    enable: async pw => { downloads = []; await E(`enablePasswordEncryption(${JSON.stringify(pw)})`); await sleep(60); return JSON.parse(await downloads[0].text()); },
  };
  dev.reload = () => { const st = dev.storage(); w.close(); const n = device(st); return n; };
  return dev;
}
const BASE = {
  vault_accounts_v1: JSON.stringify([{ id: "ub", name: "UBankSecretName", color: "#4a8fc0", currency: "AUD", ts: 1 }]),
  savings_data_v4: JSON.stringify({ "2026": { saved: Array.from({ length: 10 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}-05`, 100 + i, "txid" + i, 1000, null, null, "ub"]), removed: [] } }),
  vault_currency: "AUD",
};
const kdfOf = t => { try { return JSON.parse(t).kdf || null; } catch { return null; } };

setTimeout(async () => {
  try {
    // ── A new password: random salt, 600,000 iterations, carried by every envelope ──
    let A = device(BASE); await sleep(60);
    const recA = await A.enable(PW);
    A.link(); await A.sync();
    const k = kdfOf(drive.text);
    ok(k && k.i === 600000 && Buffer.from(k.s, "base64").length === 16, "the backup says its key used a 16-byte random salt and 600,000 iterations");
    ok(JSON.stringify(kdfOf(A.w.localStorage.getItem("savings_data_v4"))) === JSON.stringify(k), "the copy on this device says the same");
    ok(JSON.stringify(kdfOf(A.w.localStorage.getItem("vault_enc_check"))) === JSON.stringify(k), "…and so does the password check");
    const opensWith = async (D, text, kdf) => !!(await D.E(`(async () => { try { return await decryptDataObj(${JSON.stringify(text)}, await deriveKeyFromPassword(${JSON.stringify(PW)}, ${JSON.stringify(kdf)})); } catch { return null; } })()`));
    ok(!(await opensWith(A, drive.text, null)), "the old fixed salt doesn't open it");
    ok(await opensWith(A, drive.text, k), "the backup's own salt does");
    const S = device(BASE); await sleep(40);
    await S.enable(PW);
    ok(S.E("vaultKdf.s") !== k.s, "the same password on another vault gets a different salt");
    S.w.close();

    // Opens with the password on a new device (it reads the backup's kdf)
    const B = device(BASE); await sleep(40); B.link();
    await B.sync(); await sleep(30);
    B.d.getElementById("enc-decrypt-pass").value = PW;
    B.d.getElementById("enc-decrypt-btn").click();
    await until(() => B.E("!!vaultEncKey")); await sleep(150);
    ok(B.E("vaultKdf && vaultKdf.s") === k.s && B.E("!!vaultRecovKey"), "a new device opens it with the password, taking the backup's salt and recovery key");

    // Restart: the lock screen opens with the stored kdf
    A = A.reload(); await sleep(80);
    await A.unlock(PW);
    ok(!A.locked() && A.rows().includes("txid3") && A.E("vaultKdf.s") === k.s, "after a restart, the password opens Vault (no re-key needed)");

    // ── A vault still on the old settings is re-keyed when the password is typed ──
    const L = device(BASE); await sleep(60);
    await L.E(`(async () => {
      vaultEncKey = await deriveKeyFromPassword(${JSON.stringify(PW)}); vaultKdf = null; vaultEncActive = true;
      await encAdoptRecovery(${JSON.stringify(recA.key)}); await encStoreCheck(); await vaultSealStart(); })()`);
    await sleep(60);
    ok(!kdfOf(L.w.localStorage.getItem("savings_data_v4")) && L.E(`isEncryptedEnvelope(localStorage.getItem(DATA_KEY))`), "(an old-settings vault, as v6.20 left it)");
    const L2 = L.reload(); await sleep(80);
    ok(L2.locked(), "it opens to the lock screen");
    await L2.unlock(PW);
    await sleep(120);
    const lk = kdfOf(L2.w.localStorage.getItem("savings_data_v4"));
    ok(!L2.locked() && L2.rows().includes("txid3"), "the old settings still open with the password");
    ok(lk && lk.i === 600000 && lk.s !== k.s && JSON.stringify(kdfOf(L2.w.localStorage.getItem("vault_enc_check"))) === JSON.stringify(lk), "…and typing it re-keys this device to a random salt");
    ok(L2.E("vaultRecovRaw") === recA.key, "…keeping the same recovery key, so the recovery file still works");
    L2.link(); L2.add("l1"); await L2.sync();
    ok(JSON.stringify(kdfOf(drive.text)) === JSON.stringify(lk), "its backups carry its new salt");
    A.link(); await A.sync();
    ok(A.rows().includes("l1") && A.pill() !== "Backup locked", "another device still reads them, through the shared recovery key");
    ok(/vault_enc/.test(drive.text) && !secrets.test(drive.text), "…and writes them back encrypted");
    L2.w.close();

    // ── #2 Removing encryption on one device switches it off on the others ──
    await B.sync();   // B is up to date and encrypted
    A.E(`window.__d = confirmDisableEnc()`); await sleep(60);
    A.d.getElementById("del-ok").click();
    await A.E("window.__d"); await sleep(60);
    ok(A.E("vaultEncActive") === false, "(encryption removed on device A)");
    await A.sync();
    ok(!/vault_enc/.test(drive.text) && JSON.parse(drive.text)._encOff && JSON.parse(drive.text)._encOff.r, "A's backup carries the proof that it was removed with the key");
    B.add("b1"); await B.sync();
    ok(B.E("vaultEncActive") === false, "device B switches encryption off too (it wrote the backup encrypted again)");
    ok(!/vault_enc/.test(drive.text) && /b1/.test(drive.text), "…and backs up without it");
    ok(!B.E(`isEncryptedEnvelope(localStorage.getItem(DATA_KEY))`), "…and its own copy is back in the clear");
    await A.sync();
    ok(A.pill() !== "Backup locked" && A.rows().includes("b1"), "device A doesn't end up asking for the password it removed");

    // A planted plain file can't switch it off
    const C = device(BASE); await sleep(40);
    await C.enable(PW); C.link();
    const planted = JSON.parse(drive.text); planted._encOff = { ts: Date.now() + 1e6 };
    drive.text = JSON.stringify(planted);
    await C.sync();
    ok(C.E("vaultEncActive") === true && /vault_enc/.test(drive.text), "a plain backup without a valid proof doesn't switch encryption off (and is written encrypted)");
    const forged = JSON.parse(JSON.stringify(planted)); delete forged.vault_enc;
    forged._data = planted._data || {}; forged._encOff = { ts: Date.now() + 2e6, r: { iv: "AAAAAAAAAAAAAAAA", ct: "AAAA" } };
    drive.text = JSON.stringify(forged);
    await C.sync();
    ok(C.E("vaultEncActive") === true, "…nor does one with a forged proof");

    // Turned back on here after it was removed elsewhere: stays on
    const D = device(BASE); await sleep(40);
    D.E(`localStorage.setItem("vault_enc_on_ts", String(Date.now() + 5e6))`);
    await D.E(`(async () => { vaultEncKey = await deriveKeyFromPassword("x"); vaultKdf = null; vaultEncActive = true; })()`);
    await D.E(`encRemoteOff({ _encOff: { ts: Date.now(), r: { iv: "x", ct: "y" } } }, false)`);
    ok(D.E("vaultEncActive") === true, "a device that set a password after the removal keeps it");
    [A, B, C, D].forEach(x => { try { x.w.close(); } catch {} });

    // ── Version ─────────────────────────────────────────────────────────────
    const V = device(BASE); await sleep(40);
    const v = s => s.replace(/^\D*/, "").split(".").map(Number);
    const about = v(V.d.getElementById("about-version-meta").textContent), foot = v(V.d.getElementById("version-footer").textContent);
    const ge = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    ok(ge(about, [7, 0, 0]) >= 0 && about.join() === foot.join(), "version is 7.0.0 or later, About matches the footer");
    V.w.close();
  } catch (e) { fail++; console.log("ERROR:", e.stack); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => console.log("PAGE ERROR:", e));
  console.log(`v7.0.0: ${pass} passed, ${fail} failed, ${pageErrors.length} page errors`);
  process.exit(fail || pageErrors.length ? 1 : 0);
}, 100);
