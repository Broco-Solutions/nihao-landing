const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  const el = page.locator('#puente').first();
  const box = await el.boundingBox();
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), box.y);
  await page.waitForTimeout(2500);

  const fullBox = await el.boundingBox();
  await page.screenshot({
    path: '/tmp/screen-bridge-full.png',
    clip: { x: 0, y: 0, width: 1440, height: Math.min(fullBox.height + 80, 1400) },
  });
  console.log('ok bridge-full', fullBox.height);

  // Mobile view of bridge
  await ctx.close();
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const mpage = await mctx.newPage();
  await mpage.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
  await mpage.waitForTimeout(2000);
  const mel = mpage.locator('#puente').first();
  const mbox = await mel.boundingBox();
  await mpage.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), mbox.y);
  await mpage.waitForTimeout(2000);
  const mfull = await mel.boundingBox();
  await mpage.screenshot({
    path: '/tmp/screen-bridge-mobile.png',
    clip: { x: 0, y: 0, width: 390, height: Math.min(mfull.height + 40, 1800) },
  });
  console.log('ok bridge-mobile', mfull.height);

  await browser.close();
})();
