const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const url = process.argv[2] || 'http://localhost:3000/';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: '/tmp/screen-fold.png', fullPage: false });
  console.log('ok fold');

  const sections = [
    { id: 'puente', name: 'bridge' },
    { id: 'problema', name: 'problem' },
    { id: 'metodo', name: 'method' },
    { id: 'servicios', name: 'services' },
    { id: 'canton', name: 'canton' },
    { id: 'sourcing', name: 'sourcing' },
    { id: 'diferencial', name: 'differ' },
    { id: 'webinars', name: 'workshops' },
    { id: 'academy', name: 'academy' },
    { id: 'testimonios', name: 'test' },
    { id: 'faq', name: 'faq' },
    { id: 'contacto', name: 'cta' },
  ];

  for (const s of sections) {
    try {
      await page.evaluate((id) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
      }, s.id);
      await page.waitForTimeout(350);
      await page.evaluate(() => window.scrollBy(0, -96));
      await page.waitForTimeout(900);
      await page.screenshot({ path: `/tmp/screen-${s.name}.png` });
      const info = await page.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return { found: false };
        const r = el.getBoundingClientRect();
        return {
          found: true,
          top: Math.round(r.top),
          absTop: Math.round(r.top + window.scrollY),
          height: Math.round(r.height),
          scrollY: Math.round(window.scrollY),
        };
      }, s.id);
      console.log(`${s.name}:`, JSON.stringify(info));
    } catch (e) {
      console.log('skip', s.name, e.message);
    }
  }

  await browser.close();
})();
