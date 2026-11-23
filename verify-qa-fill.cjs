const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('C:/Users/eilot/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = __dirname;
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html', file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => window.__BGB_TEST__?.questions.length === 13466);

    const info = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      const rs = t.questions.filter(q => q.k === 'r');
      let fillable = 0, spanLens = [];
      for (const q of rs) { const sp = t.rKeySpan(q); if (sp) { fillable++; spanLens.push(sp.e - sp.s); } }
      return { total: rs.length, fillable, minSpan: Math.min(...spanLens), maxSpan: Math.max(...spanLens), pool: t.poolIds().length };
    });
    console.log('R INFO', JSON.stringify(info));
    assert.equal(info.fillable, info.total, 'every Q&A question must yield an answerable span');
    assert.equal(info.pool, 13466, 'the practice pool keeps all questions');

    // 找一道问答开始学习
    const id = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      const q = t.questions.find(x => x.k === 'r' && String(x.x || '').length > 60);
      t.startExtra('random'); t.ui.xs = t.newSess([q.i], 'qa-fill'); t.render();
      return q.i;
    });
    await page.waitForSelector('.qa-ask');
    const shape = await page.evaluate(() => ({
      ask: document.querySelector('.qa-ask').textContent.slice(0, 40),
      slots: document.querySelectorAll('.blank-slot').length,
      inputs: document.querySelectorAll('input.fill').length,
      chips: document.querySelectorAll('.wchip').length
    }));
    console.log('SHAPE', JSON.stringify(shape));
    assert.ok(shape.slots + shape.inputs >= 1, 'the Q&A card must offer a real blank');

    // 用正确答案判分（点词或输入都覆盖）
    const ok = await page.evaluate(() => {
      const t = window.__BGB_TEST__, c = t.ui.card;
      const want = c.shown.map(i => c.data.spans[i].a);
      if (c.mode === 'word') {
        const bank = t.wordBankFor(t.studyQuestion(t.QMAP.get(c.forId)), c);
        return { mode: c.mode, want, bank: bank.length };
      }
      c.vals = want.slice(); c.checked = false; t.checkCloze(t.studyQuestion(t.QMAP.get(c.forId)), c); t.render();
      return { mode: c.mode, want, allOk: c.allOk };
    });
    console.log('ANSWER', JSON.stringify(ok));
    if (ok.mode === 'type') assert.equal(ok.allOk, true, 'typed correct answer must pass');

    // 自评模式仍可用
    const selfCheck = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      t.state.cfg.objectiveOnly = 0; t.ui.xs = null; t.render();
      const q = t.questions.find(x => x.k === 'r');
      t.startExtra('random'); t.ui.xs = t.newSess([q.i], 'qa-self'); t.ui.studying = true; t.render();
      return { hasAsk: !!document.querySelector('.qa-ask'), hasReveal: !!document.querySelector('[data-reveal]') };
    });
    console.log('SELF', JSON.stringify(selfCheck));
    assert.equal(selfCheck.hasAsk, false, 'self-assessment mode must keep the original Q&A card');
    assert.equal(selfCheck.hasReveal, true);
    assert.deepEqual(errors, []);
    console.log('qa-as-fill verification passed');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
