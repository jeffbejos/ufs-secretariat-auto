const puppeteer = require("puppeteer");

const SHEET_WEBHOOK =
  "https://script.google.com/macros/s/AKfycbwvlVNO8H17XPfzWOSyP3iQ4PQDEy1GJFUIKRMO11Ca_tpU1xBsxVwsv900QO23hHGCiw/exec";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function clickByText(page, text) {
  await page.evaluate(t => {
    const el = [...document.querySelectorAll("button,td,a")]
      .find(e => e.innerText.trim() === t);
    if (el) el.click();
  }, text);
}

function formatDate(d) {
  return d.toLocaleDateString("en-GB").replace(/\//g, "-");
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

  await sleep(12000);

  // district mandal
  await clickByText(page, "ANANTHAPURAMU");
  await sleep(6000);
  await clickByText(page, "ANANTAPUR-U");

  // dates
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const todayStr = formatDate(today);
  const yestStr = formatDate(yesterday);

  async function setDate(toDate) {
    await page.evaluate(t => {
      const inputs = document.querySelectorAll("input");
      inputs[1].value = t; // To date
    }, toDate);

    await clickByText(page, "Submit");
    await sleep(6000);
  }

  // ---------- TODAY TABLE ----------
  await setDate(todayStr);

  await page.waitForFunction(() =>
    [...document.querySelectorAll("th")]
      .some(th => th.innerText.includes("SECRETARIAT NAME"))
  );

  await sleep(3000);

  const todayTable = await page.evaluate(() => {
    const headers = [...document.querySelectorAll("thead th")]
      .map(th => th.innerText.trim());

    const rows = [];

    document.querySelectorAll("tbody tr").forEach(tr => {
      const obj = {};
      const tds = tr.querySelectorAll("td");

      headers.forEach((h, i) => {
        obj[h] = tds[i]?.innerText.trim();
      });

      rows.push(obj);
    });

    return rows;
  });

  // ---------- YESTERDAY COMPLETED MAP ----------
  await setDate(yestStr);
  await sleep(3000);

  const yestMap = await page.evaluate(() => {
    const map = {};

    document.querySelectorAll("tbody tr").forEach(tr => {
      const tds = tr.querySelectorAll("td");
      const name = tds[1]?.innerText.trim();
      const completed = tds[8]?.innerText.trim(); // completed column

      map[name] = completed;
    });

    return map;
  });

  // ---------- MERGE ----------
  const final = todayTable.map(row => ({
    ...row,
    "YESTERDAY HOUSEHOLDS SURVEY COMPLETED":
      yestMap[row["SECRETARIAT NAME"]] || "0"
  }));

  // send to sheet
  await fetch(SHEET_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(final)
  });

  await browser.close();

})();
