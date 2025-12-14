const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('http://localhost:3001');
  await page.evaluate(() => window.scrollTo(0, 850));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'check.png' });
  await browser.close();
})();
