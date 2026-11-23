// 完整 UI 流程：自己选空 → 保存 → 刷新 → 是否保留
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__BGB_TEST__?.questions.length === 13200, null, { timeout: 60000 });

  // 找一道问答投影题直接进练习
  const target = await page.evaluate(() => {
    const t = window.__BGB_TEST__;
    const q = t.questions.find(x => x._r && x.k === 'f' && !x.nf);
    t.state.cfg.bank = 'all'; t.ui.xs = t.newSess([q.i], 'extra'); t.ui.mode = 'extra'; t.enterStudy(); t.render();
    return { id: q.i, autoSpans: t.clozeData(t.studyQuestion(t.QMAP.get(q.i))).spans.length, textLen: t.clozeData(t.studyQuestion(t.QMAP.get(q.i))).text.length };
  });
  console.log('target:', JSON.stringify(target));

  // 点「挖得不对？自己选」
  await page.locator('[data-edit-cloze]').click();
  await page.waitForTimeout(300);
  const editInfo = await page.evaluate(() => {
    const t = window.__BGB_TEST__;
    const c = t.ui.card;
    // 清空默认标记，手动选一段：第 5~15 字
    c.edit.marks = [];
    c.edit.pick = null;
    c.edit.marks = [[6, 16]];
    return { marks: c.edit.marks, text: c.edit.text.slice(6, 16) };
  });
  console.log('edit:', JSON.stringify(editInfo));
  await page.locator('[data-cloze-save]').click();
  await page.waitForTimeout(3200); // 等 flush

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('jidiao-bgb-app-v1');
    const st = JSON.parse(raw || '{}');
    return { clozeKeys: Object.keys(st.cfg?.clozes || {}) };
  });
  console.log('saved:', JSON.stringify(saved));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__BGB_TEST__?.questions.length === 13200, null, { timeout: 60000 });
  const after = await page.evaluate((id) => {
    const t = window.__BGB_TEST__;
    const q = t.studyQuestion(t.QMAP.get(id));
    const d = t.clozeData(q);
    return { custom: d.custom, spans: d.spans.map(sp => d.text.slice(sp.s, sp.e)), raw: t.state.cfg.clozes[id] };
  }, target.id);
  console.log('after reload:', JSON.stringify(after));

  // 跨版本场景：文本变了（前面多了前缀），保存的偏移应按内容重新定位
  const reanchor2 = await page.evaluate((id) => {
    const t = window.__BGB_TEST__;
    const q = t.studyQuestion(t.QMAP.get(id));
    const cur = t.clozeData(q);
    const curMarks = cur.spans.map(sp => [sp.s, sp.e]);
    const mutated = '【新版说明】' + cur.text;
    t.state.cfg.clozes[id] = { v: 2, m: curMarks, x: mutated };
    const d = t.clozeData(q);
    return { custom: d.custom, frags: d.spans.map(sp => d.text.slice(sp.s, sp.e)) };
  }, target.id);
  console.log('reanchor:', JSON.stringify(reanchor2));
  console.log('pageerrors:', errors);
  await browser.close();
  server.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
