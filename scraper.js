const puppeteer = require("puppeteer");
const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbwvlVNO8H17XPfzWOSyP3iQ4PQDEy1GJFUIKRMO11Ca_tpU1xBsxVwsv900QO23hHGCiw/exec";

// ✅ ADD THIS: Your Google Sheet ID and a READ webhook or use Sheets API
// Easiest: expose a GET endpoint from the same Apps Script to return yesterday's data
const READ_WEBHOOK = "https://script.google.com/macros/s/AKfycbwvlVNO8H17XPfzWOSyP3iQ4PQDEy1GJFUIKRMO11Ca_tpU1xBsxVwsv900QO23hHGCiw/exec";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`; // format must match what you store in RawData
}

async function clickByText(page, text) {
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button,td,a")]
      .find(e => e.innerText.trim() === t);
    if (el) el.click();
  }, text);
}

(async () => {
  // ─── STEP 1: Fetch yesterday's data from Google Sheet ───────────────────────
  // Your Apps Script GET handler should accept ?action=getYesterday&date=DD/MM/YYYY
  // and return JSON: { "SECRETARIAT NAME": completedCount, ... }
  const yesterday = getYesterdayStr();
  let yesterdayMap = {}; // { "NIRMALANAND": 800, "MGCOLONY": 900, ... }

  try {
    const res = await fetch(`${READ_WEBHOOK}?action=getYesterday&date=${yesterday}`);
    const json = await res.json();
    // Expecting: [ { "SECRETARIAT NAME": "...", "HOUSEHOLDS SURVEY COMPLETED": "819" }, ... ]
    json.forEach(row => {
      const name = row["SECRETARIAT NAME"]?.trim();
      const completed = parseInt(row["HOUSEHOLDS SURVEY COMPLETED"] || "0", 10);
      if (name) yesterdayMap[name] = completed;
    });
    console.log(`✅ Loaded yesterday (${yesterday}) data for ${Object.keys(yesterdayMap).length} secretariats`);
  } catch (e) {
    console.warn("⚠️ Could not fetch yesterday data:", e.message);
  }

  // ─── STEP 2: Scrape today's live data ───────────────────────────────────────
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    protocolTimeout: 0
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(0);

  await page.goto(
    "https://unifiedfamilysurvey.ap.gov.in/#/home/publicreports",
    { waitUntil: "domcontentloaded", timeout: 0 }
  );
  await sleep(12000);

  await clickByText(page, "ANANTHAPURAMU");
  await sleep(6000);
  await clickByText(page, "ANANTAPUR-U");

  await page.waitForFunction(() =>
    [...document.querySelectorAll("th")]
      .some(th => th.innerText.includes("SECRETARIAT NAME")),
    { timeout: 0 }
  );
  await sleep(3000);

  const data = await page.evaluate(() => {
    const table = document.querySelector("table");
    if (!table) return [];
    const headers = [...table.querySelectorAll("thead th")]
      .map(th => th.innerText.trim());
    const rows = [];
    table.querySelectorAll("tbody tr").forEach(tr => {
      const obj = {};
      const cells = tr.querySelectorAll("td");
      headers.forEach((h, i) => obj[h] = cells[i]?.innerText.trim());
      rows.push(obj);
    });
    return rows;
  });

  // ─── STEP 3: Inject "Completed upto Yesterday" column ───────────────────────
  // Date range: 14/12/2025 to yesterday
  const startDate = new Date("2025-12-14");
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  yesterdayDate.setHours(0, 0, 0, 0);

  const enrichedData = data.map(row => {
    const secretariatName = row["SECRETARIAT NAME"]?.trim();
    
    // "Completed upto Yesterday" = cumulative completed as of yesterday
    // Since your sheet stores daily snapshots, yesterday's HOUSEHOLDS SURVEY COMPLETED
    // already represents the cumulative total up to that day
    const completedUptoYesterday = yesterdayMap[secretariatName] ?? "N/A";

    return {
      ...row,
      "Completed upto Yesterday": completedUptoYesterday,
      // Bonus: Today's addition = Today's completed - Yesterday's completed
      "Completed Today": completedUptoYesterday !== "N/A"
        ? (parseInt(row["HOUSEHOLDS SURVEY COMPLETED"] || "0") - completedUptoYesterday)
        : "N/A"
    };
  });

  console.log("Sample row:", enrichedData[0]);

  // ─── STEP 4: Push enriched data to sheet ────────────────────────────────────
  await fetch(SHEET_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(enrichedData)
  });

  await browser.close();
  console.log("✅ Done. Sent", enrichedData.length, "rows with 'Completed upto Yesterday'");
})();
