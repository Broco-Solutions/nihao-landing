const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const el = document.querySelector("#sourcing");
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
  });
  console.log("mobile #sourcing:", info);
  await browser.close();
})();
