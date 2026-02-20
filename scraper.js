const puppeteer = require("puppeteer");

const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbwvlVNO8H17XPfzWOSyP3iQ4PQDEy1GJFUIKRMO11Ca_tpU1xBsxVwsv900QO23hHGCiw/exec";

function sleep(ms){
  return new Promise(r=>setTimeout(r,ms));
}

function getYesterdaySiteFormat(){
  const d=new Date();
  d.setDate(d.getDate()-1);
  const mm=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  const yyyy=d.getFullYear();
  return `${mm}/${dd}/${yyyy}`; // site format MM/DD/YYYY
}

async function clickByText(page,text){
  await page.evaluate(t=>{
    const el=[...document.querySelectorAll("button,td,a")]
      .find(e=>e.innerText.trim()===t);
    if(el) el.click();
  },text);
}

(async()=>{

  const browser=await puppeteer.launch({
    headless:true,
    args:["--no-sandbox","--disable-setuid-sandbox"],
    protocolTimeout:0
  });

  const page=await browser.newPage();
  page.setDefaultTimeout(0);

  await page.goto(
    "https://unifiedfamilysurvey.ap.gov.in/#/home/publicreports",
    {waitUntil:"domcontentloaded",timeout:0}
  );

  await sleep(12000);

  // ─── SET TO DATE = YESTERDAY ─────────────
  const yDate=getYesterdaySiteFormat();

  await page.evaluate((dateVal)=>{
    const inputs=[...document.querySelectorAll("input")];
    const toInput=inputs.find(i=>i.value && i.value.includes("/"));
    if(toInput){
      toInput.value=dateVal;
      toInput.dispatchEvent(new Event("input",{bubbles:true}));
      toInput.dispatchEvent(new Event("change",{bubbles:true}));
    }
  },yDate);

  // click submit
  await clickByText(page,"Submit");
  await sleep(6000);

  // select district + mandal
  await clickByText(page,"ANANTHAPURAMU");
  await sleep(6000);
  await clickByText(page,"ANANTAPUR-U");

  await page.waitForFunction(()=>{
    return [...document.querySelectorAll("th")]
      .some(th=>th.innerText.includes("SECRETARIAT NAME"));
  },{timeout:0});

  await sleep(3000);

  // extract table
  const data=await page.evaluate(()=>{
    const table=document.querySelector("table");
    if(!table) return [];

    const headers=[...table.querySelectorAll("thead th")]
      .map(th=>th.innerText.trim());

    const rows=[];
    table.querySelectorAll("tbody tr").forEach(tr=>{
      const obj={};
      const cells=tr.querySelectorAll("td");
      headers.forEach((h,i)=>obj[h]=cells[i]?.innerText.trim());
      rows.push(obj);
    });

    return rows;
  });

  await fetch(SHEET_WEBHOOK,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(data)
  });

  await browser.close();

})();
