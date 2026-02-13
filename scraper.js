const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycby4hnwEKq0iHNmkXTyEX9C_222apivShyg69sEE2Sv-Ueer_L2hN_-ERuY7npM0ockOZg/exec";

// ====== CONFIG ======
const FROM_DATE = "14-12-2025";
const DISTRICT_ID = 502;   // ANANTHAPURAM
const MANDAL_ID = 1001;    // ANANTAPUR-U

// today date auto
function getToday() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

// ====== API CALL ======
async function fetchSecretariatData() {

  const payload = {
    _Clients3a2: JSON.stringify({
      type: "1018",        // SECRETARIAT REPORT
      param1: FROM_DATE,
      param2: getToday(),
      param3: DISTRICT_ID,
      param4: MANDAL_ID,
      browser: "Chrome",
      source: "web"
    })
  };

  const res = await fetch(
    "https://unifiedfamilysurvey.ap.gov.in/clusterWEB/api/fsV4/op_reports",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const json = await res.json();
  return json;
}

// ====== SEND TO GOOGLE SHEET ======
async function sendToSheet(data) {

  await fetch(SHEET_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

}

// ====== RUN ======
(async () => {

  try {
    const data = await fetchSecretariatData();
    await sendToSheet(data);
    console.log("✅ Sheet Updated");

  } catch (err) {
    console.error("❌ Error:", err);
  }

})();
