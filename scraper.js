const fetch = require("node-fetch");

const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbwhnN-OQ0WSzV5d1Coc24oX2lgIY9zda0LKRUU5Ni1s9eg5H2bEJa_AJ3n00Z9M6RycCA/exec";

const UFS_API = "https://unifiedfamilysurvey.ap.gov.in/clusterWEB/api/fsV4/op_reports";

const payload = {
  "_Clients3a2": JSON.stringify({
    type: "502",              // SECRETARIAT REPORT
    param1: "14-12-2025",
    param2: "13-02-2026",
    browser: "Chrome",
    source: "web"
  })
};

(async () => {

  const res = await fetch(UFS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const json = await res.json();

  const rows = json?.data || [];

  await fetch(SHEET_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows })
  });

  console.log("UFS Secretariat data sent:", rows.length);

})();
