const { chromium } = require('playwright-core');
const CHROME = 'C://Users//Y//.agent-browser//browsers//chrome-153.0.8010.52//chrome.exe';
const OUT = 'C:/Users/Y/WorkBuddy/2026-09-18-09-25-19/bi-dashboard/recon/';
const URL = process.env.SHOT_URL || 'http://127.0.0.1:8021/?static=1';
const NAME = process.env.SHOT_NAME || 'labels';
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL + '&t=' + Date.now(), { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(2500);
  /* 注意（2026-10-20 修正）：判断是否裁字要用 .t-line 的 clientWidth，
     不能用 .store-label 的内容宽 —— 同一行前面还有色点 .dot，
     .today 实际只拿到 ~128px，而 .t-line 是 overflow:hidden，超了直接裁。 */
  const rows = await p.evaluate(() => {
    return [...document.querySelectorAll('.store-label')].map((el) => {
      const tv = el.querySelector('.t-val');
      if (!tv) return { name: '', val: '', avail: 0, textW: 0, clipped: false };
      const line = tv.closest('.t-line');
      const rg = document.createRange();
      rg.selectNodeContents(tv);
      const rr = rg.getBoundingClientRect();
      return {
        name: (el.querySelector('.name') || {}).textContent || '',
        val: tv.textContent.replace(/\u00a0/g, '·'),
        fontPx: +parseFloat(getComputedStyle(tv).fontSize).toFixed(2),
        avail: line.clientWidth,
        textW: +rr.width.toFixed(1),
        lineW: line.scrollWidth,
        clipped: line.scrollWidth > line.clientWidth + 0.5,
      };
    });
  });
  console.table(rows);
  const one = await p.evaluate(() => {
    const el = document.querySelector('.store-label');
    const r = el.getBoundingClientRect();
    return { x: r.x - 12, y: r.y - 10, width: r.width + 24, height: r.height + 20 };
  });
  await p.screenshot({ path: OUT + NAME + '_one.png', clip: one });
  await p.screenshot({ path: OUT + NAME + '_full.png' });
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
