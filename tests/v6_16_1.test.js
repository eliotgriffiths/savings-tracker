// v6.16.1 regression tests (9 Nov 2026):
// Settings, About and Privacy are panels (a tray on a phone, the card on a wide
// screen); Save & backup is in the Menu with its live status; Google Drive stays
// connected through a failed refresh, asks to reconnect when Google ends the sign-in,
// and reconnects or restores without the merge question; the browser is asked to
// keep Vault's data; Home Screen app tags; a bigger period picker arrow.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_16_1.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
const FIXED = new Date("2026-11-09T07:30:00+10:00").getTime();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));

// A fake network: the sign-in relay and Google Drive. Tests set `net` to steer it.
const net = { refresh: "ok", files: [], file: null, calls: [] };
function fakeFetch(url, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  net.calls.push(method + " " + url);
  const res = (status, body) => Promise.resolve({
    ok: status >= 200 && status < 300, status,
    json: () => Promise.resolve(typeof body === "string" ? JSON.parse(body) : body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  });
  if (/\/refresh$/.test(url)) {
    if (net.refresh === "ok") return res(200, { access_token: "A2", expires_in: 3600 });
    if (net.refresh === "invalid_grant") return res(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
    return Promise.reject(new Error("offline (test)"));
  }
  if (/\/exchange$/.test(url)) return res(200, { access_token: "A1", refresh_token: "R1", expires_in: 3600 });
  if (/drive\/v3\/files\?q=/.test(url)) return net.search === "fail" ? Promise.reject(new Error("offline")) : res(200, { files: net.files });
  if (/alt=media/.test(url)) return res(200, net.file);
  if (/upload\/drive\/v3\/files/.test(url)) return res(200, { id: "NEW" });
  return Promise.reject(new Error("offline (test)"));
}

const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
  beforeParse(w) {
    const RD = w.Date;
    class MD extends RD { constructor(...a) { if (!a.length) super(FIXED); else super(...a); } static now() { return FIXED; } }
    MD.UTC = RD.UTC; MD.parse = RD.parse; w.Date = MD;
    w.fetch = fakeFetch;
    w.confirm = w.alert = w.prompt = () => { throw new Error("native dialog used"); };
    w.scrollTo = () => {};
    w.Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
    w.__persistAsked = 0;
    Object.defineProperty(w.navigator, "storage", { configurable: true, value: {
      persisted: () => Promise.resolve(false), persist: () => { w.__persistAsked++; return Promise.resolve(false); } } });
  },
});
const w = dom.window, d = w.document;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const E = s => w.eval(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
const txt = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const isOpen = id => { const el = d.getElementById(id); return !!el && !el.classList.contains("hidden"); };
const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");
const pill = () => txt(d.getElementById("save-status"));

setTimeout(async () => {
  E(`window._realSync = triggerCloudSync`);
  E(SEED);
  E(`_dataVersion++; _invalidateYearCache(); document.getElementById("welcome-modal")?.classList.add("hidden"); switchTab("home");`);
  E(`window._toasts = []; var _toast0 = toast; toast = function (m, k) { _toasts.push(String(m)); return _toast0.apply(this, arguments); };`);
  const lastToast = () => E(`_toasts[_toasts.length - 1] || ""`);

  // ── Settings: a panel, not a page ─────────────────────────────────────────
  ok(!$("#settings-page") && !$("#settings-scrim") && !/sp-lock/.test(html), "the Settings page, its scrim and its lock are gone");
  const sp = d.getElementById("settings-popup");
  ok(sp && sp.classList.contains("vp") && sp.firstElementChild.classList.contains("vp-panel"), "Settings uses the shared panel");
  ok(!!sp.querySelector(".vp-head .vp-title") && txt(sp.querySelector(".vp-title")) === "Settings" && !!sp.querySelector(".vp-head .modal-close"), "…with its title and ✕ in the head");
  ok(!!sp.querySelector(".vp-grab") && !sp.querySelector(".vp-foot"), "a handle on a phone, no footer (it's a list, like the Menu)");
  ok(!sp.querySelector(".sp-back"), "no ‹ Back: it's a tray now");
  ok(JSON.stringify($$("#settings-popup .sp-t").map(txt)) === '["Encryption","Currency","Year format","Customise Home","AI provider","Privacy policy","About Vault"]', "Settings keeps the set-and-forget items");
  ok(/#settings-popup \{ position: fixed; inset: 0; z-index: 180; \}/.test(css), "Settings sits under the popups it opens");
  E(`openMenuSheet()`);
  [...d.querySelectorAll("#menu-sheet .menu-item-btn")].find(b => /^Settings/.test(txt(b))).click();
  ok(isOpen("settings-popup") && !$("#menu-sheet").classList.contains("open"), "the Menu's Settings row opens the tray");
  ok(E(`vpTryDismiss(document.getElementById("settings-popup"))`) === true && !isOpen("settings-popup"), "an outside tap or swipe closes it");
  E(`openSettingsPage()`);
  [...sp.querySelectorAll(".sp-item")].find(b => /Year format/.test(txt(b))).click();
  ok(isOpen("year-format-popup") && isOpen("settings-popup") && E(`topOpenPopup().id`) === "year-format-popup", "a setting opens on top of Settings");
  E(`closeYearFormatPopup()`);
  ok(isOpen("settings-popup"), "…and closing it comes back to Settings");
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok(!isOpen("settings-popup"), "Escape closes Settings");

  // ── Save & backup is in the Menu, with its status ─────────────────────────
  const mItems = $$("#menu-sheet .menu-item-label").map(txt);
  ok(mItems.indexOf("Save & backup") === mItems.indexOf("Import") - 1, "phone Menu: Save & backup leads the Data section");
  const dItems = $$("#desktop-menu .dmenu-btn-label").map(txt);
  ok(dItems.indexOf("Save & backup") === dItems.indexOf("Import") - 1, "desktop Menu: the same");
  ok(d.querySelectorAll('[id="smod-save-sub"]').length === 1, "the status label isn't duplicated");
  E(`setSaveStatus("warn", "No backup")`);
  ok(txt($("#smod-save-sub")) === "No backup" && txt($("#dmenu-save-sub")) === "No backup", "the Menu shows No backup");
  E(`gdLinked = true; setSaveStatus("ok", "Backed up")`);
  ok(txt($("#smod-save-sub")) === "Google Drive · Backed up" && txt($("#dmenu-save-sub")) === "Google Drive · Backed up", "…and where the backup is once there is one");
  E(`gdLinked = false; setSaveStatus("warn", "No backup")`);
  [...d.querySelectorAll("#menu-sheet .menu-item-btn")].find(b => /Save & backup/.test(txt(b))).click();
  ok(isOpen("setup-modal"), "the row opens Save & backup");
  E(`closeSetup()`);
  ok(!/Menu → Settings → Save/.test(html), "every message points at Menu → Save & backup");

  // ── About and Privacy: panels ─────────────────────────────────────────────
  ok(!$("#about-overlay") && !$("#privacy-overlay"), "the full-screen pages are gone");
  for (const id of ["about-popup", "privacy-popup"]) {
    const el = d.getElementById(id);
    ok(el.classList.contains("vp") && !!el.querySelector(".vp-head .vp-title") && !!el.querySelector(".vp-head .modal-close"), id + ": shared panel with title and ✕");
    ok(!!el.querySelector(".vp-foot .pbtn-secondary") && txt(el.querySelector(".vp-foot")) === "Done", id + ": a pinned Done");
  }
  ok(/#privacy-popup, #about-popup \{ position: fixed; inset: 0; z-index: 610; \}/.test(css) && /#welcome-modal \{[^}]*z-index: 600;/.test(css), "both sit above Welcome");
  ok(!/function openPrivacy\(\) \{[^}]*body\.style\.overflow/.test(html), "Privacy no longer locks scrolling with body.style");
  E(`openAbout()`); await sleep(20);
  ok(isOpen("about-popup") && w.location.hash === "#about" && d.documentElement.classList.contains("vp-lock"), "About opens with its own history entry and locks the page");
  ok(/Version v\d/.test(txt($("#about-version-meta"))), "About shows the version");
  w.history.back(); await sleep(60);
  ok(!isOpen("about-popup") && w.location.hash === "", "Back closes About");
  E(`openAbout()`); await sleep(20);
  E(`vpTryDismiss(document.getElementById("about-popup"))`); await sleep(60);
  ok(!isOpen("about-popup") && w.location.hash === "", "an outside tap closes About and drops its entry");
  E(`openPrivacy()`); await sleep(20);
  ok(isOpen("privacy-popup") && w.location.hash === "#privacy", "Privacy opens at #privacy");
  [...d.querySelectorAll("#privacy-popup .vp-foot button")][0].click(); await sleep(60);
  ok(!isOpen("privacy-popup") && w.location.hash === "", "Done closes it");
  E(`history.pushState(null, "", "#privacy"); checkPrivacyHash()`);
  ok(isOpen("privacy-popup"), "the vaultsavings.app/#privacy link opens it");
  w.history.back(); await sleep(60);
  ok(!isOpen("privacy-popup"), "…and Back closes it");

  // ── Period picker arrow ───────────────────────────────────────────────────
  ok(/#fy-title::after \{\s*content: "▾"; font: 400 19px\/1 'DM Sans', sans-serif; color: var\(--gold\); background: var\(--bg3\);\s*border: 1px solid var\(--border\); border-radius: 10px; width: 40px; height: 40px;/.test(css),
     "the list title's arrow matches the year buttons: 40×40, 19 px, bordered, gold");
  ok(/\.ps-exp \{ width: 40px; height: 40px;[^}]*font-size: 19px;/.test(css), "(the year buttons it matches)");

  // ── Home Screen app ───────────────────────────────────────────────────────
  ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(html), "links the manifest");
  ok(/<meta name="apple-mobile-web-app-capable" content="yes">/.test(html) && /<meta name="apple-mobile-web-app-title" content="Vault">/.test(html), "Apple Home Screen tags");
  const man = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  ok(man.display === "standalone" && man.start_url === "/" && man.name === "Vault", "manifest: standalone, from /");
  ok(man.icons.every(i => fs.existsSync(path.join(root, i.src))), "manifest icons exist");
  ok(html.indexOf('<link rel="manifest"') < html.indexOf("<title>Vault</title>") && html.indexOf('<link rel="manifest"') > html.indexOf('name="theme-color"'), "tags sit in the real <head>");
  ok(w.__persistAsked === 1, "asks the browser to keep Vault's data");

  // ── Google Drive: a failed refresh doesn't unlink it ──────────────────────
  const tokens = (o = {}) => JSON.stringify(Object.assign({ accessToken: "A0", refreshToken: "R0", expiresAt: FIXED - 1000, fileId: "F1" }, o));
  E(`localStorage.setItem(GD_KEY, ${JSON.stringify(tokens())}); gdTokens = JSON.parse(localStorage.getItem(GD_KEY)); gdLinked = true;`);
  net.refresh = "offline";
  ok(await E(`gdEnsureToken()`) === false && E("gdLinked") === true, "offline: the refresh fails but Drive stays linked");
  ok(!E("gdTokens.revoked"), "…and it isn't taken as a sign-out");
  E(`triggerCloudSync = _realSync; _syncInProgress = false;`);
  await E(`triggerCloudSync()`);
  ok(pill() === "Sync failed" && E("pendingRetry") === true, "the sync shows Sync failed and will retry");
  ok(/window\.addEventListener\("online", \(\) => \{ if \(pendingRetry\) triggerCloudSync\(\); \}\);/.test(html), "coming back online retries straight away");
  net.refresh = "ok";
  await E(`triggerCloudSync()`);
  ok(pill() === "Backed up" && E("gdTokens.accessToken") === "A2", "once it's reachable, the retry renews the sign-in and backs up");

  // ── Google ends the sign-in: Reconnect Drive, file remembered ─────────────
  E(`gdTokens.expiresAt = ${FIXED - 1000}; gdSaveTokens(gdTokens);`);
  net.refresh = "invalid_grant";
  await E(`triggerCloudSync()`);
  ok(E("gdLinked") === false && pill() === "Reconnect Drive", "invalid_grant: the pill says Reconnect Drive");
  const kept = JSON.parse(E(`localStorage.getItem(GD_KEY)`));
  ok(kept.revoked === true && kept.fileId === "F1", "…the Drive file is remembered for the reconnect");
  ok(txt($("#smod-save-sub")) === "Reconnect Drive", "…and the Menu says so");
  E(`openSaveStatusLegend()`);
  ok(JSON.stringify($$("#ss-now-btns button").map(txt)) === '["Reconnect Google Drive","Done"]', "the status popup leads with Reconnect Google Drive");
  E(`closeSaveStatusLegend()`);
  ok($$("#save-status-legend-popup span").some(s => txt(s) === "Reconnect Drive"), "the status list explains Reconnect Drive");

  // Startup: a remembered sign-out, an offline refresh, the startup key
  E(`gdLinked = false; gdTokens = null;`);
  await E(`initGoogleDrive()`);
  ok(E("gdLinked") === false && pill() === "Reconnect Drive", "startup with an ended sign-in: Reconnect Drive, no refresh attempt");
  E(`localStorage.setItem(GD_KEY, ${JSON.stringify(tokens())}); gdLinked = false; gdTokens = null;`);
  net.refresh = "offline";
  await E(`initGoogleDrive()`);
  ok(E("gdLinked") === true && pill() === "Sync failed" && E("pendingRetry") === true, "startup offline: stays linked and retries (it used to say No backup)");
  ok(/const _hasGD    = \(\(\) => \{ try \{ return !!JSON\.parse\(localStorage\.getItem\(GD_KEY\)/.test(html), "the startup Reconnecting… check reads the right key");
  E(`clearTimeout(retryTimer); retryTimer = null; pendingRetry = false;`);

  // No file remembered and the search can't run: never create a second file
  E(`gdTokens = { accessToken: "A9", refreshToken: "R9", expiresAt: ${FIXED + 3600e3}, fileId: null }; gdLinked = true;`);
  net.search = "fail"; net.calls.length = 0;
  ok(await E(`gdWriteFile()`) === false && !net.calls.some(c => /^POST .*upload/.test(c)), "no remembered file + no search: doesn't create a duplicate");
  net.search = "ok"; net.files = [{ id: "F7", modifiedTime: "2026-11-08T00:00:00Z" }]; net.calls.length = 0;
  ok(await E(`gdWriteFile()`) === true && E("gdTokens.fileId") === "F7" && net.calls.some(c => /^PATCH .*F7/.test(c)), "…and once it can search, it writes to the file it finds");

  // ── Reconnecting and restoring skip the merge question ────────────────────
  const remote = await E(`buildVaultPayload()`);
  const redirect = async (reconnectId) => {
    E(`sessionStorage.setItem("gd_verifier", "v"); ${reconnectId ? `sessionStorage.setItem("gd_reconnect_file", "${reconnectId}")` : `sessionStorage.removeItem("gd_reconnect_file")`};
       history.replaceState({}, "", "/?code=abc"); gdLinked = false; gdTokens = null; _toasts.length = 0;`);
    const p = E(`gdHandleRedirect()`);
    await sleep(80);
    return p;
  };
  net.file = remote; net.files = [{ id: "F1", modifiedTime: "2026-11-08T00:00:00Z" }];
  await redirect("F1");
  ok(!isOpen("drive-merge-popup") && !isOpen("setup-modal"), "reconnecting to the same file: no merge question, no Setup panel");
  ok(lastToast() === "Google Drive reconnected" && E("gdLinked") === true && !E("gdTokens.revoked"), "…it says Google Drive reconnected and is linked again");
  ok(pill() === "Backed up", "…and backs up");

  const pr = redirect("OTHER");
  await sleep(50);
  ok(isOpen("drive-merge-popup"), "a different Drive file with data on both sides still asks");
  E(`resolveDriveMerge("cancel")`); await pr;

  const before = E(`Object.values(data).reduce((n, y) => n + y.saved.length + y.removed.length, 0)`);
  E(`Object.keys(data).forEach(k => { data[k].saved = []; data[k].removed = []; })`);
  ok(E(`vaultIsEmpty()`) === true, "(an emptied browser)");
  E(`openSaveStatusLegend()`);
  ok($$("#ss-now-btns button").map(txt).includes("Restore from Google Drive"), "No backup on an empty app offers Restore from Google Drive");
  E(`closeSaveStatusLegend()`);
  await redirect(null);
  const after = E(`Object.values(data).reduce((n, y) => n + y.saved.length + y.removed.length, 0)`);
  ok(!isOpen("drive-merge-popup") && lastToast() === "Restored from Google Drive", "an empty app restores from Drive without asking");
  ok(after === before && before > 0, `…and every transaction comes back (${after} of ${before})`);
  ok(/sessionStorage\.setItem\("gd_reconnect_file", prev\.fileId\)/.test(html), "Connect remembers the Drive file this device used");

  // ── Version ───────────────────────────────────────────────────────────────
  const ver = txt(d.getElementById("version-footer"));
  ok(txt(d.getElementById("about-version-meta")).replace("Version ", "") === ver, "About matches the footer");
  const v = ver.replace("v", "").split(".").map(Number);
  ok(v[0] > 6 || (v[0] === 6 && (v[1] > 16 || (v[1] === 16 && v[2] >= 1))), "version is v6.16.1 or later: " + ver);

  console.log(`v6.16.1: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
  if (errors.length) console.log(errors.slice(0, 5));
  process.exit(fail || errors.length ? 1 : 0);
}, 300);
