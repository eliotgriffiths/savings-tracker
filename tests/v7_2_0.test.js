// v7.2.0 regression tests: the Charts screen. One chart from Vault's transactions; presets
// (built in, and yours: synced with their own ts, deletes tombstoned); one Customise tray; the
// readout and legend; Print as set up; the library embedded and credited.
// jsdom has no canvas, so this checks the model and the trays; the drawing is checked in Chrome.
// Run from the repo root: npm install jsdom && TZ=Australia/Brisbane node tests/v7_2_0.test.js
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const FIXTURE = fs.readFileSync(path.join(__dirname, "export", "fixture.js"), "utf8");
const NOW = new Date("2026-11-16T08:30:00+10:00").getTime();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://vaultsavings.app/", virtualConsole: vc,
  beforeParse(w) {
    const RD = w.Date;
    class MD extends RD { constructor(...a) { if (!a.length) super(NOW); else super(...a); } static now() { return NOW; } }
    MD.UTC = RD.UTC; MD.parse = RD.parse; w.Date = MD;
    w.fetch = () => Promise.reject(new Error("offline (test)"));
    w.confirm = w.alert = w.prompt = () => { throw new Error("native dialog used"); };
    w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(w, "innerWidth", { value: 390, configurable: true, writable: true });
  },
});
const w = dom.window, d = w.document;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const E = s => w.eval(s);
const J = s => JSON.parse(E(`JSON.stringify(${s})`));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = id => d.getElementById(id);
const isOpen = id => { const el = $(id); return !!el && !el.classList.contains("hidden"); };
const txt = id => ($(id)?.textContent || "").replace(/\s+/g, " ").trim();
const near = (a, b) => Math.abs(a - b) < 0.005;

