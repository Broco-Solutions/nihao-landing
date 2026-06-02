const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 8943);
  });
  await page.waitForTimeout(1500);

  // Find the cards row and capture it
  const box = await page.evaluate(() => {
    const lis = document.querySelectorAll("#sourcing ol li");
    if (!lis.length) return null;
    const first = lis[0].getBoundingClientRect();
    const last = lis[lis.length - 1].getBoundingClientRect();
    return { x: 0, y: first.top, width: 1440, height: last.bottom - first.top + 20 };
  });

  if (box) {
    await page.screenshot({ path: "/tmp/screen-sourcing-row.png", clip: box });
    console.log("ok row crop", box);
  }

  // Also capture a hover state
  await page.hover("#sourcing ol li:nth-child(3)");
  await page.waitForTimeout(600);
  if (box) {
    await page.screenshot({ path: "/tmp/screen-sourcing-hover.png", clip: box });
    console.log("ok hover crop");
  }

  await browser.close();
})();
