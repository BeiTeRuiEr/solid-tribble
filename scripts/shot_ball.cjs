const { chromium } = require('playwright-core');
const CHROME = 'C://Users//Y//.agent-browser//browsers//chrome-153.0.8010.52//chrome.exe';
const OUT = 'C:/Users/Y/WorkBuddy/2026-09-18-09-25-19/bi-dashboard/recon/';
const URL = process.env.SHOT_URL || 'http://127.0.0.1:8021/?static=1';
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL + '&t=' + Date.now(), { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(2500);
  const box = await p.evaluate(() => {
    const r = document.querySelector('#heroMod svg').getBoundingClientRect();
    return { x: r.x + r.width * 0.26, y: r.y + r.height * 0.14, width: r.width * 0.48, height: r.height * 0.66 };
  });
  await p.screenshot({ path: OUT + 'ball_' + (process.env.SHOT_NAME || 'local') + '.png', clip: box });
  await p.screenshot({ path: OUT + 'full_' + (process.env.SHOT_NAME || 'local') + '.png' });
  const info = await p.evaluate(() => {
    const w2 = document.getElementById('hWave2');
    const w1 = document.getElementById('hWave1');
    return {
      w2d: w2 ? w2.getAttribute('d').slice(0, 60) : null,
      w1d: w1 ? w1.getAttribute('d').slice(0, 60) : null,
      w2fill: w2 ? w2.getAttribute('fill') : null,
      w2op: w2 ? getComputedStyle(w2).opacity : null,
      w1fill: w1 ? w1.getAttribute('fill') : null,
    };
  });
  console.log(JSON.stringify(info, null, 1));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
