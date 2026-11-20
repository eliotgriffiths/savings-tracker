// v7.3.1 regression tests: the backup banner and pill at start-up, toasts and notices (the toast
// and banner sweep, 17 Nov 2026), and Home's ranking (news counts once, routine isn't news, first
// place moves, and H1–H13 of the Home ranking sweep, 18 Nov 2026).
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v7_3_1.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const NOW = new Date("2026-11-18T08:30:00+10:00").getTime();
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];

function page(opts = {}) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e.message || e)));
  let now = opts.now || NOW;
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
    beforeParse(w) {
      const RD = w.Date;
      class MD extends RD { constructor(...a) { if (!a.length) super(now); else super(...a); } static now() { return now; } }
      MD.UTC = RD.UTC; MD.parse = RD.parse; w.Date = MD;
      w.fetch = opts.fetch || (() => Promise.reject(new Error("offline (test)")));
      w.confirm = w.alert = w.prompt = () => { throw new Error("native dialog used"); };
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
      Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
      if (opts.iphone) {
        Object.defineProperty(w.navigator, "userAgent", { value: IPHONE, configurable: true });
        Object.defineProperty(w.navigator, "maxTouchPoints", { value: 5, configurable: true });
        delete w.showSaveFilePicker;
      }
      w.__seen = { banner: [], pill: [] };
      // Record the banner and the pill from the first moment (every 5 ms)
      w.setInterval(() => {
        const b = w.document.getElementById("compat-banner"), p = w.document.getElementById("save-status");
        if (b) w.__seen.banner.push(b.style.display !== "none");
        if (p) w.__seen.pill.push(p.textContent);
      }, 5);
      if (opts.storage) Object.entries(opts.storage).forEach(([k, v]) => w.localStorage.setItem(k, v));
      if (opts.before) opts.before(w);
    },
  });
  const w = dom.window;
  return { w, d: w.document, E: s => w.eval(s), J: s => JSON.parse(w.eval(`JSON.stringify(${s})`)), tick: ms => { now += ms; }, setNow: t => { now = t; } };
}
const GD = JSON.stringify({ accessToken: "a", refreshToken: "r", expiresAt: 0, fileId: "f" });
const slowFetch = () => new Promise((res, rej) => setTimeout(() => rej(new Error("offline (test)")), 900));

// A vault shaped like Eliot's: two accounts, pay twice a month, withdrawals every 3 days,
// interest on the 28th. `nets` overrides chosen months' totals.
const SEED = (nets = {}) => `(() => {
  triggerCloudSync = () => {};
  accounts = [{ id: "ing", name: "ING", color: "#e8834a", currency: "AUD" }, { id: "ub", name: "UBank", color: "#6aa2d8", currency: "AUD" }];
  recurRules = []; goals = []; data = {}; tombstones = new Set();
  let n = 0;
  const put = (ds, amt, kind, acc) => { const fy = yearKeyForDate(ds); data[fy] = data[fy] || { saved: [], removed: [] };
    (kind === "wit" ? data[fy].removed : data[fy].saved).push([ds, amt, "s" + (++n), 1700000000000 + n, kind === "int" ? "interest" : null, null, acc]); };
  window.__put = put;
  const nets = ${JSON.stringify(nets)};
  for (let m = 0; m < 13; m++) {
    const d = new Date(2025, 10 + m, 1);
    const ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const last = ym === "2026-11" ? 16 : dim;
    put(ym + "-01", 1300, "dep", "ing"); if (last >= 15) put(ym + "-15", 1300, "dep", "ing");
    for (let day = 3; day <= last; day += 3) put(ym + "-" + String(day).padStart(2, "0"), 280, "wit", day % 2 ? "ing" : "ub");
    if (last >= 28) put(ym + "-28", 12, "int", "ub");
    if (nets[ym] !== undefined) {   // nudge the month to the wanted total
      let net = 0; Object.values(data).forEach(fy => { fy.saved.forEach(t => { if (t[0].startsWith(ym)) net += t[1]; }); fy.removed.forEach(t => { if (t[0].startsWith(ym)) net -= t[1]; }); });
      const diff = nets[ym] - net;
      if (diff > 0) put(ym + "-02", diff, "dep", "ub"); else if (diff < 0) put(ym + "-02", -diff, "wit", "ub");
    }
  }
  _dataVersion++; _invalidateYearCache && _invalidateYearCache();
  homeLayout = { order: [], hidden: [], pins: {}, auto: true, ts: 0, v: 1 };
  autoLayout = { order: [], ranked: [], computedAt: 0, reasons: {}, shown: {}, cycle: 0 };
})()`;

