// Sample vault like the preview's: 2 accounts, 2 recurring rules, ~86 transactions.
(() => {
  triggerCloudSync = () => {};
  accounts = [{ id: "ing", name: "ING", color: "#e8834a", currency: "AUD" }, { id: "ub", name: "UBank", color: "#6aa2d8", currency: "AUD" }];
  recurRules = [
    { id: 111, type: "deposit", amount: 100, freq: "weekly", startDate: "2025-11-01", endDate: null, dow: 3, nextDate: "2099-01-01", account: "ub" },
    { id: 222, type: "deposit", amount: 250, freq: "monthly", startDate: "2025-11-15", endDate: null, dow: null, nextDate: "2099-01-01", account: "ing" },
  ];
  data = {};
  let n = 0;
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const put = (d, amt, kind, acc, recur) => {
    const ds = typeof d === "string" ? d : iso(d);
    const fy = yearKeyForDate(ds); data[fy] = data[fy] || { saved: [], removed: [] };
    const row = [ds, amt, "seed" + (++n), 1700000000000 + n, kind === "int" ? "interest" : null, recur || null, acc];
    (kind === "wit" ? data[fy].removed : data[fy].saved).push(row);
  };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let w = 0; w < 52; w++) { const d = new Date(today); d.setDate(d.getDate() - 7 * w - 2); put(d, 100, "dep", "ub", 111); }
  for (let m = 0; m < 12; m++) {
    put(new Date(today.getFullYear(), today.getMonth() - m, 15), 250, "dep", "ing", 222);
    put(new Date(today.getFullYear(), today.getMonth() - m + 1, 0), +(9 + m * 0.7).toFixed(2), "int", m % 3 ? "ing" : "ub");
  }
  [["2026-10-03", 500, "dep", "ing"], ["2026-09-20", 1200, "dep", "ub"], ["2026-08-11", 320, "wit", "ub"], ["2026-06-02", 80, "wit", "ing"],
   ["2026-05-18", 2000, "dep", "ub"], ["2026-03-09", 450, "wit", "ing"], ["2026-01-06", 50, "dep", "ing"], ["2025-12-22", 600, "wit", "ub"],
   ["2026-11-03", 50, "dep", "ub"], ["2026-10-28", 145.5, "wit", "ing"]].forEach(a => put(...a));
  document.querySelectorAll('[id$="-modal"], .modal').forEach(m => m.style.display = "none");
  _dataVersion++;
})();
