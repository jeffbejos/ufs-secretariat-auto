const puppeteer = require("puppeteer");

const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycby4hnwEKq0iHNmkXTyEX9C_222apivShyg69sEE2Sv-Ueer_L2hN_-ERuY7npM0ockOZg/exec";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function clickByText(page, text) {
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button,td,a")]
      .find(e => e.innerText.trim() === t);
    if (el) el.click();
  }, text);
}

(async () => {

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

  // wait Angular fully load
  await sleep(12000);

  // click district
  await clickByText(page, "ANANTHAPURAMU");
  await sleep(6000);

  // click mandal
  await clickByText(page, "ANANTAPUR-U");

  // wait secretariat table
  await page.waitForFunction(() =>
    [...document.querySelectorAll("th")]
      .some(th => th.innerText.includes("SECRETARIAT NAME")),
    { timeout: 0 }
  );

  await sleep(3000);

  // extract table
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

  // send to sheet
  await fetch(SHEET_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  await browser.close();

})();
