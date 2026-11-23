// 验证：自定义挖空保存 → 刷新 → 是否还在；并测 localStorage 配额
const { chromium } = require('C:/Users/eilot/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = 'C:/Users/eilot/Documents/Codex/2026-11-02/wo/work/bgb-s3rwn2';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  try { const b = fs.readFileSync(f); res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(b); }
  catch (e) { res.writeHead(404); res.end('nf'); }
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__BGB_TEST__?.questions.length === 13200, null, { timeout: 60000 });

  // 模拟大量学习记录，接近真实用户状态
  const sizeInfo = await page.evaluate(() => {
    const t = window.__BGB_TEST__;
    // 随便造几千条学习记录，模拟老用户
    for (let i = 0; i < 6000; i++) {
      const q = t.questions[i];
      t.state.recs[q.i] = [Date.now() - i * 60000, 2, 0, 0, 2, Date.now()];
    }
    // 选一道转换题（问答→原文填空）做自定义挖空
    const q = t.questions.find(x => x._r && x.k === 'f' && !x.nf);
    const d = t.clozeData(q);
    const mid = Math.floor(d.text.length / 2);
    // 在中段找一段 6~14 字的自定义空
    let s = mid, e = Math.min(d.text.length, mid + 8);
    t.state.cfg.clozes = t.state.cfg.clozes || {};
    t.state.cfg.clozes[q.i] = { v: 1, m: [[s, e]] };
    t.markCfg();
    return { id: q.i, jsonLen: JSON.stringify(t.state).length };
  });
  console.log('state json length:', sizeInfo.jsonLen);
  await page.waitForTimeout(3200); // 等 flush 写入

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('jidiao-bgb-app-v1');
    return { rawLen: raw ? raw.length : 0, hasCloze: !!(JSON.parse(raw || '{}').cfg?.clozes && Object.keys(JSON.parse(raw).cfg.clozes).length) };
  });
  console.log('after save:', JSON.stringify(saved));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__BGB_TEST__?.questions.length === 13200, null, { timeout: 60000 });
  const after = await page.evaluate((id) => {
    const t = window.__BGB_TEST__;
    const q = t.QMAP.get(id);
    const d = t.clozeData(q);
    return { clozes: Object.keys(t.state.cfg.clozes || {}).length, custom: d.custom, spans: d.spans.length };
  }, sizeInfo.id);
  console.log('after reload:', JSON.stringify(after));
  console.log('pageerrors:', errors);
  await browser.close();
  server.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
