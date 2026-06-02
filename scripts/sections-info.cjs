const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const info = await page.evaluate(() => {
    const ids = ["puente","problema","metodo","servicios","canton","sourcing","diferencial","academy","webinars","testimonios","faq","contacto"];
    return ids.map((id) => {
      const el = document.querySelector(`#${id}`);
      if (!el) return { id, missing: true };
      const r = el.getBoundingClientRect();
      return { id, top: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
    });
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
