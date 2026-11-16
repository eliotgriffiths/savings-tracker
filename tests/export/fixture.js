// Export-harness fixture (16 Nov 2026): fixed dates and the awkward cases that show layout drift.
// Six- and seven-figure amounts, cents that end in 0, a tiny amount, a foreign-currency account,
// interest, a long account name and non-ASCII text. Dates are fixed, so the file is the same
// every run (the harness pins "now" too).
(() => {
  triggerCloudSync = () => {};
  currencyCode = "AUD";
  exchangeRates = { date: "2026-11-14", base: "AUD", rates: { USD: 0.6512 } };
  accounts = [
    { id: "ing", name: "ING", color: "#e8834a", currency: "AUD" },
    { id: "ub",  name: "UBank Save — Emergency Fund (joint)", color: "#6aa2d8", currency: "AUD" },
    { id: "us",  name: "Wise USD", color: "#7cc39a", currency: "USD" },
    { id: "cf",  name: "Café ✓ Savings", color: "#c9a14a", currency: "AUD" },
  ];
  recurRules = [];
  data = {};
  let n = 0;
  const put = (ds, amt, kind, acc) => {
    const fy = yearKeyForDate(ds); data[fy] = data[fy] || { saved: [], removed: [] };
    const row = [ds, amt, "x" + (++n), 1700000000000 + n, kind === "int" ? "interest" : null, null, acc];
    (kind === "wit" ? data[fy].removed : data[fy].saved).push(row);
  };
  put("2025-01-03", 1250000, "dep", "ing");     // seven figures
  put("2025-06-30", 7.5,     "int", "ing");     // cents ending in 0
  put("2025-07-01", 0.04,    "wit", "cf");      // tiny
  put("2025-12-25", 123456.78, "dep", "ub");    // six figures
  put("2026-02-14", 2000,    "dep", "us");      // foreign currency
  put("2026-03-09", 315.1,   "wit", "us");
  put("2026-08-31", 18.27,   "int", "ub");
  put("2026-10-01", 99999.99, "wit", "ing");
  put("2026-11-02", 50,      "wit", "cf");
  put("2026-11-13", 7.91,    "dep", "ub");
})();
