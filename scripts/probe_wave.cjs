/* 波浪动画连续性探针：按帧采样两层浪的 translateX，找“回跳”
   用法：node scripts/probe_wave.cjs [url]
   输出每个波的采样轨迹统计 + 最大的相邻帧位移（正常情况下应很小） */
const { chromium } = require('playwright-core');
const CHROME = 'C://Users//Y//.agent-browser//browsers//chrome-153.0.8010.52//chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8021/';

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(URL + (URL.includes('?') ? '&' : '?') + 't=' + Date.now(), { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000); // 等入场动画结束

  const res = await p.evaluate(async () => {
    const els = { wave1: document.getElementById('hWave1'), wave2: document.getElementById('hWave2') };
    const tx = (el) => {
      const m = getComputedStyle(el).transform;
      if (m === 'none') return 0;
      const parts = m.match(/matrix\(([^)]+)\)/);
      return parts ? parseFloat(parts[1].split(',')[4]) : 0;
    };
    const out = { wave1: [], wave2: [] };
    const t0 = performance.now();
    await new Promise((done) => {
      const step = () => {
        const t = performance.now() - t0;
        out.wave1.push([t, tx(els.wave1)]);
        out.wave2.push([t, tx(els.wave2)]);
        if (t < 12000) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    const analyse = (arr) => {
      let maxJump = 0,
        at = 0;
      for (let i = 1; i < arr.length; i++) {
        const d = Math.abs(arr[i][1] - arr[i - 1][1]);
        if (d > maxJump) {
          maxJump = d;
          at = arr[i][0];
        }
      }
      return {
        samples: arr.length,
        first: +arr[0][1].toFixed(1),
        last: +arr[arr.length - 1][1].toFixed(1),
        maxJumpPx: +maxJump.toFixed(1),
        maxJumpAtMs: Math.round(at),
        fps: Math.round(arr.length / 12),
      };
    };
    return { wave1: analyse(out.wave1), wave2: analyse(out.wave2) };
  });
  console.table(res);
  await b.close();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