setTimeout(async () => {
  try {
    // ════ #1 the banner and the pill at start-up ════════════════════════════════════════════════
    {
      const A = page({ iphone: true, storage: { vault_gd_v1: GD }, fetch: slowFetch });
      await sleep(1600);
      ok(A.J(`__seen.banner`).length > 20 && !A.J(`__seen.banner`).some(Boolean), "#1 Drive set up, slow sign-in: the banner never shows");
      ok(!A.J(`__seen.pill`).includes("No backup"), "#1 …and the pill never says No backup: " + [...new Set(A.J(`__seen.pill`))].join(" → "));
      A.w.close();
      const B = page({ iphone: true, storage: { vault_gd_v1: GD } });
      await sleep(1200);
      ok(!B.J(`__seen.banner`).some(Boolean), "#1 offline with Drive set up: the banner never shows (it stayed all session)");
      B.w.close();
      const C = page({ iphone: true, storage: { vault_nas_v1: JSON.stringify({ url: "https://nas.example/dav/vault.json", user: "u", pass: "p" }) } });
      await sleep(80);
      const c80 = C.J(`__seen.pill`);
      ok(!c80.includes("No backup"), "#1 A1 NAS set up: the pill never says No backup at start-up: " + [...new Set(c80)].join(" → "));
      ok(C.E(`_recurAfterSync`) === true || C.E(`vaultHasBackup()`), "#1 A1 …and the recurring check waits for the first sync");
      ok(!C.J(`__seen.banner`).some(Boolean), "#1 NAS set up: no banner");
      C.w.close();
      const D = page({ iphone: true });
      await sleep(600);
      ok(D.J(`__seen.banner`).some(Boolean) && D.d.getElementById("compat-banner").style.display !== "none", "#1 no backup at all: the banner shows");
      ok(D.d.getElementById("save-status").textContent === "No backup", "#1 …and the pill says No backup");
      ok(/^No backup yet\. On iPhone and iPad, back up to Google Drive or NAS$/.test(D.d.getElementById("compat-banner-text").textContent), "#5 the banner leads with the missing backup: " + D.d.getElementById("compat-banner-text").textContent);
      D.E(`dismissCompatBanner(); setSaveStatus("warn", "No backup");`);
      ok(D.d.getElementById("compat-banner").style.display === "none", "#1 its ✕ holds for the session, even when the pill updates");
      // E6: the other-tab strip is its own element and goes when the other tab does
      D.E(`showTabConflictBanner()`);
      ok(D.d.getElementById("tab-banner").style.display !== "none" && D.d.getElementById("compat-banner-text").textContent.startsWith("No backup"), "E6 the tab strip has its own element and text");
      D.E(`tabWarnShown = true; localStorage.setItem(TAB_KEY, TAB_ID); tabHeartbeat(); tabHeartbeat();`);
      ok(D.d.getElementById("tab-banner").style.display === "none" && D.E(`tabWarnShown`) === false, "E6 …and goes once the other tab stops");
      D.w.close();
      const F = page({ storage: { vault_local_file_linked: "1" } });
      await sleep(80);
      ok(F.E(`compatBackupSetUp()`) === true, "#1 a linked file counts as set up from the first moment (marker)");
      F.w.close();
    }

    // ════ static checks: wording, kinds, colours ════════════════════════════════════════════════
    const toastCalls = [...html.matchAll(/\btoast(?:Nudge|WithUndo)?\(([^;\n]*)/g)].map(m => m[1]);
    ok(!toastCalls.some(a => / — /.test(a)), "#5 no toast uses a dash between clauses: " + toastCalls.filter(a => / — /.test(a)).slice(0, 3).join(" | "));
    ok(!toastCalls.some(a => /›/.test(a)), "#5 paths in toasts use →");
    ok(!toastCalls.some(a => /Please|✓|✗|⚠/.test(a)), "#5 no Please or symbols in toasts");
    ok(!/\[enc\]/.test(html), "A8 no [enc] anywhere");
    ok(!/rgba\(46,\s*158,\s*168/.test(html), "#2 the hard-coded teal is gone");
    ok(!/toast\(`\$\{acc\.name\} colour updated`\)|toast\("Home layout saved"\)|toast\("Every section rotates"\)|toast\("Goal deleted"\)|toast\("Preset saved"\)|toast\("API key deleted"\)|"Transaction updated"\)/.test(html), "#3 the toasts for changes you can see are gone");
    ok(!/toast\(`Year \$\{yearLabel\(key\)\} added`/.test(html), "#3 A7 ensureFY's toast is gone");
    ok(!/No AI provider configured — set up/.test(html) && !/Unlocked with your recovery key\. Choose a new password/.test(html), "#3 the duplicate toasts are gone");
    ok(!/toast\("(Enter a valid|Enter a date|Enter a start date|Enter an account name|Enter an API key|Year already exists|End date must)/.test(html), "#4 no form slip is a toast");
    ok(!/setSaveStatus\("ok", "Backed up"\)/.test(html), "E5 every Backed up keeps · encrypted");
    ok(/notice \(orange\), error \(red\) — design-rules §7/.test(html), "E7 the toast comment");
    ok(/top: max\(18px, calc\(env\(safe-area-inset-top\)/.test(html), "E3 the toast pads for the status bar");
    ok(!/onclick="toast\('Holdings/.test(html) && !/connectCloudService\('(onedrive|dropbox)'\)/.test(html), "A6 Soon rows do nothing (no toast)");

    // ════ toasts and form notes in the running app ══════════════════════════════════════════════
    const P = page(), { E, J, d } = P, $ = id => d.getElementById(id);
    await sleep(500);
    E(SEED());
    E(`document.getElementById("welcome-modal")?.classList.add("hidden"); saveLocal(); render();`);
    const toastEl = () => $("toast"), toastText = () => (toastEl().textContent || "").trim();
    // #2 kinds
    E(`toast("x")`); E(`_toastHide()`);
    E(`_toastHide(); toast("Not merged yet. Choose a currency to carry on backing up", "notice")`);
    ok(toastEl().dataset.kind === "notice", "#2 the currency skip is a notice");
    ok(/toast\("Not merged yet\. Choose a currency to carry on backing up", "notice"\)/.test(html), "#2 …in the app's code too");
    ok(/toast\(`Rule and \$\{txCountLabel\(removed\)\} deleted`\);/.test(html) && /: "Account deleted"\);/.test(html), "#2 a delete that worked is neutral");
    ok(/toast\("Encryption was removed on another device", "notice"\)/.test(html) && /toast\("Year format changed on another device\. It applies next time you open Vault", "notice"\)/.test(html), "#2 changes from another device are notices");
    // Scheduling from Recurring says what the Add tray says
    E(`document.getElementById("recur-type").value = "deposit"; document.getElementById("recur-amount").value = "50";
       document.getElementById("recur-start").value = "2026-12-01"; document.getElementById("recur-freq").value = "monthly";
       _toastHide(); addRecurringRule();`);
    ok(toastText() === "Recurring deposit scheduled" && toastEl().dataset.kind === "done", "#2 Recurring's own form: same message and kind as Add: " + toastText());

    // #4 slips under the field; E1 tap to close; A5 the Undo survives
    E(`openAddSheet ? openAddSheet() : 0`); await sleep(30);
    E(`document.getElementById("mob-inp-amount").value = ""; _toastHide(); mobileAddTransaction();`);
    ok($("mob-inp-amount-ferr") && !$("mob-inp-amount-ferr").classList.contains("folded") && /Enter an amount above zero/.test($("mob-inp-amount-ferr").textContent), "#4 an empty amount shows under the field");
    ok(toastEl().style.display !== "block", "#4 …and no toast");
    E(`const _i = document.getElementById("mob-inp-amount"); _i.value = "5"; _i.dispatchEvent(new Event("input", { bubbles: true }));`);
    ok($("mob-inp-amount-ferr").classList.contains("folded"), "#4 the note folds away when the field changes");
    E(`document.getElementById("mob-inp-amount").value = ""; mobileAddTransaction();`);
    E(`closeSheets()`); await sleep(30);
    E(`vpSyncLock()`);
    ok($("mob-inp-amount-ferr").classList.contains("folded"), "#4 closing the tray clears its notes");
    let undone = 0;
    E(`window.__undone = 0; toastWithUndo("Transaction deleted", () => { window.__undone++; }, 8000)`);
    E(`document.getElementById("mob-inp-amount").value = ""; mobileAddTransaction();`);
    ok(toastEl().querySelector(".toast-undo"), "A5 a form slip leaves the Undo toast alone");
    E(`toastNudge("Tap Cancel to leave without saving")`);
    ok(/Tap Cancel/.test(toastText()) && toastEl().dataset.kind === "notice", "A5 Tap Cancel shows at once over an Undo");
    await sleep(1900);
    ok(toastEl().querySelector(".toast-undo") && /Transaction deleted/.test(toastText()), "A5 …then the Undo comes back");
    toastEl().querySelector(".toast-undo").click();
    ok(E(`__undone`) === 1, "A5 …and still works");
    E(`toast("Hello")`); toastEl().click();
    ok(toastEl().style.display === "none", "E1 tapping a toast closes it");
    // Edit transaction and Recurring use the same notes
    ok(/vFieldErr\("popup-amount", "Enter an amount above zero"\)/.test(html) && /vFieldErr\("recur-end", "The end date must be after the start date"\)/.test(html) && /vFieldErr\("account-new-name"/.test(html) && /vFieldErr\("new-year-input"/.test(html) && /vFieldErr\("aikey-" \+ providerId/.test(html), "#4 every form's checks go under the field");

    // A3 AI provider: the encryption link and the warning for any backup
    E(`setAIKey("gemini", "k"); nasLinked = true; openAIProviderSettings();`); await sleep(30);
    ok($("ai-enc-warning").classList.contains("vp-fold") && !$("ai-enc-warning").classList.contains("folded"), "A3/E4 the warning shows (it folds) with any backup, not only Drive");
    ok(!/⚠/.test($("ai-enc-warning").textContent) && /Turn on encryption/.test($("ai-enc-warning").textContent), "#5 no ⚠, and the link says what it does");
    E(`aiOpenEncryption()`); await sleep(30);
    ok(!$("enc-menu-popup").classList.contains("hidden") && $("ai-provider-popup").classList.contains("hidden"), "A3 Turn on encryption opens Settings → Encryption");
    E(`closeEncryptionMenu ? closeEncryptionMenu() : document.getElementById("enc-menu-popup").classList.add("hidden"); nasLinked = false; setAIKey("gemini", "");`); await sleep(20);

    // A4 Testing a key
    {
      const T = page({ fetch: () => new Promise(() => {}) });
      await sleep(400);
      T.E(`setAIKey("openai", "sk-test"); openAIProviderSettings();`); await sleep(20);
      T.E(`window.__btn = document.createElement("button"); __btn.textContent = "Test"; window.__p = testAIConnection("openai", __btn); 0`);
      ok(T.E(`__btn.disabled`) === true && T.E(`__btn.textContent`) === "Testing…", "A4 the Test button says Testing… and waits");
      ok(T.d.getElementById("toast").style.display !== "block", "A4 …with no toast");
      T.w.close();
      const U = page({ fetch: () => Promise.resolve({ ok: false, status: 429, json: async () => ({ error: { message: "You exceeded your current quota" } }), text: async () => "quota" }) });
      await sleep(400);
      U.E(`setAIKey("openai", "sk-test"); window.__btn = document.createElement("button"); __btn.textContent = "Test";`);
      await U.E(`testAIConnection("openai", __btn)`);
      const ut = U.d.getElementById("toast").textContent;
      ok(/platform\.openai\.com/.test(ut) && !/aistudio/.test(ut) || /didn't respond/.test(ut), "A4 a used-up quota names the provider's own site: " + ut);
      ok(U.E(`__btn.disabled`) === false && U.E(`__btn.textContent`) === "Test", "A4 the button comes back");
      U.w.close();
    }

    // E2 one toast when Drive connects
    ok(/_gdConnMsg = "Google Drive connected\. Your data replaced the Drive file"/.test(html) && /toast\(_gdConnMsg \|\| "Google Drive connected"\)/.test(html) && !/toast\("Drive file will be overwritten/.test(html), "E2 one toast when Drive connects");

    // ════ Home ranking ══════════════════════════════════════════════════════════════════════════
    const score = () => J(`(() => { const s = vhAutoScores(); return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { s: v.score, r: v.reason, n: v.news }])); })()`);
    const fresh = () => E(`autoLayout = { order: [], ranked: [], computedAt: 0, reasons: {}, shown: {}, cycle: 5, seen: {} }; homeLayout.pins = {};`);

    // H1 streak ended only after a streak
    E(SEED({ "2026-09": 300, "2026-10": -400 })); fresh();
    let s = score();
    ok(s.streak.r === "your saving streak ended" && s.streak.n, "H1 a positive September then a negative October: streak ended is news");
    E(`autoLayout.seen = { [${JSON.stringify(s.streak.n)}]: Date.now() }`);
    ok(!score().streak.n, "#9 news counts once: shown once, it isn't news again");
    E(SEED({ "2026-08": -300, "2026-09": -300, "2026-10": -400 })); fresh();
    ok(!score().streak.n, "H1 three negative months in a row: no streak ended (there was none)");

    // H2 records from completed months only
    E(SEED({ "2026-10": -1000 })); fresh();
    E(`__put("2026-11-10", 20000, "dep", "ing")`);
    s = score();
    ok(!s.records.n && s.records.r === null, "H2 a half-finished month can't claim a record: " + s.records.r);
    E(SEED({ "2026-10": 9000 })); fresh();
    ok(score().records.r === "last month was your best", "H2 a closed best month is news");

    // H3 / H4 This Month like-for-like
    {
      const M = page({ now: new Date("2026-11-01T09:00:00+10:00").getTime() });
      await sleep(400);
      M.E(SEED()); M.E(`autoLayout.cycle = 5`);
      M.E(`Object.values(data).forEach(fy => { fy.saved = fy.saved.filter(t => !t[0].startsWith("2026-11")); fy.removed = fy.removed.filter(t => !t[0].startsWith("2026-11")); }); __put("2026-11-01", 40, "wit", "ing");`);
      const ms = M.J(`vhAutoScores().month`);
      ok(!ms.news && ms.score <= 40 + 35, "H3 one withdrawal on the 1st: no 'negative so far' (" + ms.reason + ")");
      M.w.close();
    }
    E(SEED()); fresh();   // Eliot-like: typical month negative
    ok(E(`vhGoalRate(null)`) < 0, "(the vault's typical month is negative)");
    E(`__put("2026-11-17", 9000, "dep", "ing")`);
    ok(score().month.r === "ahead of a typical month so far", "H4 with a negative typical month, This Month's news still fires");
    // H7 / H8 season stays under what rotation reaches
    E(SEED()); fresh(); E(`autoLayout.shown = { month: 5, recent: 5 }; autoLayout.seen = {};`);
    s = score();
    const monthSeason = s.month.n ? 0 : s.month.s;
    ok(monthSeason <= 40, "H7 This Month's season is 40 or less: " + s.month.s);
    E(`autoLayout.seen = { ["recent:" + "2026-11-16"]: Date.now() }`);
    ok(score().recent.s <= 40, "H8 Recent Activity without news is 40 or less: " + score().recent.s);
    ok(score().journey.s > 40, "…a section rotation has lifted for 7 cycles ranks above both");

    // #9 routine isn't news: a usual withdrawal doesn't lift Drawdown, a big one does
    E(SEED()); fresh();
    ok(!score().drawdown.n, "#9 a routine withdrawal isn't news");
    E(`__put("2026-11-17", 3000, "wit", "ing")`);
    s = score();
    ok(s.drawdown.n && /bigger withdrawal than usual/.test(s.drawdown.r), "#9 a big one is: " + s.drawdown.r);

    // H5 reason words from the date
    E(`autoLayout.reasonAt = { drawdown: { text: "you withdrew", date: "2026-11-18" } }; autoLayout.reasons = { drawdown: "you withdrew today" };`);
    ok(E(`vhReasonText("drawdown")`) === "you withdrew today", "H5 today");
    P.tick(86400000);
    ok(E(`vhReasonText("drawdown")`) === "you withdrew yesterday", "H5 …read the next day says yesterday");
    P.setNow(NOW);

    // H10 Upcoming, H11 Goals
    E(SEED()); fresh();
    E(`recurRules = [{ id: 9, type: "deposit", amount: 50, freq: "monthly", startDate: "2026-01-19", nextDate: "2026-11-19", endDate: null, account: "ing" }]`);
    ok(/a recurring deposit is due tomorrow/.test(score().upcoming.r || ""), "H10 a rule due tomorrow lifts Upcoming: " + score().upcoming.r);
    E(`__put("2026-11-10", 50000, "dep", "ing"); goals = [{ id: "g1", name: "Trip", target: 10, deadline: null }]`);
    s = score();
    ok(s.goals.r === "you reached a goal", "H11 a goal reached is news: " + s.goals.r + " / " + E(`goalProgress(goals[0])`));
    E(`autoLayout.seen = { "goal:g1:reached": Date.now() }`);
    ok(!score().goals.n, "H11 …once");
    E(`goals = [{ id: "g2", name: "Car", target: 9e9, deadline: "2026-11-10" }]; autoLayout.seen = {};`);
    ok(score().goals.r === "a goal's deadline passed", "H11 a deadline missed is news");

    // H9 FX
    E(SEED()); fresh();
    E(`accounts.push({ id: "us", name: "Wise USD", color: "#7cc39a", currency: "USD" }); exchangeRates = { date: "2026-11-18", base: "AUD", rates: { USD: 0.65 } }; __put("2026-10-01", 5000, "dep", "us"); autoLayout.fxRates = { USD: 0.65 };`);
    ok(!score().fx.n && score().fx.s < 30 + 35, "H9 rates unchanged: FX isn't news");
    E(`exchangeRates = { date: "2026-11-19", base: "AUD", rates: { USD: 0.55 } }`);
    ok(score().fx.r === "exchange rates moved your total", "H9 rates moved the total: FX is news");
    E(`accounts = accounts.filter(a => a.id !== "us"); Object.values(data).forEach(fy => { fy.saved = fy.saved.filter(t => t[6] !== "us"); }); exchangeRates = { date: "2026-11-18", base: "AUD", rates: {} };`);

    // #9 first place moves, H12 stamping, H13 ties
    E(SEED()); fresh(); E(`autoLayout.cycle = 0; switchTab("home");`);
    const firsts = [];
    for (let i = 0; i < 8; i++) {
      P.tick(7 * 3600 * 1000);
      E(`vhMaybeReorder("test"); _frozenOrder = null; vhLayoutOrder(); renderHome();`);
      firsts.push(J(`_vhShowList`)[0]);
    }
    const changes = firsts.slice(1).filter((k, i) => k !== firsts[i]).length;
    ok(changes >= 6, "#9 the first place changes (almost) every cycle without fresh news: " + firsts.join(", "));
    ok(E(`autoLayout.stamped`) === E(`autoLayout.cycle`), "H12 what was drawn is stamped for this cycle");
    E(`homeLayout.pins = { currency: 3 }; _frozenOrder = null; autoLayout.stamped = 0; renderHome();`);
    ok(E(`autoLayout.shown.currency`) !== E(`autoLayout.cycle`), "H12 a picked section that hid itself isn't stamped");
    E(`homeLayout.pins = {}; _frozenOrder = null;`);
    // H13: two quiet sections with the same score: the one unseen longer wins
    E(`autoLayout.shown = Object.fromEntries(VH_SECTIONS.map(s => [s.key, autoLayout.cycle])); autoLayout.shown.journey = autoLayout.cycle - 1; autoLayout.shown.rhythm = autoLayout.cycle - 1; autoLayout.shown.overview = autoLayout.cycle - 2;`);
    const sc = score();
    ok(sc.overview.s > sc.journey.s || J(`(() => { vhComputeAutoOrder(); return autoLayout.ranked; })()`).indexOf("overview") < J(`autoLayout.ranked`).indexOf("rhythm"), "H13 ties go to the section unseen longer");

    // H6 coming back on screen re-ranks once 6 hours have passed
    E(`autoLayout.computedAt = Date.now(); window.__cyc = autoLayout.cycle;`);
    P.tick(3600 * 1000); d.dispatchEvent(new P.w.Event("visibilitychange"));
    ok(E(`autoLayout.cycle`) === E(`__cyc`), "H6 back after an hour: no new ranking");
    P.tick(6 * 3600 * 1000); d.dispatchEvent(new P.w.Event("visibilitychange"));
    ok(E(`autoLayout.cycle`) === E(`__cyc`) + 1, "H6 back after 6 hours: a new ranking, before Home redraws");
    E(`window.__cyc = autoLayout.cycle; openAccountsModal();`); await sleep(20);
    P.tick(7 * 3600 * 1000); d.dispatchEvent(new P.w.Event("visibilitychange"));
    ok(E(`autoLayout.cycle`) === E(`__cyc`), "H6 never under an open tray");
    E(`closeAccountsModal()`); await sleep(20);

    // Seen news merges across devices (a union)
    E(`autoLayout.seen = { "a": Date.now() }`);
    E(`mergeAutoLayout({ order: [], computedAt: 1, seen: { "b": Date.now() } })`);
    ok(E(`!!autoLayout.seen.a && !!autoLayout.seen.b`), "#9 seen news from another device is kept too (older layout)");
    E(`mergeAutoLayout({ order: ["goals"], ranked: [], computedAt: Date.now() + 5, seen: { "c": Date.now() }, cycle: 99 })`);
    ok(E(`!!autoLayout.seen.a && !!autoLayout.seen.b && !!autoLayout.seen.c && autoLayout.cycle === 99`), "#9 …and when the other device's layout wins");
    E(`mergeAutoLayout({ order: ["goals"], computedAt: Date.now() + 9, reasons: { goals: 5 }, reasonAt: { goals: { text: 1 } }, shown: { goals: "x" }, seen: "nope" })`);
    ok(J(`autoLayout.reasons`).goals === undefined && J(`autoLayout.reasonAt`).goals === undefined && J(`autoLayout.shown`).goals === undefined, "#9 a bad layout from a backup is cleaned");

    // ── version ────────────────────────────────────────────────────────────────────────────
    const vf = $("version-footer").textContent.trim();
    const v = (vf.match(/^v(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
    ok(v.length === 3 && (v[0] > 7 || (v[0] === 7 && (v[1] > 3 || (v[1] === 3 && v[2] >= 1)))) && html.includes(`Version ${vf}<`), "version v7.3.1 or later, About matches: " + vf);
  } catch (e) { fail++; console.log("FAIL (threw):", e.stack.split("\n").slice(0, 3).join(" | ")); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => { fail++; console.log("PAGE ERROR:", e); });
  console.log(`v7.3.1: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 300);
