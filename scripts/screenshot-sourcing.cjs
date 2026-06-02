const { chromium } = require("playwright");

async function captureAt(browser, scrollY, width, height, scale, outPath, settle = 1800) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.evaluate((y) => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, y);
  }, scrollY);
  await page.waitForTimeout(settle);
  const got = await page.evaluate(() => window.scrollY);
  await page.screenshot({ path: outPath, fullPage: false });
  await ctx.close();
  console.log(`ok ${outPath} requested=${scrollY} got=${got}`);
}

(async () => {
  const browser = await chromium.launch();
  // #sourcing top in doc = 9063. Put section top at y=120 (clear navbar 96 + small headroom).
  await captureAt(browser, 9063 - 120, 1440, 900, 1, "/tmp/screen-sourcing.png");
  // Tablet: grid is 4 cols x 2 rows. Section is taller (gap-3, more vertical space per card).
  await captureAt(browser, 9063 - 120, 768, 1100, 1, "/tmp/screen-sourcing-tablet.png");
  // Mobile: 2 cols x 4 rows. Section is even taller.
  await captureAt(browser, 9063 - 120, 390, 1700, 2, "/tmp/screen-sourcing-mobile.png");
  await browser.close();
})();
