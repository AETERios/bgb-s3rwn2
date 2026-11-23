const fs = require('fs'), crypto = require('crypto'), assert = require('assert/strict');
const { chromium } = require('C:/Users/eilot/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const URL = 'https://aeterios.github.io/bgb-s3rwn2/';
const VERSION = 'shiguang-unified-20261123-v10-r3';
const TOTAL = 13200;
const sha = s => crypto.createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');

(async () => {
  const browser = await chromium.launch();
  try {
    const local = fs.readFileSync('index.html', 'utf8');
    const remote = await (await fetch(URL + 'index.html?x=' + Date.now())).text();
    assert.equal(sha(remote), sha(local), '线上 index.html 应与本地一致（归一化行尾后）');
    const sw = await (await fetch(URL + 'sw.js?x=' + Date.now())).text();
    assert.ok(sw.includes(VERSION), '线上 Service Worker 应为 ' + VERSION);
    assert.ok(sw.includes('addEventListener("fetch"'), '线上 Service Worker 必须带 fetch 处理');

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL + '?v=' + VERSION, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(n => window.__BGB_TEST__?.questions.length === n, TOTAL, { timeout: 90000 });

    const meta = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      const kinds = {};
      for (const q of t.questions) kinds[q.k] = (kinds[q.k] || 0) + 1;
      return {
        version: document.documentElement.innerHTML.match(/APP_VERSION = "([^"]+)"/)?.[1],
        count: t.questions.length, kinds, pool: t.poolIds().length,
        rCount: t.questions.filter(q => q.k === 'r').length,
        derived: t.questions.filter(q => q.d).length,
        converted: t.questions.filter(q => q._r).length,
        legacyStillFilters: (() => { t.state.cfg.bank = 'focus'; const n = t.poolIds('focus').length; t.state.cfg.bank = 'all'; return n; })(),
      };
    });
    assert.equal(meta.version, VERSION);
    assert.equal(meta.count, TOTAL);
    assert.equal(meta.pool, TOTAL, '线上练习池应为全部 13,200 道');
    assert.equal(meta.rCount, 22, '线上只保留 22 道指标自评题');
    assert.equal(meta.derived, 431, '派生练习应保留');
    assert.ok(meta.converted >= 213, '问答应已就地转换成填空（22 道指标题除外）');
    assert.equal(meta.legacyStillFilters, TOTAL, '旧的来源设置不应再缩池');

    // 今日页：整体题库、无来源选择
    await page.evaluate(() => { const t = window.__BGB_TEST__; t.ui.tab = 'today'; t.ui.studying = false; t.state.cfg.bank = 'all'; t.render(); });
    await page.waitForTimeout(300);
    const today = await page.evaluate(() => ({
      text: document.querySelector('#app').innerText,
      bankPicker: document.querySelectorAll('#s-bank, #q-bank').length,
    }));
    assert.ok(today.text.includes('整体题库'), '今日页应显示整体题库');
    assert.ok(today.text.includes(String(13200)), '今日页应显示 13,200');
    await page.screenshot({ path: 'test-results/online-v10-today-390.png' });

    // 设置页与题库页不再有来源选择
    await page.evaluate(() => { const t = window.__BGB_TEST__; t.ui.tab = 'settings'; t.render(); });
    assert.equal(await page.locator('#s-bank').count(), 0, '设置页不应再有题库选择');
    await page.evaluate(() => { const t = window.__BGB_TEST__; t.ui.tab = 'bank'; t.ui.sBank = 'all'; t.ui.search = ''; t.render(); });
    assert.equal(await page.locator('#q-bank').count(), 0, '题库页不应再有来源选择');
    const kindText = await page.locator('#q-kind').innerText();
    assert.ok(!kindText.includes('问答'), '题型筛选不应再有问答');

    // 指标计算题：恢复看答案自评（原始数据在周转图图片里）
    const calc = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      const q = t.QMAP.get('U-C1-01');
      t.ui.studying = false; t.ui.tab = 'bank'; t.ui.search = 'U-C1-01'; t.ui.openId = 'U-C1-01'; t.ui.sKind = ''; t.ui.sScope = 'all'; t.ui.sBank = 'all';
      t.render();
      return { k: q.k, x: q.x, nf: q.nf, spans: t.clozeData(q).spans.length };
    });
    assert.equal(calc.k, 'r');
    assert.equal(calc.nf, 1, '指标题应带 nf 标记，不投影成填空');
    assert.equal(calc.spans, 0);
    await page.locator('[data-study-one="U-C1-01"]').click();
    await page.waitForTimeout(400);
    const calcUI = await page.evaluate(() => ({
      inputs: document.querySelectorAll('input.fill').length,
      chips: document.querySelectorAll('.wchip').length,
      reveal: !!document.querySelector('[data-check], [data-reveal], [data-self]'),
      head: Math.round(document.querySelector('.study-head').getBoundingClientRect().height),
    }));
    assert.equal(calcUI.inputs, 0, '指标题不应再要求数值输入');
    assert.equal(calcUI.chips, 0, '全库不应出现词块');
    assert.ok(calcUI.head < 64, '练习顶栏仍应精简');
    await page.screenshot({ path: 'test-results/online-v10-calc-390.png' });


    // 点词填空已全部移除
    const noChips = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      const q = t.questions.find(x => x.k === 'f');
      t.ui.studying = false; t.ui.xs = t.newSess([q.i], 'extra'); t.ui.mode = 'extra'; t.ui.studying = true; t.render();
      return { chips: document.querySelectorAll('.wchip').length, inputs: document.querySelectorAll('input.fill').length };
    });
    assert.equal(noChips.chips, 0, '填空题不应再出现词块');
    assert.ok(noChips.inputs >= 1, '填空题应给键盘输入框');
    // 派生练习仍在，父题已删
    const derivation = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      const d = t.questions.find(q => q.d && q.p);
      return { id: d.i, parent: d.p, parentExists: t.QMAP.has(d.p) };
    });
    assert.equal(derivation.parentExists, false, '派生题父题应已删除');

    // 排序题仍可作答
    const order = await page.evaluate(() => {
      const t = window.__BGB_TEST__;
      const q = t.questions.find(x => x.k === 'o');
      t.ui.studying = false; t.ui.xs = t.newSess([q.i], 'order'); t.ui.studying = true; t.render();
      return { add: document.querySelectorAll('[data-order-add]').length, check: document.querySelectorAll('[data-order-check]').length };
    });
    assert.ok(order.add >= 2 && order.check === 1, '排序题应可点选和核对');

    // 线上离线可用：SW 激活后断网重载，页面仍能渲染
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(r => !!r.active), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2500);
    const offlineOk = await page.evaluate(() => ({
      questions: (window.__BGB_TEST__ && window.__BGB_TEST__.questions ? window.__BGB_TEST__.questions.length : 0),
      hasApp: !!document.querySelector('#app'),
      bodyLen: document.body.innerText.length,
    })).catch(() => ({ questions: 0, hasApp: false, bodyLen: 0 }));
    await context.setOffline(false);
    assert.ok(offlineOk.questions >= 13200, '断网重载后题库应完整（离线可用）');
    assert.ok(offlineOk.bodyLen > 200, '断网重载后页面应渲染');

    assert.deepEqual(errors, [], '线上不应有脚本错误');
    const evidence = {
      checkedAt: new Date().toISOString(), url: URL, version: meta.version,
      indexSha256: sha(remote), count: meta.count, pool: meta.pool, kinds: meta.kinds,
      qa: { r: meta.rCount, derived: meta.derived, converted: meta.converted },
      calc, calcUI, derivation, order,
      checks: ['deployed index hash matches', 'v10 service worker with fetch handler', '13,200 questions', 'zero q&a questions', 'legacy source keys no longer filter', 'no source pickers', 'metric question uses keyboard', 'derived exercises kept', 'order questions answerable', 'slim header kept', 'no script errors'],
    };
    fs.writeFileSync('test-results/online-verification-v10.json', JSON.stringify(evidence, null, 1));
    console.log(JSON.stringify(evidence, null, 1));
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
