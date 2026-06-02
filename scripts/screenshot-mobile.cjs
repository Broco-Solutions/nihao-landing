const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const v of [
    { name: 'mobile', w: 390, h: 844 },
    { name: 'tablet', w: 768, h: 1024 },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: v.w, height: v.h },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/tmp/screen-${v.name}-fold.png` });
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `/tmp/screen-${v.name}-mid.png` });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.65));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `/tmp/screen-${v.name}-deep.png` });
    console.log('ok', v.name);
    await ctx.close();
  }
  await browser.close();
})();
