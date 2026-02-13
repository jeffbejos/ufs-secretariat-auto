const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbwhnN-OQ0WSzV5d1Coc24oX2lgIY9zda0LKRUU5Ni1s9eg5H2bEJa_AJ3n00Z9M6RycCA/exec";

(async () => {

  await fetch(SHEET_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ test: "hello from github" })
  });

  console.log("sent");

})();
