const puppeteer = require("puppeteer");

const WEBHOOK = "https://script.google.com/macros/s/AKfycbxaUDFfMnvnSpFyb1khDsB70fgdp0wDxOjWDrE7uJygit1UKKh9da-9Jqz6G2qM6r8R-w/exec";

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function formatDate(d){
  return String(d.getDate()).padStart(2,"0")+"-"+
         String(d.getMonth()+1).padStart(2,"0")+"-"+
         d.getFullYear();
}

async function clickByText(page,text){
  await page.evaluate(t=>{
    const el=[...document.querySelectorAll("td,a,button,span")]
      .find(e=>e.innerText.trim()===t);
    if(el) el.click();
  },text);
}

async function setToDate(page,dateStr){

  await page.evaluate((d)=>{
    const input=[...document.querySelectorAll("input")]
      .find(i=>i.placeholder?.toLowerCase().includes("to"));
    if(!input) return;

    input.focus();
    input.value="";
    for(const c of d){
      input.value+=c;
      input.dispatchEvent(new Event("input",{bubbles:true}));
    }
    input.dispatchEvent(new Event("change",{bubbles:true}));
    input.blur();
  },dateStr);

  await sleep(2000);
}

async function refreshMandal(page){
  await clickByText(page,"ANANTAPUR-U");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("th")]
      .some(th=>th.innerText.includes("SECRETARIAT"))
  );
  await sleep(3000);
}

async function scrape(page){
  return await page.evaluate(()=>{
    const table=document.querySelector("table");
    if(!table) return [];
    const headers=[...table.querySelectorAll("thead th")]
      .map(th=>th.innerText.trim());
    const rows=[];
    table.querySelectorAll("tbody tr").forEach(tr=>{
      const obj={};
      const tds=tr.querySelectorAll("td");
      headers.forEach((h,i)=>obj[h]=tds[i]?.innerText.trim());
      rows.push(obj);
    });
    return rows;
  });
}

async function send(sheet,data){
  await fetch(WEBHOOK,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({sheet,data})
  });
}

(async()=>{

  const browser=await puppeteer.launch({
    headless:true,
    args:["--no-sandbox","--disable-setuid-sandbox"]
  });

  const page=await browser.newPage();
  await page.goto(
    "https://unifiedfamilysurvey.ap.gov.in/#/home/publicreports",
    {waitUntil:"domcontentloaded"}
  );

  await sleep(12000);

  // district
  await clickByText(page,"ANANTHAPURAMU");
  await sleep(6000);

  // initial mandal load
  await refreshMandal(page);

  // ===== TODAY =====
  const today=formatDate(new Date());
  await setToDate(page,today);
  await refreshMandal(page);   // 🔥 IMPORTANT
  const todayData=await scrape(page);
  await send("RawData",todayData);

  // ===== YESTERDAY =====
  const y=new Date();
  y.setDate(y.getDate()-1);
  const yDate=formatDate(y);

  await setToDate(page,yDate);
  await refreshMandal(page);   // 🔥 IMPORTANT
  const yData=await scrape(page);
  await send("Yesterday Data",yData);

  await browser.close();

})();
