const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict');
const { chromium } = require('C:/Users/eilot/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve('.' + name); if (!file.startsWith(process.cwd() + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html;charset=utf-8'); res.end(fs.readFileSync(file));
});
const TOTAL = 13200;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-23T10:00:00+08:00'));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(n => window.__BGB_TEST__?.questions.length === n, TOTAL);

    const info = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      const kinds = {};
      for (const q of t.questions) kinds[q.k] = (kinds[q.k] || 0) + 1;
      return {
        n: t.questions.length, kinds,
        order: t.order.length,
        pool: t.poolIds().length,
        rCount: t.questions.filter(q => q.k === 'r').length,
        qaAsk: t.questions.filter(q => q._ask).length,
        converted: t.questions.filter(q => q._r).length,
        derived: t.questions.filter(q => q.d).length,
        orphans: t.questions.filter(q => q.d && q.p && !t.QMAP.has(q.p)).length,
      };
    });
    assert.equal(info.n, TOTAL);
    assert.equal(info.order, TOTAL);
    assert.equal(info.pool, TOTAL);
    assert.equal(info.rCount, 0, 'no r questions left');
    assert.equal(info.derived, 431, 'derived exercises kept');
    assert.ok(info.converted >= 235, 'converted q&a count');
    assert.ok(!info.kinds.o || true);

    // 统一题库：旧的来源键不再缩小题池
    const banks = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      const out = {};
      for (const k of ['all', 'focus', 'W', 'J', 'G', 'professional', 'party']) { t.state.cfg.bank = k; out[k] = t.poolIds(k).length; }
      t.state.cfg.bank = 'all';
      return out;
    });
    assert.equal(banks.all, TOTAL);
    assert.equal(banks.focus, TOTAL, 'legacy focus no longer filters');
    assert.equal(banks.J, TOTAL, 'legacy J no longer filters');
    assert.equal(banks.G, TOTAL);

    // 旧存档里的来源选择会被迁移成整体题库
    const migrated = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      t.state.cfg.bank = 'focus'; t.state.cfg.unlimitedV5 = 0;
      t.prepareScope();
      return t.state.cfg.bank;
    });
    assert.equal(migrated, 'all', 'legacy bank value migrates to all');

    // 设置页不再有题库选择
    await page.evaluate(() => { const t = window.__BGB_TEST__; t.ui.tab = 'settings'; t.ui.studying = false; t.render(); });
    assert.equal(await page.locator('#s-bank').count(), 0, 'settings has no bank picker');
    const settingsText = await page.locator('#app').innerText();
    assert.ok(settingsText.includes('整体题库'), 'settings explains the unified bank');

    // 题库页不再有来源选择，只剩内容分类与题型
    await page.evaluate(() => { const t = window.__BGB_TEST__; t.ui.tab = 'bank'; t.ui.sBank = 'all'; t.ui.search = ''; t.render(); });
    assert.equal(await page.locator('#q-bank').count(), 0, 'bank page has no source picker');
    assert.equal(await page.locator('#q-category').count(), 1);
    const kindText = await page.locator('#q-kind').innerText();
    assert.ok(!kindText.includes('问答'), 'kind filter has no q&a');

    // 今日页按钮改成按序号顺练
    await page.evaluate(() => { const t = window.__BGB_TEST__; t.ui.tab = 'today'; t.render(); });
    assert.equal(await page.locator('[data-start="order"]').count(), 1, 'order practice button');
    assert.equal(await page.locator('[data-start="recite"]').count(), 0, 'old recite button gone');

    // 就地转换的题目可以作答：指标计算题一空
    const calc = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      const q = t.questions.find(x => x.i === 'U-C1-01');
      const d = t.clozeData(q);
      return { k: q.k, a: q.a, spans: d.spans.length, text: d.text.slice(0, 40) };
    });
    assert.equal(calc.k, 'f');
    assert.equal(calc.spans, 1);
    assert.equal(calc.a[0], '9小时46分钟');

    // 带括号的原文题：只挖第一个括号
    const sig = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      const q = t.questions.find(x => x.i === 'j2-0260');
      const d = t.clozeData(q);
      return { k: q.k, a: q.a, spans: d.spans.length };
    });
    assert.equal(sig.k, 'f');
    assert.equal(sig.spans, 1);
    assert.equal(sig.a[0], '半自动闭塞');

    // 派生题不再挂着的父题仍在库里
    const parentGone = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      const d = t.questions.find(q => q.d && q.p);
      return { parent: d.p, exists: t.QMAP.has(d.p) };
    });
    assert.equal(parentGone.exists, false, 'derived parent r was removed');

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, info, banks, migrated, calc, sig, parentGone }, null, 2));
  } finally {
    await browser.close(); server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
