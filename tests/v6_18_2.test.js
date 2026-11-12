// v6.18.2 regression tests (11 Nov 2026): Edit transaction's Type is a heading (like Account
// and Date) with the three buttons under it; "Save changes to" follows the same layout.
// Also checks v6.18.1's one-dim rule for a stack of three trays (Settings › Encryption › Remove
// encryption?), which Eliot's 21:17 video showed going darker during a move.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v6_18_2.test.js
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
const settle = () => sleep(460);

setTimeout(async () => {
  try {
    E(SEED); E("render()");
    $("welcome-modal")?.classList.add("hidden");
    await sleep(0);
    const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");

    // ── Type: a heading, then the three buttons ─────────────────────────────
    const row = $("popup-type-row");
    ok(row.classList.contains("tx-popup-field"), "Type is a field like Account and Date");
    const lab = row.querySelector(":scope > label");
    ok(lab && lab.textContent === "Type", "…with Type as its heading");
    const seg = row.querySelector(":scope > .popup-seg");
    ok(seg && [...seg.children].map(b => b.textContent).join("|") === "Deposit|Interest|Withdrawal", "…and only the three buttons in the row under it");
    ok(!row.querySelector(".popup-scope-label"), "Type isn't a segment inside the row any more");
    ok(seg.getAttribute("role") === "group" && seg.getAttribute("aria-labelledby") === lab.id, "the buttons are labelled by the heading");
    ok(/\.popup-seg \{ display: flex; background: var\(--bg3\); border: 1px solid var\(--border\); border-radius: var\(--radius\); overflow: hidden; \}/.test(css), "the row keeps the segmented look");
    ok(/\.popup-seg \.popup-scope-btn \{ height: 40px; font-size: 13px; \}/.test(css), "…with taller buttons now they have the row to themselves");
    ok(/#popup-type-row \.popup-scope-btn\.active\[data-ptype="withdraw"\] \{ background: var\(--out\);/.test(css), "the chosen type is still coloured by type");
    // Save changes to: the same layout
    const sc = $("popup-scope-row");
    ok(sc.classList.contains("tx-popup-field") && sc.querySelector(":scope > label").textContent === "Save changes to", "Save's This only / All in series has the same heading layout");
    ok([...sc.querySelectorAll(".popup-seg > .popup-scope-btn")].map(b => b.textContent).join("|") === "This only|All in series", "…with its two buttons under it");

    // Behaviour is unchanged
    const one = E(`Object.values(data).flatMap(y => [...y.saved, ...y.removed]).find(t => !t[5])`);
    E(`openPopupById(${JSON.stringify(one[2])})`); await sleep(0);
    ok(row.style.display === "" && sc.style.display === "none", "a one-off transaction shows Type, not Save changes to");
    d.querySelector('#popup-type-row [data-ptype="interest"]').click(); await sleep(0);
    ok(d.querySelector('#popup-type-row [data-ptype="interest"]').classList.contains("active") &&
       d.querySelectorAll("#popup-type-row .popup-scope-btn.active").length === 1, "tapping a type picks it");
    E(`closePopup()`); await settle();
    const rec = E(`Object.values(data).flatMap(y => [...y.saved, ...y.removed]).find(t => String(t[5]) === "111")`);
    E(`openPopupById(${JSON.stringify(rec[2])})`); await sleep(0);
    ok(row.style.display === "none" && sc.style.display === "", "a recurring transaction hides Type (with its heading) and shows Save changes to");
    E(`closePopup()`); await settle();

    // ── One dim for a stack of three ────────────────────────────────────────
    const bg = id => $(id).style.getPropertyValue("background-color") || "";
    E(`openSettingsPage()`); await settle();
    E(`openEncryptionMenu()`); await settle();
    ok(bg("enc-menu-popup") === "transparent" && !bg("settings-popup"), "Settings › Encryption: Settings dims the page, Encryption doesn't add its own");
    E(`void confirmDisableEnc()`); await settle();
    ok(!bg("settings-popup") && bg("enc-menu-popup") === "transparent" && bg("del-popup") === "transparent", "› Remove encryption?: still only Settings' dim (Encryption's came back before, making it darker)");
    ok($("vp-dim").style.display === "none", "…and the move's own dim isn't left on");
    E(`delCancel()`); await settle();
    ok(!bg("settings-popup") && bg("enc-menu-popup") === "transparent", "back on Encryption: one dim");

    const ver = t => (t.match(/v(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
    const tx = el => (el && el.textContent || "").trim();
    const a = ver(tx($("about-version-meta"))), f = ver(tx($("version-footer")));
    const atLeast = (v, x) => v[0] !== x[0] ? v[0] > x[0] : v[1] !== x[1] ? v[1] > x[1] : v[2] >= x[2];
    ok(atLeast(a, [6, 18, 2]), "version is v6.18.2 or later");
    ok(a.join(".") === f.join("."), "About and footer show the same version");
  } catch (e) { ok(false, "threw: " + (e && e.stack || e)); }

  ok(errors.length === 0, "no page errors: " + errors.slice(0, 3).join(" | "));
  console.log(`v6.18.2: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 1500);
