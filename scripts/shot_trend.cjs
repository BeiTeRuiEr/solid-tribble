/* 趋势图核对脚本：截图 + 打印缺失日标记、tooltip 文案
   用法：NODE_PATH=… node scripts/shot_trend.cjs
   SHOT_URL 默认本地 8021；SHOT_NAME 控制输出文件名后缀 */
const { chromium } = require('playwright-core');
const CHROME = 'C://Users//Y//.agent-browser//browsers//chrome-153.0.8010.52//chrome.exe';
const OUT = 'C:/Users/Y/WorkBuddy/2026-09-18-09-25-19/bi-dashboard/recon/';
const URL = process.env.SHOT_URL || 'http://127.0.0.1:8021/?static=1';
const NAME = process.env.SHOT_NAME || 'trend';

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await p.goto(URL + (URL.includes('?') ? '&' : '?') + 't=' + Date.now(), { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);

  const sec = await p.$('#trendSvg');
  const svgBox = await sec.boundingBox();
  const panel = await p.evaluateHandle(() => document.querySelector('#trendSvg').closest('section'));
  await panel.asElement().screenshot({ path: OUT + 'trend_' + NAME + '.png' });

  const info = await p.evaluate(() => ({
    gaps: [...document.querySelectorAll('#tGap .gap-dot')].map((c) => ({
      cx: +c.getAttribute('cx'),
      cy: +c.getAttribute('cy'),
    })),
    has: (window.__HAS || null),
    ticks: [...document.querySelectorAll('#tGrid text')].map((t) => t.textContent),
  }));
  console.log('gap dots:', JSON.stringify(info.gaps));

  /* 依次把鼠标停在后 4 个点上，记录 tooltip 文案 */
  const line = [];
  for (const frac of [0.72, 0.8, 0.88, 0.96]) {
    await p.mouse.move(svgBox.x + svgBox.width * frac, svgBox.y + svgBox.height * 0.55);
    await p.waitForTimeout(260);
    const t = await p.evaluate(() => {
      const tip = document.getElementById('tip');
      return tip && tip.style.display !== 'none' ? tip.innerText.replace(/\n/g, ' | ') : '(none)';
    });
    line.push(frac.toFixed(2) + ' → ' + t);
    if (frac === 0.96) {
      const box = await p.evaluate(() => {
        const r = document.querySelector('#trendSvg').closest('section').getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      await p.screenshot({ path: OUT + 'trend_' + NAME + '_tip.png', clip: box });
    }
  }
  console.log(line.join('\n'));
  await b.close();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
