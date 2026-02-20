const puppeteer = require("puppeteer");

const WEBHOOK = "https://script.google.com/macros/s/AKfycbxaUDFfMnvnSpFyb1khDsB70fgdp0wDxOjWDrE7uJygit1UKKh9da-9Jqz6G2qM6r8R-w/exec";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDateForInput(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function formatDateForDisplay(d) {
  return String(d.getDate()).padStart(2, "0") + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    d.getFullYear();
}

async function setDatesAndSubmit(page, fromDate, toDate) {
  await page.evaluate((fromStr, toStr) => {
    // From date input
    const fromInputs = [...document.querySelectorAll('input[type="date"]')];
    if (fromInputs.length >= 2) {
      // First is From date
      fromInputs[0].focus();
      fromInputs[0].value = fromStr;
      fromInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      fromInputs[0].dispatchEvent(new Event('change', { bubbles: true }));

      // Second is To date
      fromInputs[1].focus();
      fromInputs[1].value = toStr;
      fromInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      fromInputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Submit button
    setTimeout(() => {
      const submitBtn = [...document.querySelectorAll('button')].find(b =>
        b.innerText.toLowerCase().includes('submit')
      );
      if (submitBtn) submitBtn.click();
    }, 500);
  }, fromDate, toDate);

  // Wait for table to update
  await sleep(8000);
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('tbody tr');
    return rows.length > 10; // At least some data loaded
  }, { timeout: 30000 });
  await sleep(3000);
}

async function scrapeTableData(page) {
  return await page.evaluate(() => {
    const rows = document.querySelectorAll('tbody tr');
    const result = [];

    rows.forEach((row, index) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 11) {
        result.push({
          sno: cells[0]?.innerText.trim() || (index + 1).toString(),
          secretariat: cells[1]?.innerText.trim() || '',
          totalSecretariats: cells[2]?.innerText.trim() || '0',
          totalEmployees: cells[3]?.innerText.trim() || '0',
          employeesStarted: cells[4]?.innerText.trim() || '0',
          employeesNotStarted: cells[5]?.innerText.trim() || '0',
          employeesStartedToday: cells[6]?.innerText.trim() || '0',
          totalHouseholds: cells[7]?.innerText.trim() || '0',
          householdsCompleted: cells[8]?.innerText.trim() || '0',
          householdsPending: cells[9]?.innerText.trim() || '0',
          status: cells[10]?.innerText.trim() || ''
        });
      }
    });
    return result;
  });
}

async function sendToSheet(sheetName, data, dateLabel) {
  try {
    const response = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sheet: sheetName,
        data: data,
        date: dateLabel,
        timestamp: new Date().toISOString()
      })
    });
    console.log(`✅ Sent ${sheetName} - ${data.length} records`);
  } catch (e) {
    console.error(`❌ Error sending ${sheetName}:`, e.message);
  }
}

async function scrapeDistrictMandalData(page, district, mandal) {
  console.log(`📍 Scraping: ${district} - ${mandal}`);

  try {
    // Wait for district elements
    await page.waitForSelector('tbody tr td[style*="cursor: pointer"]', { timeout: 30000 });

    // Click district
    await page.evaluate((d) => {
      const cells = [...document.querySelectorAll('tbody tr td:nth-child(2)')];
      for (let cell of cells) {
        if (cell.innerText.includes(d)) {
          cell.click();
          return;
        }
      }
    }, district);
    console.log(`  ✅ Clicked district: ${district}`);
    await sleep(5000);

    // Click mandal
    await page.waitForFunction(() => {
      return document.body.innerText.includes('ANANTAPUR-U') ||
        document.querySelectorAll('.report-box').length > 0;
    }, { timeout: 30000 });

    await page.evaluate((m) => {
      const mandalEls = [...document.querySelectorAll('h4, .report-box, td')];
      for (let el of mandalEls) {
        if (el.innerText.includes(m)) {
          el.click();
          return;
        }
      }
    }, mandal);
    console.log(`  ✅ Clicked mandal: ${mandal}`);
    await sleep(8000);

    // Wait for table
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('tbody tr');
      return rows.length > 5;
    }, { timeout: 30000 });
    await sleep(2000);

    // Get today's date
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const todayFormatted = formatDateForInput(today);
    const todayDisplay = formatDateForDisplay(today);
    const yesterdayFormatted = formatDateForInput(yesterday);
    const yesterdayDisplay = formatDateForDisplay(yesterday);

    // Scrape today's data
    console.log(`  📅 Fetching data for: ${todayDisplay}`);
    await setDatesAndSubmit(page, todayFormatted, todayFormatted);
    const todayData = await scrapeTableData(page);
    await sendToSheet('RawData', todayData, todayDisplay);

    // Scrape yesterday's data
    console.log(`  📅 Fetching data for: ${yesterdayDisplay}`);
    await setDatesAndSubmit(page, yesterdayFormatted, yesterdayFormatted);
    const yesterdayData = await scrapeTableData(page);
    await sendToSheet('Yesterday Data', yesterdayData, yesterdayDisplay);

    return { todayData, yesterdayData };
  } catch (e) {
    console.error(`❌ Error in ${district} - ${mandal}:`, e.message);
    throw e;
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false, // Keep false first time to see what's happening
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1366, height: 768 }
  });

  try {
    const page = await browser.newPage();

    console.log('🌐 Navigating to reports page...');
    await page.goto('https://unifiedfamilysurvey.ap.gov.in/#/home/publicreports', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('⏳ Waiting for page to stabilize...');
    await sleep(15000);

    // Take screenshot to see what's loaded
    await page.screenshot({ path: 'debug-load.png', fullPage: true });
    console.log('📸 Debug screenshot saved: debug-load.png');

    // Scrape data
    await scrapeDistrictMandalData(page, 'ANANTHAPURAMU', 'ANANTAPUR-U');

    console.log('✅ Scraping completed successfully!');

  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    await browser.close();
  }
})();
