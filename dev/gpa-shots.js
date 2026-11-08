// Shoot the GPA looks (looks-gpa branch only, never deployed). WebKit, 390 x 844 @2x, light and dark.
// usage: node dev/gpa-shots.js <baseURL> <outDir> [look ...]     looks: cur 1 2 3 (default all)
// Writes <outDir>/<look>/<state>-<L|D>.png and prints each screen's text (light only).
// Mid motion stills load with ?slow=6 so the frame lands mid count up / mid flip.
const { webkit } = require('/Users/todismacbook/bin/whatsapp_agent/node_modules/playwright');
const fs = require('fs');
const [base, out, ...only] = process.argv.slice(2);
const LOOKS = only.length ? only : ['cur', '1', '2', '3'];
const SLOW = 6;

async function openGpa(page, query) {
  await page.goto(base + '/?' + query);
  await page.waitForTimeout(300);
  await page.evaluate(() => { gradeApp.actions.signIn(); gradeApp.render(); });
  await page.waitForTimeout(1800);
  await page.evaluate(() => { gradeApp.state.tab = 'grades'; gradeApp.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-action="openPage"][data-x="gpa"]');
}
const text = async (page, sel = '#main') => (await page.innerText(sel)).replace(/\n+/g, ' | ');
const sheetText = page => text(page, '.sheet');

(async () => {
  const browser = await webkit.launch();
  for (const look of LOOKS) {
    const dir = `${out}/${look === 'cur' ? 'current' : 'look' + look}`;
    fs.mkdirSync(dir, { recursive: true });
    const q = look === 'cur' ? '' : 'gpa=' + look;
    for (const [scheme, tag] of [['light', 'L'], ['dark', 'D']]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
      const page = await ctx.newPage();
      page.on('pageerror', e => console.log(look, tag, 'pageerror', e.message));
      page.on('console', m => { if (m.type() === 'error') console.log(look, tag, 'console', m.text()); });
      const shot = async (name, opts = {}) => page.screenshot({ path: `${dir}/${name}-${tag}.png`, ...opts });
      const log = async (name, sel) => { if (tag === 'L') console.log(`[${look}] ${name}:`, await text(page, sel)); };
      const scrollShots = async name => {
        const { sh, ch } = await page.evaluate(() => { const m = document.querySelector('#main'); return { sh: m.scrollHeight, ch: m.clientHeight }; });
        if (sh > ch + 40) {
          await page.evaluate(() => { const m = document.querySelector('#main'); m.scrollTop = m.scrollHeight; });
          await page.waitForTimeout(250);
          await shot(name + '-scrolled');
          await page.evaluate(() => { document.querySelector('#main').scrollTop = 0; });
          await page.waitForTimeout(100);
        }
      };

      await openGpa(page, q);
      await page.waitForTimeout(2400);
      await shot('1-main');
      await log('main');
      await scrollShots('1-main');

      if (look === 'cur') {
        await page.evaluate(() => { gradeApp.actions.openPage('gpaWhatIf'); gradeApp.actions.setGpaWhatIfLetter('A', 'span'); gradeApp.render(); });
        await page.waitForTimeout(300); await shot('2-whatif'); await log('whatif');
        await page.evaluate(() => { gradeApp.actions.back(); gradeApp.actions.openPage('need'); gradeApp.render(); });
        await page.waitForTimeout(300); await shot('3-need'); await log('need');
        await page.evaluate(() => { gradeApp.actions.back(); gradeApp.actions.openPage('gpaGoal'); gradeApp.render(); });
        await page.waitForTimeout(300); await shot('4-goal'); await log('goal');
        await page.evaluate(() => { gradeApp.state.gpaGoal = '4.5'; gradeApp.render(); });
        await page.waitForTimeout(300); await shot('5-goal-out'); await log('goal out');
        await ctx.close();
        continue;
      }

      // What if: Spanish II to an A (+0.14).
      if (look === '1') {
        await page.click('[data-action="gpaPick"][data-x="span"]');
        await page.waitForTimeout(400);
        await page.click('.gl-pick [data-action="gpaSetLetter"][data-x="A"]');
        await page.waitForTimeout(900);
        await shot('2-whatif'); await log('whatif');
      } else if (look === '2') {
        await page.click('.gl-bigchip[data-x="span"]');
        await page.waitForTimeout(500);
        await shot('3-need'); if (tag === 'L') console.log('[2] need sheet:', await sheetText(page));
        await page.click('.sheet [data-action="gpaSetLetter"][data-x="A"]');
        await page.waitForTimeout(900);
        await shot('2-whatif-sheet'); if (tag === 'L') console.log('[2] whatif sheet:', await sheetText(page));
        await page.click('.sheet [data-action="closeSheet"]');
        await page.waitForTimeout(400);
        await shot('2-whatif'); await log('whatif');
        await page.click('[data-action="gpaMore"]');
        await page.waitForTimeout(900);
        await shot('6-more'); await log('more');
        await scrollShots('6-more');
        await page.click('[data-action="gpaMore"]');
        await page.click('[data-action="gpaReset"]');
        await page.waitForTimeout(600);
      } else {
        await page.click('.gl-dots [data-x="1"]');
        await page.waitForTimeout(1600);
        await shot('2-whatif-page');
        await page.click('.gl-lchip[data-x="span"]');
        await page.waitForTimeout(400);
        await page.click('.gl-pick [data-action="gpaSetLetter"][data-x="A"]');
        await page.waitForTimeout(900);
        await shot('2-whatif'); await log('whatif', '.gl-page:nth-child(2)');
        await page.click('.gl-dots [data-x="0"]');
        await page.waitForTimeout(1600);
        await page.waitForTimeout(200);
      }

      // What do I need sheet (look 2 shot it above): tap AP World's row, then Algebra II's.
      if (look !== '2') {
        await page.evaluate(() => { gradeApp.actions.gpaReset(); gradeApp.render(); });
        await page.waitForTimeout(500);
        await page.click(look === '1' ? '.gl1 .row[data-x="hist"] .grow' : '.gl-page:nth-child(1) .row[data-x="hist"] .t');
        await page.waitForTimeout(500);
        await shot('3-need'); if (tag === 'L') console.log(`[${look}] need sheet:`, await sheetText(page));
        await page.click('.sheet [data-action="closeSheet"]');
        await page.waitForTimeout(300);
        await page.click(look === '1' ? '.gl1 .row[data-x="alg"] .grow' : '.gl-page:nth-child(1) .row[data-x="alg"] .t');
        await page.waitForTimeout(500);
        await shot('3-need-alg'); if (tag === 'L') console.log(`[${look}] need alg:`, await sheetText(page));
        await page.click('.sheet [data-action="closeSheet"]');
        await page.waitForTimeout(300);
      }

      // Goal: reachable 4.3, then out of reach 4.5.
      if (look === '3') {
        await page.click('.gl-dots [data-x="2"]');
      } else {
        await page.click('[data-action="openPage"][data-x="gpaGoal"]');
      }
      await page.waitForTimeout(1600);
      await shot('4-goal'); await log('goal', look === '3' ? '.gl-page:nth-child(3)' : '#main');
      await page.evaluate(() => {
        const input = document.querySelector('.gl-range');
        input.value = '4.5';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForTimeout(300);
      await shot('5-goal-out'); await log('goal out', look === '3' ? '.gl-page:nth-child(3)' : '#main');
      await page.evaluate(() => {
        const input = document.querySelector('.gl-range');
        input.value = '4.3';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await ctx.close();

      // ---- Mid motion stills (slow motion) ----
      const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
      const p2 = await ctx2.newPage();
      p2.on('pageerror', e => console.log(look, tag, 'pageerror', e.message));
      const shot2 = name => p2.screenshot({ path: `${dir}/${name}-${tag}.png` });
      await openGpa(p2, q + '&slow=' + SLOW);
      await p2.waitForTimeout(look === '2' ? 1500 : 1000);
      await shot2('7-mid-countup');
      await p2.waitForTimeout(look === '2' ? 9000 : 5000);
      // Letter flip mid crossfade (+ the number mid tween).
      if (look === '1') {
        await p2.click('[data-action="gpaPick"][data-x="span"]');
        await p2.waitForTimeout(1600);
        await p2.click('.gl-pick [data-action="gpaSetLetter"][data-x="A"]');
      } else if (look === '2') {
        await p2.click('.gl-bigchip[data-x="span"]');
        await p2.waitForTimeout(1600);
        await p2.click('.sheet [data-action="gpaSetLetter"][data-x="A"]');
      } else {
        await p2.click('.gl-dots [data-x="1"]');
        await p2.waitForTimeout(9000);
        await p2.click('.gl-lchip[data-x="span"]');
        await p2.waitForTimeout(1600);
        await p2.click('.gl-pick [data-action="gpaSetLetter"][data-x="A"]');
      }
      await p2.waitForTimeout(560);
      await shot2('8-mid-flip');
      if (look === '3') {
        // Half swipe: from What if, drag about 45% back toward Now and hold.
        await p2.evaluate(() => { gradeApp.actions.gpaReset(); gradeApp.render(); });
        await p2.waitForTimeout(3000);
        const box = await p2.locator('.gl-page:nth-child(2) .gl-lchips').boundingBox();
        const y = box.y + box.height / 2;
        await p2.mouse.move(110, y);
        await p2.mouse.down();
        for (let x = 110; x <= 285; x += 7) { await p2.mouse.move(x, y + 2); await p2.waitForTimeout(16); }
        await p2.waitForTimeout(400);
        await shot2('9-mid-swipe');
        await p2.mouse.up();
        await p2.waitForTimeout(400);
      }
      await ctx2.close();
    }
  }
  await browser.close();
})();
