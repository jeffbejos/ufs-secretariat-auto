const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

const WEBHOOK =
  "https://script.google.com/macros/s/AKfycbwhnN-OQ0WSzV5d1Coc24oX2lgIY9zda0LKRUU5Ni1s9eg5H2bEJa_AJ3n00Z9M6RycCA/exec";

(async () => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });

  const page = await browser.newPage();

  await page.goto(
    "https://unifiedfamilysurvey.ap.gov.in/#/home/publicreports",
    { waitUntil: "networkidle2" }
  );

  await page.waitForSelector("button");

  // ALL DISTRICTS
  const districts = await page.$$eval(
    "button",
    (btns) =>
      btns
        .map((b) => b.innerText.trim())
        .filter((t) => t.length > 3 && t === t.toUpperCase())
  );

  let allRows = [];

  for (const dist of districts) {
    console.log("DIST:", dist);

    const distBtn = await page.$x(`//button[contains(., '${dist}')]`);
    if (!distBtn.length) continue;

    await distBtn[0].click();
    await page.waitForTimeout(2000);

    // mandals
    const mandals = await page.$$eval(
      "a",
      (els) => els.map((e) => e.innerText.trim()).filter((t) => t)
    );

    for (const mandal of mandals) {
      console.log("MANDAL:", mandal);

      const mandalBtn = await page.$x(`//a[contains(., '${mandal}')]`);
      if (!mandalBtn.length) continue;

      await mandalBtn[0].click();
      await page.waitForTimeout(1500);

      const rows = await page.$$eval("table tbody tr", (trs) =>
        trs.map((tr) =>
          Array.from(tr.querySelectorAll("td")).map((td) =>
            td.innerText.trim()
          )
        )
      );

      rows.forEach((r) => {
        allRows.push({
          district: dist,
          mandal: mandal,
          secretariat: r[1],
          total_emp: r[3],
          emp_started: r[4],
          emp_not_started: r[5],
          emp_today: r[6],
          households: r[7],
          completed: r[8],
          pending: r[9],
          status: r[10],
        });
      });

      await page.goBack({ waitUntil: "networkidle2" });
      await page.waitForTimeout(1000);
    }

    await page.goBack({ waitUntil: "networkidle2" });
    await page.waitForTimeout(1000);
  }

  console.log("TOTAL:", allRows.length);

  // SEND TO SHEET
  await fetch(WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rows: allRows }),
  });

  await browser.close();
})();
