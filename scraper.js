const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');
const fs = require('fs');

// Chrome path automatically find cheyadam
function findChromePath() {
  try {
    const paths = [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      execSync('which chromium').toString().trim(),
      execSync('which google-chrome').toString().trim(),
      execSync('npx @puppeteer/browsers chrome-path').toString().trim()
    ];
    
    for (const path of paths) {
      if (fs.existsSync(path)) {
        return path;
      }
    }
  } catch (e) {
    console.log('Chrome path detection error:', e.message);
  }
  
  // Fallback to default chrome path
  return '/usr/bin/google-chrome';
}

const WEBHOOK = process.env.WEBHOOK_URL || "https://script.google.com/macros/s/AKfycbxaUDFfMnvnSpFyb1khDsB70fgdp0wDxOjWDrE7uJygit1UKKh9da-9Jqz6G2qM6r8R-w/exec";

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
    const inputs = [...document.querySelectorAll('input[type="date"]')];
    if (inputs.length >= 2) {
      // From date
      inputs[0].value = fromStr;
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      
      // To date
      inputs[1].value = toStr;
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    setTimeout(() => {
      const submitBtn = [...document.querySelectorAll('button')].find(b => 
        b.innerText.toLowerCase().includes('submit')
      );
      if (submitBtn) submitBtn.click();
    }, 500);
  }, fromDate, toDate);
  
  await sleep(10000);
}

async function scrapeTableData(page) {
  return await page.evaluate(() => {
    const rows = document.querySelectorAll('tbody tr');
    const data = [];
    
    rows.forEach((row, idx) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 11) {
        data.push({
          sl_no: cells[0]?.innerText.trim() || (idx + 1).toString(),
          secretariat_name: cells[1]?.innerText.trim() || '',
          total_secretariats: cells[2]?.innerText.trim() || '0',
          total_employees: cells[3]?.innerText.trim() || '0',
          employees_started: cells[4]?.innerText.trim() || '0',
          employees_not_started: cells[5]?.innerText.trim() || '0',
          employees_started_today: cells[6]?.innerText.trim() || '0',
          total_households: cells[7]?.innerText.trim() || '0',
          households_completed: cells[8]?.innerText.trim() || '0',
          households_pending: cells[9]?.innerText.trim() || '0',
          survey_status: cells[10]?.innerText.trim() || ''
        });
      }
    });
    
    return data;
  });
}

async function sendToSheet(sheetName, data, date) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sheet: sheetName,
        data: data,
        report_date: date,
        scraped_at: new Date().toISOString(),
        record_count: data.length
      })
    });
    
    console.log(`✅ ${sheetName}: ${data.length} records sent for ${date}`);
  } catch (e) {
    console.error(`❌ Error sending ${sheetName}:`, e.message);
  }
}

async function scrapeDistrictMandalData(page, district, mandal) {
  console.log(`🎯 Scraping: ${district} - ${mandal}`);
  
  try {
    // Take initial screenshot
    await page.screenshot({ path: 'initial-load.png', fullPage: true });
    
    // Wait for table
    await page.waitForSelector('tbody tr', { timeout: 30000 });
    await sleep(5000);
    
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
    console.log('✅ District clicked');
    await sleep(7000);
    
    // Click mandal
    await page.evaluate((m) => {
      const els = [...document.querySelectorAll('h4, .report-box, td')];
      for (let el of els) {
        if (el.innerText.includes(m)) {
          el.click();
          return;
        }
      }
    }, mandal);
    console.log('✅ Mandal clicked');
    await sleep(8000);
    
    // Wait for table to populate
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('tbody tr');
      return rows.length > 10;
    }, { timeout: 30000 });
    
    // Get dates
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Today's data
    console.log('📊 Fetching today\'s data...');
    await setDatesAndSubmit(page, 
      formatDateForInput(today), 
      formatDateForInput(today)
    );
    const todayData = await scrapeTableData(page);
    await sendToSheet('RawData', todayData, formatDateForDisplay(today));
    
    // Take screenshot of today's data
    await page.screenshot({ path: 'today-data.png', fullPage: true });
    
    // Yesterday's data
    console.log('📊 Fetching yesterday\'s data...');
    await setDatesAndSubmit(page, 
      formatDateForInput(yesterday), 
      formatDateForInput(yesterday)
    );
    const yesterdayData = await scrapeTableData(page);
    await sendToSheet('Yesterday Data', yesterdayData, formatDateForDisplay(yesterday));
    
    // Summary
    await page.screenshot({ path: 'final-state.png', fullPage: true });
    
    return { today: todayData.length, yesterday: yesterdayData.length };
    
  } catch (e) {
    console.error('❌ Error in scraping:', e);
    await page.screenshot({ path: `error-${Date.now()}.png`, fullPage: true });
    throw e;
  }
}

(async () => {
  console.log('🚀 Starting scraper...');
  
  const chromePath = findChromePath();
  console.log('Chrome path:', chromePath);
  
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome not found at ${chromePath}`);
  }
  
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('🌐 Navigating to reports page...');
    await page.goto('https://unifiedfamilysurvey.ap.gov.in/#/home/publicreports', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('⏳ Waiting for page to load...');
    await sleep(15000);
    
    // Scrape data
    const counts = await scrapeDistrictMandalData(page, 'ANANTHAPURAMU', 'ANANTAPUR-U');
    
    console.log('✅ Scraping completed!');
    console.log(`📈 Today: ${counts.today} records, Yesterday: ${counts.yesterday} records`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