setTimeout(async () => {
  try {
    E(FIXTURE);
    E(`goals = [{ id: "g1", name: "House deposit", target: 2000000, accountId: null, deadline: "2028-06-30", ts: 1 },
                { id: "g2", name: "ING buffer", target: 1500000, accountId: "ing", deadline: null, ts: 1 }];
       localStorage.removeItem("vault_chart_view"); loadChartPresets();
       _dataVersion++; _invalidateYearCache(); document.getElementById("welcome-modal")?.classList.add("hidden");
       window.__toasts = []; toast = (m, k) => { window.__toasts.push(m); }; window.__syncs = 0; triggerCloudSync = () => { window.__syncs++; };`);

    // ── the library and its credit ─────────────────────────────────────────────────────────
    ok(E(`typeof LightweightCharts === "object" && typeof LightweightCharts.createChart === "function"`), "Lightweight Charts is embedded (works offline)");
    ok(/TradingView Lightweight Charts™ v4\.2\.3[\s\S]*Apache License 2\.0/.test(html), "its licence header is kept");
    ok(html.indexOf("<!-- Lightweight Charts") > html.indexOf("<!-- SheetJS") && html.indexOf("<!-- Lightweight Charts") > html.indexOf("navInit();\n</script>"), "it loads after the app and SheetJS, not in <head>");
    ok(/Charts:<\/strong> drawn with <a href="https:\/\/www\.tradingview\.com\/lightweight-charts\/"[\s\S]*?tradingview\.com<\/a>\), released under the Apache 2\.0 licence/.test(html), "About credits it with a link to tradingview.com");
    ok(!$("chart-net-monthly") && !$("charts-acct-row") && E(`typeof buildLineChart`) === "undefined", "the old four SVG charts are gone");

    // ── the screen ─────────────────────────────────────────────────────────────────────────
    E(`switchTab("charts")`); await sleep(20);
    ok(txt("ch-preset-name") === "Balance" && $("ch-preset-dot").hidden, "starts on the Balance preset, unchanged");
    ok(/Customise/.test(txt("ch-cust-btn")), "a Customise button beside it");
    ok($("ch-strip").classList.contains("folded"), "no changed strip");
    ok(J(`[...document.querySelectorAll("#ch-ranges button")].map(b => b.textContent)`).join() === "3M,6M,YTD,1Y,2Y,All", "ranges (calendar years: YTD)");
    ok(d.querySelector('#ch-ranges [data-ch-range="all"]').classList.contains("on"), "All chosen");
    ok(/This browser can't draw charts/.test(txt("ch-chart")), "no canvas here: it says so instead of breaking");
    // the model
    const total = E(`vhAllTx().reduce((s, t) => s + (t.kind === "wit" ? -1 : 1) * convertToGlobal(t.amt, t.cur), 0)`);
    const B = J(`chModelNow.buckets`);
    ok(B[0].time === "2025-01-01" && B[B.length - 1].time === "2026-11-01", "monthly buckets from the first transaction to now: " + B[0].time + " … " + B[B.length - 1].time);
    ok(near(B[B.length - 1].close, total), `the last balance is the vault's net: ${B[B.length - 1].close} vs ${total}`);
    ok(J(`chModelNow.buckets.find(b => b.time === "2025-06-01")`).int === 7.5, "interest kept apart");
    ok(J(`chModelNow.buckets.find(b => b.time === "2026-10-01")`).wit === 99999.99, "withdrawals counted");
    ok(/^November 2026 · latest/.test(txt("ch-readout")) && txt("ch-readout").includes(E(`aud(${total})`)), "readout: the latest month and balance: " + txt("ch-readout"));
    ok(/^Balance · All accounts · Monthly · Area/.test(txt("ch-legend")), "legend says what's shown: " + txt("ch-legend"));
    ok(/House deposit/.test(txt("ch-legend")) && !/ING buffer/.test(txt("ch-legend")), "whole-vault goals on All accounts, not an account's");
    // readout follows the crosshair
    E(`chReadout("2025-06-01")`);
    ok(/^June 2025/.test(txt("ch-readout")) && !/latest/.test(txt("ch-readout")), "readout under the finger: " + txt("ch-readout"));

    // ── Customise: one tray ────────────────────────────────────────────────────────────────
    E(`openChartCustomise()`); await sleep(20);
    ok(isOpen("chart-custom-popup") && $("chart-custom-popup").classList.contains("vp"), "Customise opens as a tray");
    ok(txt("chc-sub") === "Preset: Balance" && $("chc-save").disabled, "subtitle names the preset; Save as preset off until something changes");
    // v7.2.1: the tray became three tabs (Chart · Lines · Display); the same controls, grouped
    const secs = J(`[...document.querySelectorAll("#chc-body .ch-sec, #chc-body .chc-lab")].map(s => s.childNodes[0].textContent)`);
    ok(/^(What to chart\|Accounts\|Each point covers\|Chart type\|Lines on top\|Display|Show\|Accounts\|Each point\|Type)$/.test(secs.join("|")), "sections: " + secs.join("|"));
    ok(J(`[...document.querySelectorAll("#chc-types .ch-pill, #chc-types .chc-tile")].map(b => b.textContent)`).join() === "Area,Line,Steps,Candles", "Balance's chart types");
    ok($("chc-f-band").classList.contains("folded") && !$("chc-f-proj").classList.contains("folded"), "Balance: Projection shown, Typical range folded away");
    ok(!$("chc-f-goals").classList.contains("folded") && /House deposit/.test(txt("chc-goals-sub")), "Goals switch lists the goals");
    ok($("chc-f-ma").classList.contains("folded"), "Average's options folded while it's off");
    const click = sel => d.querySelector(sel).click();
    click('#chc-body [data-ch-sw="ma"]');
    ok(E(`chCfg.ma.on`) && !$("chc-f-ma").classList.contains("folded"), "Average on: its options unfold");
    ok(J(`[...document.querySelectorAll("#chc-ma-n .ch-pill, #chc-ma-n button")].map(b => b.textContent)`).join() === "3 months,6 months,12 months", "average lengths in the chart's unit");
    ok(txt("ch-preset-name") === "Balance" && !$("ch-preset-dot").hidden && !$("ch-strip").classList.contains("folded"), "the page shows it's changed (dot and strip)");
    ok(txt("chc-sub") === "Changed from Balance" && !$("chc-save").disabled, "the tray too, and Save as preset is ready");
    ok(J(`chModelNow.layers.map(l => l.id)`).join() === "ma", "the average is drawn");
    click('#chc-body [data-chc-int="week"]');
    ok(J(`[...document.querySelectorAll("#chc-ma-n .ch-pill, #chc-ma-n button")].map(b => b.textContent)`)[0] === "3 weeks", "…and follows the interval");
    ok(J(`chModelNow.buckets`).every(b => new Date(b.time + "T00:00").getDay() === 1), "weeks start on Monday");
    click('#chc-body [data-chc-int="month"]');
    click('#chc-body [data-ch-sw="trend"]'); click('#chc-body [data-ch-sw="proj"]'); click('#chc-body [data-ch-sw="cmpLastYear"]');
    ok(J(`chModelNow.layers.map(l => l.id)`).join() === "ma,trend,proj,ly", "trend, projection and last year added: " + J(`chModelNow.layers.map(l => l.id)`).join());
    const pr = J(`chModelNow.proj`);
    ok(pr.goal && pr.goal.name === "House deposit", "projection heads for the next goal");
    ok(near(pr.rate, E(`vhGoalRate(null)`) || 0), "at Home's own rate (vhGoalRate)");
    ok(/Trend, (up|down) /.test(txt("ch-legend")) && /Projection/.test(txt("ch-legend")) && /Same time last year/.test(txt("ch-legend")), "the legend keys every line: " + txt("ch-legend"));
    // switch plot: options that don't apply fold away; the type is valid for it
    click('#chc-body [data-chc-plot="net"]');
    ok(E(`chCfg.type`) === "columns" && J(`[...document.querySelectorAll("#chc-types .ch-pill, #chc-types .chc-tile")].map(b => b.textContent)`).join() === "Columns,Line", "Net saved: Columns or Line");
    ok($("chc-f-proj").classList.contains("folded") && !$("chc-f-band").classList.contains("folded") && $("chc-f-goals").classList.contains("folded") && $("chc-f-log").classList.contains("folded"), "Net saved: Typical range instead of Projection; no Goals or Log scale");
    click('#chc-body [data-ch-sw="band"]');
    ok(J(`chModelNow.lines.map(l => l.title)`).join() === "Typical low,Typical,Typical high", "typical range lines");
    ok(/Typical month: /.test(txt("ch-legend")), "…in the legend");
    click('#chc-body [data-chc-plot="inout"]');
    ok(/Deposits.*Interest.*Withdrawals/.test(txt("ch-legend")), "In and out keys its three colours");
    // accounts
    click('#chc-body [data-chc-plot="balance"]');
    click('#chc-body [data-chc-acct="ing"]');
    ok(E(`chCfg.account`) === "ing" && $("chc-f-cmp").classList.contains("folded"), "one account: no 'each account' switch");
    const ingNet = E(`vhAllTx().filter(t => t.accId === "ing").reduce((s, t) => s + (t.kind === "wit" ? -1 : 1) * convertToGlobal(t.amt, t.cur), 0)`);
    ok(near(J(`chModelNow.buckets`).slice(-1)[0].close, ingNet), "the balance is that account's");
    ok(/ING buffer/.test(txt("ch-legend")) && !/House deposit/.test(txt("ch-legend")), "and its own goal");
    click('#chc-body [data-chc-acct="all"]'); click('#chc-body [data-ch-sw="cmpAccounts"]');
    ok(J(`chModelNow.layers.filter(l => l.id.startsWith("acc-")).length`) === 4, "each account as its own line");
    // year buckets follow Vault's year
    click('#chc-body [data-chc-int="year"]');
    ok(J(`chModelNow.buckets.map(b => b.time)`).join() === "2025-01-01,2026-01-01", "calendar years");
    E(`yearMode = "financial"; fyStartMonth = 7; fyStartDay = 1; renderCharts(); chcSync(true);`);
    ok(J(`chModelNow.buckets.map(b => b.time)`).join() === "2024-07-01,2025-07-01,2026-07-01", "financial years when Vault is in FY mode");
    ok(E(`chPeriodLabel("2025-07-01", "year")`) === "FY 2025-26", "labelled as Vault labels them");
    ok(J(`[...document.querySelectorAll("#ch-ranges button")].map(b => b.textContent)`)[2] === "FYTD", "FYTD range in FY mode");
    E(`chCfg.interval = "quarter"; renderCharts();`);
    ok(J(`chModelNow.buckets.map(b => b.time)`).includes("2025-07-01") && J(`chModelNow.buckets.map(b => b.time)`).includes("2025-10-01"), "quarters of the financial year");
    E(`yearMode = "calendar"; chCfg.interval = "month"; renderCharts(); chcSync(true);`);

    // ── Presets ────────────────────────────────────────────────────────────────────────────
    E(`closeChartCustomise(); openChartPresets();`); await sleep(20);
    ok(isOpen("chart-presets-popup"), "Presets opens");
    const items = J(`[...document.querySelectorAll("#chp-body .ch-pitem b")].map(b => b.textContent.trim())`);
    ok(items.join() === "Balance,Net saved,In and out,Year by year", "built in: " + items.join());
    ok(/None yet/.test(txt("chp-body")) && /Undo them/.test(txt("chp-body")), "none of yours yet; changes can be undone from here");
    ok(!$("chp-update") && !$("chp-del"), "a built-in preset can't be updated or deleted");
    E(`document.getElementById("chp-save").click()`);
    ok(/Give it a name/.test(txt("chp-name-err")) && E(`chPresets.length`) === 0, "a name is needed");
    E(`document.getElementById("chp-name").value = "balance"; document.getElementById("chp-save").click()`);
    ok(/already have a preset called that/.test(txt("chp-name-err")), "names don't clash");
    E(`document.getElementById("chp-name").value = "Everything on"; document.getElementById("chp-save").click()`); await sleep(20);
    ok(E(`chPresets.length`) === 1 && E(`chPresets[0].name`) === "Everything on" && E(`chPresets[0].ts`) === NOW, "saved, with its own time");
    ok(!isOpen("chart-presets-popup") && E(`__toasts.slice(-1)[0]`) === "Saved “Everything on”", "closes, then the toast");
    ok(txt("ch-preset-name") === "Everything on" && $("ch-preset-dot").hidden, "the chart is on it now, unchanged");
    ok(E(`__syncs`) >= 1, "it syncs");
    ok(E(`vsIsSealed("vault_chart_presets")`) && JSON.parse(E(`vsGet("vault_chart_presets")`))[0].name === "Everything on", "kept with the encrypted data (VS_SEALED)");
    // change it, update it
    E(`chCfg.zero = true; renderCharts(); openChartPresets();`);
    ok($("chp-update") && $("chp-del"), "yours can be updated and deleted");
    E(`document.getElementById("chp-update").click()`); await sleep(20);
    ok(E(`chPresets[0].cfg.zero`) === true && E(`__toasts.slice(-1)[0]`) === "Preset saved", "update saves the changes");
    // switch presets
    E(`openChartPresets()`); E(`document.querySelector('[data-chp-pick="b-net"]').click()`); await sleep(20);
    ok(E(`chCurrentId`) === "b-net" && E(`chCfg.plot`) === "net" && txt("ch-preset-name") === "Net saved" && !isOpen("chart-presets-popup"), "tapping a preset switches the whole setup");
    ok(E(`chCfg.range`) === "1y" && E(`chCfg.ma.on`) === true, "with its range and lines");
    // the view is remembered on this device
    ok(JSON.parse(E(`localStorage.getItem("vault_chart_view")`)).id === "b-net", "the chart you're on is remembered here");
    E(`chCurrentId = "x"; chCfg = chBase(); loadChartPresets();`);
    ok(E(`chCurrentId`) === "b-net" && E(`chCfg.plot`) === "net", "…and comes back after a restart");
    // Customise › Save as preset opens Presets over it
    E(`chCfg.grid = false; renderCharts(); openChartCustomise(); document.getElementById("chc-save").click();`); await sleep(30);
    ok(isOpen("chart-presets-popup") && isOpen("chart-custom-popup"), "Customise › Save as preset opens Presets over it");
    E(`document.getElementById("chp-name").value = "No grid"; document.getElementById("chp-save").click()`); await sleep(30);
    ok(!isOpen("chart-presets-popup") && !isOpen("chart-custom-popup") && E(`chPresets.length`) === 2, "saving closes both");
    // delete (through the delete tray)
    E(`openChartPresets(); document.getElementById("chp-del").click();`); await sleep(20);
    ok(isOpen("del-popup") && txt("del-title") === "Delete preset?" && /No grid/.test(txt("del-sub")), "delete asks in the delete tray: " + txt("del-sub"));
    $("del-ok").click(); await sleep(30);
    ok(E(`chPresets.map(p => p.name).join()`) === "Everything on" && E(`chPresetsDeleted.size`) === 1, "deleted, and tombstoned");
    ok(E(`chCurrentId`) === "b-balance" && E(`chCfg.grid`) === false, "the chart stays as it was, now changed from Balance");
    ok(E(`__toasts.slice(-1)[0]`) === "Deleted “No grid”", "toast");
    E(`closeChartPresets()`);

    // ── sync ───────────────────────────────────────────────────────────────────────────────
    const pay = J(`buildWrappedPayload()`);
    ok(Array.isArray(pay._chartPresets) && pay._chartPresets[0].name === "Everything on" && pay._chartPresetsDeleted.length === 1, "presets and tombstones travel in the backup");
    const un = J(`unwrapPayload(buildWrappedPayload())`);
    ok(un.chartPresets.length === 1 && un.chartPresetsDeleted.length === 1, "and are read back out of it");
    const mineId = E(`chPresets[0].id`), deadId = E(`[...chPresetsDeleted][0]`);
    E(`mergeChartPresets([{ id: "${mineId}", name: "Older name", cfg: { plot: "net" }, ts: 5 },
                         { id: "${deadId}", name: "Back from the dead", cfg: {}, ts: ${NOW + 9e6} },
                         { id: "uother1", name: "From the PC", cfg: { plot: "dep", type: "columns", interval: "quarter" }, ts: 10 },
                         { id: "bad id!", name: "x", cfg: {}, ts: 1 }, { id: "unoname", name: "  ", cfg: {}, ts: 1 }], ["ugone"]);`);
    ok(E(`chPresets.find(p => p.id === "${mineId}").name`) === "Everything on", "an older copy doesn't overwrite a newer one");
    ok(!E(`chPresets.some(p => p.id === "${deadId}")`), "a tombstoned preset doesn't come back, however new the copy");
    ok(E(`chPresets.find(p => p.id === "uother1").cfg.interval`) === "quarter", "one made on another device arrives");
    ok(!E(`chPresets.some(p => p.id === "bad id!" || p.id === "unoname")`), "malformed ones are dropped");
    ok(E(`chPresetsDeleted.has("ugone")`), "remote tombstones are kept");
    E(`mergeChartPresets([{ id: "uother1", name: "From the PC, renamed", cfg: { plot: "dep", type: "bogus", range: "9y", ma: { on: 1, n: 7 } }, ts: 20 }], null)`);
    ok(E(`chPresets.find(p => p.id === "uother1").name`) === "From the PC, renamed", "a newer copy wins");
    ok(J(`chPresets.find(p => p.id === "uother1").cfg`).type === "columns" && J(`chPresets.find(p => p.id === "uother1").cfg`).range === "all" && J(`chPresets.find(p => p.id === "uother1").cfg`).ma.n === 3, "bad settings in it fall back to the defaults");
    E(`chCurrentId = "uother1"; mergeChartPresets(null, ["uother1"]);`);
    ok(E(`chCurrent().id`) === "b-balance", "the preset you're on deleted elsewhere: you're on Balance");
    E(`applyPayloadSettings(unwrapPayload(Object.assign(buildWrappedPayload(), { _chartPresets: [{ id: "uviaapply", name: "Via sync", cfg: {}, ts: 30 }] })), false)`);
    ok(E(`chPresets.some(p => p.id === "uviaapply")`), "a sync applies presets (applyPayloadSettings)");

    // ── Print ──────────────────────────────────────────────────────────────────────────────
    E(`switchTab("charts"); updateExportMenuSub();`);
    ok(txt("mob-print-sub") === "This chart", "Menu: Print covers this chart");
    E(`window.__pdfHtml = null; showPdfPreview = h => { window.__pdfHtml = h; }; menuPrint();`);
    ok(E(`window.__pdfHtml`) === null && /can't draw the chart/.test(E(`__toasts.slice(-1)[0]`)), "with no canvas, Print says it can't, rather than printing nothing");

    // ── empty vault ────────────────────────────────────────────────────────────────────────
    E(`data = {}; _dataVersion++; _invalidateYearCache(); renderCharts();`);
    ok(/No transactions yet/.test(txt("ch-chart")) && txt("ch-readout") === "", "an empty vault says so");
    ok(E(`chModel(chBase()).buckets.length`) === 0, "…and the model is empty, not broken");

    // ── version ────────────────────────────────────────────────────────────────────────────
    const vf = txt("version-footer");
    const v = (vf.match(/^v(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
    ok(v.length === 3 && (v[0] > 7 || (v[0] === 7 && v[1] >= 2)) && html.includes(`Version ${vf}<`), "version v7.2.0 or later, About matches: " + vf);
  } catch (e) { fail++; console.log("FAIL (threw):", e.stack.split("\n").slice(0, 3).join(" | ")); }
  const pageErrors = errors.filter(e => !/Not implemented|offline \(test\)/.test(e));
  pageErrors.forEach(e => { fail++; console.log("PAGE ERROR:", e); });
  console.log(`v7.2.0: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 400);
