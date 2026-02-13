const fetch = require("node-fetch");

const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycby4hnwEKq0iHNmkXTyEX9C_222apivShyg69sEE2Sv-Ueer_L2hN_-ERuY7npM0ockOZg/exec";

const payload = {
  _Clients3a2: JSON.stringify({
    type: "1018",
    param1: "14-12-2025",
    param2: new Date().toLocaleDateString("en-GB").split("/").join("-"),
    param3: 502,
    param4: 1001,
    browser: "Chrome",
    source: "web"
  })
};

(async () => {

  const res = await fetch(
    "https://unifiedfamilysurvey.ap.gov.in/clusterWEB/api/fsV4/op_reports",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const json = await res.json();

  await fetch(SHEET_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json)
  });

})();
