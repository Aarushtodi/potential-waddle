// Shoot design variants side by side (looks worktree only, never deployed).
// usage: node dev/looks-shots.js <baseURL> <outDir> <name>=<query> [...]
//   home-a=home=a          -> home-a-L.png, home-a-D.png (+ -L-scrolled / -D-scrolled when Home runs long)
//   slides-1=slides=1      -> slides-1-1-L.png ... slides-1-3-D.png (names starting with "slides" shoot the intro)
//   cal-a=home=a&tab=calendar  -> opens a tab after sign in (&page=missingEffect pushes a page)
const { webkit } = require('/Users/todismacbook/bin/whatsapp_agent/node_modules/playwright');
const [base, out, ...jobs] = process.argv.slice(2);

(async () => {
  const browser = await webkit.launch();
  for (const job of jobs) {
    const [name, query = ''] = job.split(/=(.*)/s);
    const tab = new URLSearchParams(query).get('tab');
    for (const [scheme, tag] of [['light', 'L'], ['dark', 'D']]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
      const page = await ctx.newPage();
      page.on('pageerror', e => console.log(name, tag, 'pageerror', e.message));
      page.on('console', m => { if (m.type() === 'error') console.log(name, tag, 'console', m.text()); });
      await page.goto(base + '/?' + query);
      await page.waitForTimeout(400);
      if (name.startsWith('slides')) {
        for (let i = 0; i < 3; i++) {
          await page.evaluate(n => { gradeApp.state.introSlide = n; gradeApp.render(); }, i);
          await page.waitForTimeout(700);
          await page.evaluate(() => gradeApp.render()); // same slide again: lands without the slide animation
          await page.waitForTimeout(300);
          await page.screenshot({ path: `${out}/${name}-${i + 1}-${tag}.png`, animations: 'disabled' });
          if (tag === 'L') console.log(`${name}-${i + 1}:`, (await page.innerText('.intro-slide[aria-hidden=false]')).replace(/\n+/g, ' | '));
        }
        await ctx.close();
        continue;
      }
      await page.evaluate(() => { gradeApp.actions.signIn(); gradeApp.render(); });
      await page.waitForTimeout(1800);
      if (tab) { await page.evaluate(t => { gradeApp.state.tab = t; gradeApp.render(); }, tab); await page.waitForTimeout(300); }
      const pageName = new URLSearchParams(query).get('page');
      if (pageName) { await page.evaluate(n => { gradeApp.actions.openPage(n); gradeApp.render(); }, pageName); await page.waitForTimeout(300); }
      await page.screenshot({ path: `${out}/${name}-${tag}.png`, animations: 'disabled' });
      const { scrollHeight, clientHeight } = await page.evaluate(() => {
        const m = document.querySelector('#main'); return { scrollHeight: m.scrollHeight, clientHeight: m.clientHeight };
      });
      if (scrollHeight > clientHeight + 40) {
        await page.evaluate(() => { const m = document.querySelector('#main'); m.scrollTop = m.scrollHeight; });
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${out}/${name}-${tag}-scrolled.png`, animations: 'disabled' });
      }
      if (tag === 'L') console.log(name, ':', (await page.innerText('#main')).replace(/\n+/g, ' | ').slice(0, 700));
      await ctx.close();
    }
  }
  await browser.close();
})();
