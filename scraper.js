const puppeteer = require("puppeteer");

const WEBHOOK = "https://script.google.com/macros/s/AKfycbxaUDFfMnvnSpFyb1khDsB70fgdp0wDxOjWDrE7uJygit1UKKh9da-9Jqz6G2qM6r8R-w/exec";

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function formatDate(d){
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
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
    const inputs=[...document.querySelectorAll("input")];

    const to=inputs.find(i =>
      i.placeholder?.toLowerCase().includes("to")
      || i.getAttribute("formcontrolname")?.toLowerCase().includes("to")
    );

    if(!to) return;

    to.focus();
    to.value="";

    for(const c of d){
      to.value+=c;
      to.dispatchEvent(new Event("input",{bubbles:true}));
    }

    to.dispatchEvent(new Event("change",{bubbles:true}));
    to.blur();

  },dateStr);

  await page.evaluate(()=>{
    const btn=[...document.querySelectorAll("button")]
      .find(b =>
        b.innerText.toLowerCase().includes("submit")
        || b.innerText.toLowerCase().includes("search")
        || b.type==="submit"
      );
    if(btn) btn.click();
  });

  await sleep(6000);
}

async function scrapeTable(page){
  return await page.evaluate(()=>{
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
  page.setDefaultTimeout(0);

  await page.goto(
    "https://unifiedfamilysurvey.ap.gov.in/#/home/publicreports",
    {waitUntil:"domcontentloaded"}
  );

  await sleep(12000);

  // ===== SELECT DISTRICT =====
  await clickByText(page,"ANANTHAPURAMU");
  await sleep(6000);

  // ===== SELECT MANDAL =====
  await clickByText(page,"ANANTAPUR-U");

  // wait table
  await page.waitForFunction(() =>
    [...document.querySelectorAll("th")]
      .some(th=>th.innerText.includes("SECRETARIAT"))
  );

  await sleep(3000);

  // ===== TODAY =====
  const today=formatDate(new Date());
  await setToDate(page,today);
  const todayData=await scrapeTable(page);
  await send("RawData",todayData);

  // ===== YESTERDAY =====
  const y=new Date();
  y.setDate(y.getDate()-1);
  const yDate=formatDate(y);

  await setToDate(page,yDate);
  const yData=await scrapeTable(page);
  await send("Yesterday Data",yData);

  await browser.close();

})();
