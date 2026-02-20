const puppeteer = require("puppeteer");

const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbwvlVNO8H17XPfzWOSyP3iQ4PQDEy1GJFUIKRMO11Ca_tpU1xBsxVwsv900QO23hHGCiw/exec";
const READ_WEBHOOK  = "https://script.google.com/macros/s/AKfycbwvlVNO8H17XPfzWOSyP3iQ4PQDEy1GJFUIKRMO11Ca_tpU1xBsxVwsv900QO23hHGCiw/exec";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function clickByText(page, text) {
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button,td,a")]
      .find(e => e.innerText.trim() === t);
    if (el) el.click();
  }, text);
}

(async () => {

  // ─── LOAD YESTERDAY DATA ─────────────────────────────
  const yesterday = getYesterdayStr();
  let yesterdayMap = {};

  try {
    const res = await fetch(`${READ_WEBHOOK}?action=getYesterday&date=${yesterday}`);
    const json = await res.json();

    json.forEach(row => {
      const name = row["SECRETARIAT NAME"]?.trim();
      const val = parseInt(row["HOUSEHOLDS SURVEY COMPLETED"] || "0", 10);
      if (name) yesterdayMap[name] = val;
    });

    console.log("Yesterday loaded:", Object.keys(yesterdayMap).length);
  } catch (e) {
    console.log("Yesterday data not available");
  }

  // ─── ORIGINAL SCRAPER (UNCHANGED) ───────────────────
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

  // ─── ADD COMPLETED UPTO YESTERDAY ───────────────────
  const enriched = data.map(row => {
    const name = row["SECRETARIAT NAME"]?.trim();
    const yVal = yesterdayMap[name] ?? "N/A";

    return {
      ...row,
      "Completed upto Yesterday": yVal
    };
  });

  // ─── SEND TO SHEET ──────────────────────────────────
  await fetch(SHEET_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(enriched)
  });

  await browser.close();

})();
