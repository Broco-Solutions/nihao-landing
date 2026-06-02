const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForSelector("#puente svg");

  const top = await page.evaluate(() => {
    const el = document.querySelector("#puente");
    return el.getBoundingClientRect().top + window.scrollY;
  });
  const height = await page.evaluate(() => {
    return document.querySelector("#puente").getBoundingClientRect().height;
  });

  await page.evaluate((y) => window.scrollTo(0, y - 96), top);
  await page.waitForTimeout(400);

  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: `/tmp/screen-bridge-frame-${i}.png`,
      clip: { x: 0, y: 0, width: 1440, height: Math.min(900, height + 192) },
    });
  }

  await browser.close();
  console.log("ok 4 frames captured");
})();
