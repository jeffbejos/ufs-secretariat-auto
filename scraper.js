const fetch = require("node-fetch");

const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbwhnN-OQ0WSzV5d1Coc24oX2lgIY9zda0LKRUU5Ni1s9eg5H2bEJa_AJ3n00Z9M6RycCA/exec";

const UFS_API = "https://unifiedfamilysurvey.ap.gov.in/clusterWEB/api/fsV4/op_reports";

const bodyData = {
  "_Clients3a2": JSON.stringify({
    type: "502",
    param1: "14-12-2025",
    param2: "13-02-2026",
    browser: "Chrome",
    source: "web"
  })
};

(async () => {
  try {

    const res = await fetch(UFS_API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-requested-with": "XMLHttpRequest",
        "origin": "https://unifiedfamilysurvey.ap.gov.in",
        "referer": "https://unifiedfamilysurvey.ap.gov.in/"
      },
      body: JSON.stringify(bodyData)
    });

    const json = await res.json();

    const rows = json?.data || [];

    await fetch(SHEET_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows })
    });

    console.log("Rows sent:", rows.length);

  } catch (e) {
    console.error("ERROR:", e);
  }
})();
