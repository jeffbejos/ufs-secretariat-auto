const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

const WEBHOOK =
  "https://script.google.com/macros/s/AKfycbwhnN-OQ0WSzV5d1Coc24oX2lgIY9zda0LKRUU5Ni1s9eg5H2bEJa_AJ3n00Z9M6RycCA/exec";

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  await page.goto(
    "https://unifiedfamilysurvey.ap.gov.in/#/home/publicreports",
    { waitUntil: "networkidle2" }
  );

  await page.waitForTimeout(3000);

  let allRows = [];

  // DISTRICT BUTTONS
  const districts = await page.$$eval(
    "button",
    btns =>
      btns
        .map(b => b.innerText.trim())
        .filter(t => t && t === t.toUpperCase())
  );

  for (const dist of districts) {
    console.log("DISTRICT:", dist);

    const [distBtn] = await page.$x(`//button[contains(., "${dist}")]`);
    if (!distBtn) continue;

    await distBtn.click();
    await page.waitForTimeout(2500);

    // MANDALS
    const mandals = await page.$$eval(
      "a",
      els => els.map(e => e.innerText.trim()).filter(t => t)
    );

    for (const mandal of mandals) {
      console.log("MANDAL:", mandal);

      const [mandalBtn] = await page.$x(`//a[contains(., "${mandal}")]`);
      if (!mandalBtn) continue;

      await mandalBtn.click();
      await page.waitForTimeout(2000);

      const rows = await page.$$eval("table tbody tr", trs =>
        trs.map(tr =>
          Array.from(tr.querySelectorAll("td")).map(td =>
            td.innerText.trim()
          )
        )
      );

      rows.forEach(r => {
        allRows.push([
          dist,
          mandal,
          r[1],
          r[3],
          r[4],
          r[5],
          r[6],
          r[7],
          r[8],
          r[9],
          r[10]
        ]);
      });

      await page.goBack({ waitUntil: "networkidle2" });
      await page.waitForTimeout(1500);
    }

    await page.goBack({ waitUntil: "networkidle2" });
    await page.waitForTimeout(1500);
  }

  console.log("TOTAL ROWS:", allRows.length);

  await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows: allRows }),
  });

  await browser.close();
})();
