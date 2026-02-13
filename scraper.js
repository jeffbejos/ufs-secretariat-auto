const puppeteer = require("puppeteer");

const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycby4hnwEKq0iHNmkXTyEX9C_222apivShyg69sEE2Sv-Ueer_L2hN_-ERuY7npM0ockOZg/exec";

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  await page.goto("https://unifiedfamilysurvey.ap.gov.in/#/home/publicreports", {
    waitUntil: "networkidle2",
    timeout: 0
  });

  // wait district
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")]
      .some(b => b.innerText.includes("ANANTHAPURAMU"))
  );

  // click district
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")]
      .find(b => b.innerText.includes("ANANTHAPURAMU"));
    if (btn) btn.click();
  });

  // wait mandal
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")]
      .some(b => b.innerText.includes("ANANTAPUR-U"))
  );

  // click mandal
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")]
      .find(b => b.innerText.includes("ANANTAPUR-U"));
    if (btn) btn.click();
  });

  // wait secretariat level
  await page.waitForFunction(() => {
    const btns = [...document.querySelectorAll("button")].map(b => b.innerText);
    return btns.includes("ANANTHAPURAMU") && btns.includes("ANANTAPUR-U");
  });

  // wait secretariat header
  await page.waitForFunction(() =>
    [...document.querySelectorAll("table thead th")]
      .some(th => th.innerText.includes("SECRETARIAT NAME"))
  );

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
      headers.forEach((h,i) => obj[h] = cells[i]?.innerText.trim());
      rows.push(obj);
    });

    return rows;
  });

  await fetch(SHEET_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  await browser.close();
})();
