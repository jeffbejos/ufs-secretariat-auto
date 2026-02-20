// scraper.js - CommonJS version (no import/await at top level)
const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');
const fs = require('fs');

// fetch for Node.js (CommonJS)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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

function findChromePath() {
  // First check environment variable
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  
  // Common paths in Ubuntu
  const paths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/snap/bin/chromium'
  ];
  
  for (const path of paths) {
    if (fs.existsSync(path)) {
      return path;
    }
  }
  
  // Try which command
  try {
    const whichPath = execSync('which chromium-browser || which google-chrome || which chromium').toString().trim();
    if (whichPath && fs.existsSync(whichPath)) {
      return whichPath;
    }
  } catch (e) {
    console.log('which command failed:', e.message);
  }
  
  // Fallback
  return '/usr/bin/chromium-browser';
}

async function setDatesAndSubmit(page, fromDate, toDate) {
  console.log(`Setting dates: From=${fromDate}, To=${toDate}`);
  
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
    
    // Click submit after a small delay
    setTimeout(() => {
      const submitBtn = [...document.querySelectorAll('button')].find(b => 
        b.innerText.toLowerCase().includes('submit')
      );
      if (submitBtn) {
        console.log('Submit button clicked');
        submitBtn.click();
      } else {
        console.log('Submit button not found');
      }
    }, 500);
  }, fromDate, toDate);
  
  // Wait for table to update
  await sleep(10000);
  try {
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('tbody tr');
      return rows.length > 5;
    }, { timeout: 30000 });
  } catch (e) {
    console.log('Wait timeout, continuing...');
  }
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
          secretariat: cells[1]?.innerText.trim() || '',
          total_secretariats: cells[2]?.innerText.trim() || '0',
          total_employees: cells[3]?.innerText.trim() || '0',
          employees_started: cells[4]?.innerText.trim() || '0',
          employees_not_started: cells[5]?.innerText.trim() || '0',
          employees_started_today: cells[6]?.innerText.trim() || '0',
          total_households: cells[7]?.innerText.trim() || '0',
          households_completed: cells[8]?.innerText.trim() || '0',
          households_pending: cells[9]?.innerText.trim() || '0',
          status: cells[10]?.innerText.trim() || ''
        });
      }
    });
    
    return data;
  });
}

async function sendToSheet(sheetName, data, date) {
  try {
    const payload = {
      sheet: sheetName,
      data: data,
      report_date: date,
      scraped_at: new Date().toISOString(),
      record_count: data.length
    };
    
    console.log(`Sending ${data.length} records to ${sheetName}...`);
    
    const response = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.text();
    console.log(`✅ ${sheetName} sent: ${result.substring(0, 100)}`);
  } catch (e) {
    console.error(`❌ Error sending ${sheetName}:`, e.message);
  }
}

async function scrapeData() {
  console.log('Starting scraper...');
  
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
      '--window-size=1920,1080',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--ignore-certificate-errors'
    ]
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Enable console logging from page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    console.log('Navigating to reports page...');
    await page.goto('https://unifiedfamilysurvey.ap.gov.in/#/home/publicreports', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    await page.screenshot({ path: '01-initial-load.png', fullPage: true });
    console.log('Initial screenshot taken');
    
    // Wait for table to load
    try {
      await page.waitForSelector('tbody tr', { timeout: 30000 });
    } catch (e) {
      console.log('Table not found, waiting longer...');
      await sleep(10000);
    }
    
    await sleep(5000);
    
    // Click district
    console.log('Clicking district: ANANTHAPURAMU');
    await page.evaluate(() => {
      const cells = [...document.querySelectorAll('tbody tr td:nth-child(2)')];
      for (let cell of cells) {
        if (cell.innerText.includes('ANANTHAPURAMU')) {
          cell.click();
          return true;
        }
      }
      return false;
    });
    
    await sleep(7000);
    await page.screenshot({ path: '02-after-district.png', fullPage: true });
    
    // Click mandal
    console.log('Clicking mandal: ANANTAPUR-U');
    await page.evaluate(() => {
      const elements = [...document.querySelectorAll('h4, .report-box, td, a, button')];
      for (let el of elements) {
        if (el.innerText && el.innerText.includes('ANANTAPUR-U')) {
          el.click();
          return true;
        }
      }
      return false;
    });
    
    await sleep(8000);
    await page.screenshot({ path: '03-after-mandal.png', fullPage: true });
    
    // Wait for table to populate
    try {
      await page.waitForFunction(() => {
        const rows = document.querySelectorAll('tbody tr');
        return rows.length > 10;
      }, { timeout: 30000 });
    } catch (e) {
      console.log('Table population timeout, but continuing...');
    }
    
    // Get dates
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Today's data
    console.log('Fetching today\'s data...');
    await setDatesAndSubmit(page, formatDateForInput(today), formatDateForInput(today));
    await sleep(5000);
    await page.screenshot({ path: '04-today-data.png', fullPage: true });
    
    const todayData = await scrapeTableData(page);
    console.log(`Today: ${todayData.length} records`);
    await sendToSheet('RawData', todayData, formatDateForDisplay(today));
    
    // Yesterday's data
    console.log('Fetching yesterday\'s data...');
    await setDatesAndSubmit(page, formatDateForInput(yesterday), formatDateForInput(yesterday));
    await sleep(5000);
    await page.screenshot({ path: '05-yesterday-data.png', fullPage: true });
    
    const yesterdayData = await scrapeTableData(page);
    console.log(`Yesterday: ${yesterdayData.length} records`);
    await sendToSheet('Yesterday Data', yesterdayData, formatDateForDisplay(yesterday));
    
    console.log('Scraping completed successfully!');
    
  } finally {
    await browser.close();
  }
}

// Run the scraper
scrapeData().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
