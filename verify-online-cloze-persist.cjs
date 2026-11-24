// 决定性验证：线上真实环境，走完整 UI「选空→保存→彻底关浏览器→重开」，确认自定义挖空是否持久化
const { chromium } = require('C:/Users/eilot/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const URL = 'https://aeterios.github.io/bgb-s3rwn2/';

(async () => {
  const context = await chromium.launchPersistentContext(
    'C:/Users/eilot/Documents/Codex/2026-11-02/wo/work/bgb-s3rwn2/.pw-profile-cloze',
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
  );
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__BGB_TEST__?.questions.length === 13200, null, { timeout: 60000 });

  // 找一道填空投影题直接进练习
  const target = await page.evaluate(() => {
    const t = window.__BGB_TEST__;
    const q = t.questions.find(x => x._r && x.k === 'f' && !x.nf);
    t.state.cfg.bank = 'all'; t.ui.xs = t.newSess([q.i], 'extra'); t.ui.mode = 'extra'; t.enterStudy(); t.render();
    return { id: q.i, appVersion: window.__BGB_TEST__ ? 'loaded' : 'none' };
  });
  console.log('target:', JSON.stringify(target));

  // 点「挖得不对？自己选」
  await page.locator('[data-edit-cloze]').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const t = window.__BGB_TEST__; const c = t.ui.card;
    c.edit.marks = []; c.edit.pick = null; c.edit.marks = [[6, 16]];
  });
  const frag = await page.evaluate(() => { const c = window.__BGB_TEST__.ui.card; return c.edit.text.slice(6, 16); });
  console.log('will mark frag:', frag);
  await page.locator('[data-cloze-save]').click();
  await page.waitForTimeout(500); // 只等半秒，模拟用户立刻退出

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('jidiao-bgb-app-v1');
    const st = JSON.parse(raw || '{}');
    const k = Object.keys(st.cfg?.clozes || {});
    return { keys: k, detail: k.map(id => st.cfg.clozes[id]) };
  });
  console.log('after save (0.5s):', JSON.stringify(saved));

  // 彻底关闭浏览器（context.close）模拟用户关掉 App
  await context.close();

  // 重新打开同一个 profile
  const context2 = await chromium.launchPersistentContext(
    'C:/Users/eilot/Documents/Codex/2026-11-02/wo/work/bgb-s3rwn2/.pw-profile-cloze',
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
  );
  const page2 = context2.pages()[0] || await context2.newPage();
  const errors2 = [];
  page2.on('pageerror', e => errors2.push(e.message));
  await page2.goto(URL, { waitUntil: 'domcontentloaded' });
  await page2.waitForFunction(() => window.__BGB_TEST__?.questions.length === 13200, null, { timeout: 60000 });

  const after = await page2.evaluate((id) => {
    const t = window.__BGB_TEST__;
    const q = t.studyQuestion(t.QMAP.get(id));
    const d = t.clozeData(q);
    return {
      clozesKeys: Object.keys(t.state.cfg.clozes || {}),
      custom: d.custom,
      spans: d.spans.map(sp => d.text.slice(sp.s, sp.e)),
      raw: t.state.cfg.clozes[id]
    };
  }, target.id);
  console.log('after reopen:', JSON.stringify(after));
  console.log('pageerrors1:', errors, 'pageerrors2:', errors2);
  await context2.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
