const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    document.documentElement.scrollTop = 8970;
    document.body.scrollTop = 8970;
  });
  await page.waitForTimeout(1200);

  const actual = await page.evaluate(() => ({
    html: document.documentElement.scrollTop,
    body: document.body.scrollTop,
    win: window.scrollY,
    pageY: window.pageYOffset,
  }));
  console.log("scroll positions:", actual);

  await page.screenshot({ path: "/tmp/screen-sourcing.png" });
  await browser.close();
})();
