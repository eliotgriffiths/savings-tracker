// v6.18.0 regression tests (11 Nov 2026, confirm-sweep-2026-11-11.md §3): one delete tray for
// every delete and disconnect. The ways to delete are option cards; nothing is chosen until one
// is tapped, which only highlights it; only the red button does it; closing cancels.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_18_0.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "fixtures", "sample-vault.js"), "utf8");
const FIXED = new Date("2026-11-11T07:30:00+10:00").getTime();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dom = new JSDOM(html, {
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
  },
});
const w = dom.window, d = w.document;
const E = s => w.eval(s);
const $ = id => d.getElementById(id);
const delOpen = () => E(`popupIsOpen(document.getElementById("del-popup"))`);
const opts = () => [...d.querySelectorAll("#del-opts .del-opt")];
const okBtn = () => $("del-ok");
const toastText = () => ($("toast")?.textContent || "").trim();
const allTx = () => E(`Object.values(data).flatMap(y => [...y.saved, ...y.removed])`);
const settle = () => sleep(420);

setTimeout(async () => {
  try {
    E(SEED); E("render()");
    $("welcome-modal")?.classList.add("hidden");
    await sleep(0);
    const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");

    // ── The tray itself ─────────────────────────────────────────────────────────
    ok(!$("recur-delete-popup") && !$("account-delete-popup"), "the old Remove recurring rule? and Delete account? popups are gone");
    ok(!$("popup-delete-menu"), "Edit transaction's instant-delete menu is gone");
    ok($("del-popup").classList.contains("vp") && !$("del-popup").classList.contains("vp-alert"), "the delete tray is a tray (a card on a wide screen), never an alert");
    ok($("del-popup").querySelector(".vp-head .vp-title") && $("del-popup").querySelector(".vp-head .modal-close"), "…with a head: title and ✕");
    ok($("del-foot").classList.contains("vp-foot"), "…and Delete + Cancel pinned at the foot");
    ok(/\.del-opt \{[^}]*border: 1px solid color-mix\(in srgb, var\(--out\) 30%, transparent\)/.test(css), "options are separate cards with a faint red edge");
    ok(/\.del-opt\[aria-checked="true"\] \{ border-color: var\(--accent\);/.test(css), "a chosen card's edge turns gold (replacing the red, not inside it)");
    ok(!/\.del-opt[^{]*\{[^}]*box-shadow: inset/.test(css), "…no inset edge inside the red one");
    ok(/\.pbtn:disabled \{ opacity: 0\.38;/.test(css), "Delete looks disabled until something is chosen");

    // Generic behaviour
    let p = E(`vaultDelete({ title: "Delete thing?", sub: "Sub", lead: "Lead", options: [{ value: "a", title: "A", sub: "a" }, { value: "b", title: "B" }] })`);
    await sleep(0);
    ok(delOpen() && $("del-title").textContent === "Delete thing?" && $("del-sub").textContent === "Sub" && $("del-lead").textContent === "Lead", "it opens with the title, subtitle and lead");
    ok(opts().length === 2 && opts().every(b => b.getAttribute("aria-checked") === "false"), "nothing is preselected");
    ok(okBtn().disabled, "Delete is disabled until an option is chosen");
    let got = "pending"; p.then(v => { got = v; });
    opts()[1].click(); await sleep(0);
    ok(opts()[1].getAttribute("aria-checked") === "true" && opts()[0].getAttribute("aria-checked") === "false", "tapping an option only highlights it");
    ok(got === "pending" && delOpen(), "…it doesn't delete");
    opts()[0].click(); await sleep(0);
    ok(opts()[0].getAttribute("aria-checked") === "true" && opts()[1].getAttribute("aria-checked") === "false", "tapping another moves the highlight");
    okBtn().click(); await sleep(10);
    ok(got === "a", "Delete does the chosen one");
    ok(!delOpen(), "…and the tray goes");
    await settle();
    // Cancel / ✕ / outside / Back all cancel
    for (const [how, act] of [["Cancel", () => d.querySelector("#del-foot .pbtn-secondary").click()],
                              ["✕", () => $("del-popup").querySelector(".modal-close").click()],
                              ["an outside tap", () => $("del-popup").dispatchEvent(new w.MouseEvent("click", { bubbles: true }))],
                              ["Back / Escape", () => E(`dismissPopup(document.getElementById("del-popup"))`)]]) {
      let r = "pending";
      E(`vaultDelete({ title: "X?", options: [{ value: "a", title: "A" }, { value: "b", title: "B" }] })`).then(v => { r = v; });
      await sleep(0); opts()[0].click(); act(); await sleep(10);
      ok(r === null && !delOpen(), `${how} cancels, even with an option chosen`);
      await settle();
    }
    // One way only: nothing to choose
    p = E(`vaultDelete({ title: "Delete one?", lead: "Only way.", options: [{ value: "only" }], ok: "Clear all data" })`); await sleep(0);
    ok($("del-opts").hidden && !okBtn().disabled && okBtn().textContent === "Clear all data", "with one way there's no list, the button is ready and can carry its own verb");
    got = "pending"; p.then(v => { got = v; }); okBtn().click(); await sleep(10);
    ok(got === "only", "…and it resolves that way");
    await settle();

    // ── Recurring › Delete ───────────────────────────────────────────────────
    E(`openRecurringModal()`); await settle();
    const ruleIdx = E(`recurRules.findIndex(r => r.id === 111)`);
    const nRule = allTx().filter(t => String(t[5]) === "111").length;
    E(`openRecurDeletePopup(${ruleIdx})`); await sleep(0);
    ok(delOpen() && $("del-title").textContent === "Delete recurring rule?", "Recurring › Delete opens the delete tray");
    ok($("del-popup")._vpParent === $("recurring-modal"), "…on top of Recurring, so ‹ and Cancel come back to it");
    ok(/Deposit · Weekly · /.test($("del-sub").textContent), "…naming the rule in the subtitle");
    ok(opts().length === 2 && /keep its transactions/.test(opts()[0].textContent) && new RegExp(`its ${nRule} transactions`).test(opts()[1].textContent), "two ways: keep its transactions, or delete them too (with the count)");
    ok(/Can't be undone/.test(opts()[1].textContent), "…the second says it can't be undone");
    opts()[0].click(); okBtn().click(); await sleep(10);
    ok(!E(`recurRules.some(r => r.id === 111)`) && E(`recurDeletedIds.has("111")`), "Delete removes the rule and tombstones it");
    ok(allTx().filter(t => String(t[5]) === "111").length === nRule, "…keeping its transactions");
    ok(E(`popupIsOpen(document.getElementById("recurring-modal"))`), "…and Recurring is still there under it");
    await settle();
    // Delete the other rule and its transactions
    const r2 = E(`recurRules.findIndex(r => r.id === 222)`);
    const n2 = allTx().filter(t => String(t[5]) === "222").length;
    const ids2 = allTx().filter(t => String(t[5]) === "222").map(t => t[2]);
    E(`openRecurDeletePopup(${r2})`); await sleep(0);
    opts()[1].click(); okBtn().click(); await sleep(10);
    ok(allTx().filter(t => String(t[5]) === "222").length === 0 && n2 > 0, "…or deletes the rule and every transaction it added");
    ok(ids2.every(id => E(`tombstones.has(${JSON.stringify(id)})`)), "…tombstoned, so a sync can't bring them back");
    ok(/Rule and \d+ transactions deleted/.test(toastText()), "…and says so");
    E(`closeRecurringModal()`); await settle();

    // ── Edit transaction › Delete ────────────────────────────────────────────
    E(SEED); E("render()"); await sleep(0);
    const recTx = allTx().find(t => String(t[5]) === "111");
    E(`openPopupById(${JSON.stringify(recTx[2])})`); await sleep(0);
    ok(E(`popupIsOpen(document.getElementById("tx-popup"))`), "Edit transaction opens");
    $("popup-delete-toggle").click(); await sleep(0);
    ok(delOpen() && $("del-title").textContent === "Delete transaction?", "its Delete opens the same delete tray");
    ok($("del-popup")._vpParent === $("tx-popup"), "…on top of Edit transaction");
    ok(opts().length === 4, "a recurring transaction has four ways");
    ok(/Delete this transaction/.test(opts()[0].textContent) && /undo/i.test(opts()[0].textContent), "…this one (you can undo it)");
    ok(/in this series/.test(opts()[1].textContent) && /Keeps the rule/.test(opts()[1].textContent), "…the series (keeps the rule)");
    ok(/keep its transactions/.test(opts()[2].textContent) && /Delete the rule and its \d+ transactions/.test(opts()[3].textContent), "…the rule, keeping or deleting its transactions");
    ok(okBtn().disabled, "…with nothing chosen");
    opts()[2].click(); okBtn().click(); await sleep(10);
    ok(!E(`recurRules.some(r => r.id === 111)`), "Delete the rule, keep its transactions: the rule goes");
    ok(E(`recurDeletedIds.has("111")`), "…and is tombstoned (Stop recurring rule used to skip that, so a sync brought it back)");
    ok(allTx().some(t => t[2] === recTx[2]), "…the transactions stay");
    ok(!E(`popupIsOpen(document.getElementById("tx-popup"))`) && !delOpen(), "…and Edit transaction closes with it");
    await settle();
    // A one-off transaction: one way, with Undo
    const one = allTx().find(t => !t[5] && t[0] === "2026-10-03");
    E(`openPopupById(${JSON.stringify(one[2])})`); await sleep(0);
    $("popup-delete-toggle").click(); await sleep(0);
    ok(delOpen() && $("del-opts").hidden && !okBtn().disabled, "a one-off transaction: nothing to choose, Delete is ready");
    ok(/undo/i.test($("del-lead").textContent) && /Deposit · 3 Oct 2026 · /.test($("del-sub").textContent), "…it names the transaction and says you can undo it");
    okBtn().click(); await sleep(10);
    ok(!allTx().some(t => t[2] === one[2]), "Delete removes it");
    ok(/Undo/.test(toastText()), "…with Undo, as before");
    d.querySelector("#toast .toast-undo")?.click(); await sleep(0);
    ok(allTx().some(t => t[0] === "2026-10-03" && t[1] === 500), "…and Undo puts it back");
    await settle();

    // ── Accounts › Delete ────────────────────────────────────────────────────
    E(SEED); E("render()"); await sleep(0);
    E(`openAccountsModal()`); await settle();
    const ingN = E(`countTxForAccount("ing")`), ubN = E(`countTxForAccount("ub")`);
    E(`openAccountDeletePopup("ing")`); await sleep(0);
    ok(delOpen() && $("del-title").textContent === "Delete account?" && new RegExp(`ING · ${ingN} transactions`).test($("del-sub").textContent), "Accounts › Delete opens the tray, naming the account and its count");
    ok(opts().length === 2 && /Move them to UBank/.test(opts()[0].textContent) && /Delete them with ING/.test(opts()[1].textContent), "one card per account to move them to, then delete them with it (no account picker)");
    opts()[0].click(); okBtn().click(); await sleep(10);
    ok(!E(`getAccountById("ing")`) && E(`countTxForAccount("ub")`) === ingN + ubN, "Move: the account goes and its transactions move");
    ok(E(`accountTombstones.has("ing")`), "…tombstoned");
    ok(E(`recurRules.find(r => r.id === 222).account`) === "ub", "…and its recurring rule moves too");
    await settle();
    E(`accounts.push({ id: "empty", name: "Savings", color: "#3d9e6e", currency: "AUD" }); saveAccounts(); renderAccountManagerList();`);
    E(`openAccountDeletePopup("empty")`); await sleep(0);
    ok(delOpen() && $("del-opts").hidden && /no transactions/.test($("del-lead").textContent), "an account with no transactions: nothing to choose");
    okBtn().click(); await sleep(10);
    ok(!E(`getAccountById("empty")`), "…Delete removes it");
    E(`closeAccountsModal()`); await settle();

    // ── Goals › × ───────────────────────────────────────────────────────────
    E(`goals = [{ id: "g1", name: "Trip", target: 6000, accountId: null }]; saveGoals();`);
    E(`openGoalsModal()`); await settle();
    d.querySelector("[data-goal-del]").click(); await sleep(0);
    ok(delOpen() && $("del-title").textContent === "Delete goal?" && /^Trip · \d+% of /.test($("del-sub").textContent), "Goals › × opens the delete tray (it was Delete/Cancel inside the row)");
    ok(!d.querySelector("[data-goal-del-yes]"), "…the row doesn't change into buttons any more");
    ok($("del-popup")._vpParent === $("goals-modal"), "…on top of Goals");
    d.querySelector("#del-foot .pbtn-secondary").click(); await sleep(10);
    ok(E(`goals.length`) === 1, "Cancel keeps the goal");
    await settle();
    d.querySelector("[data-goal-del]").click(); await sleep(0); okBtn().click(); await sleep(10);
    ok(E(`goals.length`) === 0 && E(`goalDeletedIds.has("g1")`), "Delete removes it (tombstoned)");
    E(`closeGoalsModal()`); await settle();

    // ── AI provider › Delete key ─────────────────────────────────────────────
    E(`setAIKey("gemini", "test-key-123")`);
    E(`openAIProviderSettings()`); await settle();
    ok(/askClearAIKey\('\$\{provider\.id\}'\)">Delete</.test(html), "the key's button says Delete and asks first");
    E(`askClearAIKey("gemini")`); await sleep(0);
    ok(delOpen() && $("del-title").textContent === "Delete API key?" && /Gemini/.test($("del-sub").textContent), "Delete key opens the delete tray (it used to delete at once)");
    $("del-popup").querySelector(".modal-close").click(); await sleep(10);
    ok(E(`getAIKey("gemini")`) === "test-key-123", "closing it keeps the key");
    await settle();
    E(`askClearAIKey("gemini")`); await sleep(0); okBtn().click(); await sleep(10);
    ok(!E(`getAIKey("gemini")`), "Delete removes it");
    E(`closeAIProviderSettings()`); await settle();

    // ── Save & backup › Clear all data, Disconnect ───────────────────────────
    const nBefore = allTx().length;
    let cleared = null; E(`clearBrowserData()`).then(() => { cleared = true; });
    await sleep(0);
    ok(delOpen() && $("del-title").textContent === "Clear all data?" && okBtn().textContent === "Clear all data", "Clear all data asks in the delete tray (it was an alert)");
    ok(!$("vault-confirm-popup") || !E(`popupIsOpen(document.getElementById("vault-confirm-popup"))`), "…not the centred alert");
    d.querySelector("#del-foot .pbtn-secondary").click(); await sleep(10);
    ok(allTx().length === nBefore, "Cancel clears nothing");
    await settle();
    ok(/onclick="askUnlink\('gd'\)">Disconne/.test(html) && /onclick="askUnlink\('nas'\)">Disconnect/.test(html) && /onclick="askUnlink\('local'\)">Unlink/.test(html), "the three Disconnect buttons ask first");
    ok(/if \(choice === "cancel"\) \{ unlinkGoogleDrive\(\);/.test(html), "…while a cancelled connection still disconnects without asking");
    for (const [kind, fn, title] of [["gd", "unlinkGoogleDrive", "Disconnect Google Drive?"], ["nas", "unlinkNAS", "Disconnect the network location?"], ["local", "unlinkLocalFile", "Disconnect the local file?"]]) {
      E(`window.__unl = 0; ${fn} = () => { window.__unl++; };`);
      E(`askUnlink("${kind}")`); await sleep(0);
      ok(delOpen() && $("del-title").textContent === title && okBtn().textContent === "Disconnect" && /stays in the app/.test($("del-lead").textContent), `${title} explains nothing is lost`);
      d.querySelector("#del-foot .pbtn-secondary").click(); await sleep(10);
      ok(E(`window.__unl`) === 0, "…Cancel keeps it connected");
      await settle();
      E(`askUnlink("${kind}")`); await sleep(0); okBtn().click(); await sleep(10);
      ok(E(`window.__unl`) === 1, "…Disconnect disconnects");
      await settle();
    }

    // Version
    const ver = t => (t.match(/v(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
    const tx = el => (el && el.textContent || "").trim();
    const a = ver(tx($("about-version-meta"))), f = ver(tx($("version-footer")));
    const atLeast = (v, x) => v[0] !== x[0] ? v[0] > x[0] : v[1] !== x[1] ? v[1] > x[1] : v[2] >= x[2];
    ok(atLeast(a, [6, 18, 0]), "version is v6.18.0 or later");
    ok(a.join(".") === f.join("."), "About and footer show the same version");
  } catch (e) { ok(false, "threw: " + (e && e.stack || e)); }

  ok(errors.length === 0, "no page errors: " + errors.slice(0, 3).join(" | "));
  console.log(`v6.18.0: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 1500);
