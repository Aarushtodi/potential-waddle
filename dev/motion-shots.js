// Record the motion round (looks worktree only, never deployed): ?slides=8 and ?home=h4&tour=1.
// usage: node dev/motion-shots.js <baseURL> <outDir>
// Writes stills (end states, light + dark, plus a reduced motion check) and webm videos at iPhone
// size in WebKit; convert the videos to mp4 with ffmpeg afterwards.
const { webkit } = require('/Users/todismacbook/bin/whatsapp_agent/node_modules/playwright');
const fs = require('fs');
const [base, out] = process.argv.slice(2);
const VIEW = { width: 390, height: 844 };

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
  return { ctx, page };
}

/** A finger drag at real speed: one move per frame for ms, then an optional hold, then let go. */
async function realDrag(page, x0, x1, ms, holdMs = 0) {
  await page.mouse.move(x0, 420);
  await page.mouse.down();
  const steps = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + (x1 - x0) * i / steps, 420);
    await page.waitForTimeout(16);
  }
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

const signIn = page => page.evaluate(() => { gradeApp.actions.signIn(); gradeApp.render(); });

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await webkit.launch();

  // ---- Stills ----
  for (const [scheme, tag] of [['light', 'L'], ['dark', 'D']]) {
    let { ctx, page } = await newPage(browser, { colorScheme: scheme });
    await page.goto(base + '/?slides=8');
    for (let i = 0; i < 3; i++) {
      if (i) await page.click('.intro-foot .btn');
      await page.waitForTimeout(2700); // art done playing (slide 3 ends at 2.25 s)
      await page.screenshot({ path: `${out}/slide-${i + 1}-end-${tag}.png` });
    }
    await ctx.close();

    ({ ctx, page } = await newPage(browser, { colorScheme: scheme }));
    await page.goto(base + '/?home=h4&tour=1');
    await page.waitForTimeout(300);
    await signIn(page);
    await page.waitForSelector('.tour-card.in', { timeout: 6000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/tour-step-1-${tag}.png` });
    await page.click('.tour-go');
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${out}/tour-step-2-${tag}.png` });
    await page.click('.tour-go');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/tour-after-done-${tag}.png` });
    console.log(tag, 'tour gone after Done:', await page.$('.tour') === null);
    await ctx.close();
  }

  // Half swipes held still: the page peeking in must already look like a page.
  {
    const { ctx, page } = await newPage(browser, { colorScheme: 'light' });
    await page.goto(base + '/?slides=8');
    await page.waitForTimeout(2600);
    for (const [name, pct] of [['half-swipe-1-to-2-40', 0.4], ['half-swipe-1-to-2-60', 0.6]]) {
      await page.mouse.move(330, 420);
      await page.mouse.down();
      for (let i = 1; i <= 20; i++) { await page.mouse.move(330 - pct * 390 * i / 20, 420); await page.waitForTimeout(16); }
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${name}-L.png` });
      await page.mouse.move(330, 420, { steps: 10 }); // back, then let go (stays on slide 1)
      await page.mouse.up();
      await page.waitForTimeout(800);
    }
    await page.click('.intro-foot .btn');
    await page.waitForTimeout(2600);
    await page.mouse.move(330, 420);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) { await page.mouse.move(330 - 0.45 * 390 * i / 20, 420); await page.waitForTimeout(16); }
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/half-swipe-2-to-3-45-L.png` });
    await page.mouse.up();
    await ctx.close();
  }

  // Reduced motion: slide 2 must show its end state at once.
  {
    const { ctx, page } = await newPage(browser, { colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto(base + '/?slides=8');
    await page.click('.intro-foot .btn');
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${out}/reduced-motion-slide-2-at-60ms-L.png` });
    console.log('reduced motion slide 2 text:', (await page.innerText('.intro-slide[aria-hidden=false] .intro-art')).replace(/\n+/g, ' | '),
      '| input', await page.inputValue('.intro-slide[aria-hidden=false] input'));
    await ctx.close();
  }

  // ---- Videos (light) ----
  const video = { dir: out + '/raw', size: { width: 780, height: 1688 } };
  const trims = {};
  {
    const t0 = Date.now();
    const { ctx, page } = await newPage(browser, { colorScheme: 'light', recordVideo: video });
    await page.goto(base + '/?slides=8');
    // WebKit's recorder needs about half a second to settle its colors, so park on another screen,
    // then open the intro fresh and cut the video to start there (raw/trim.json).
    await page.evaluate(() => { gradeApp.state.screen = 'signin'; gradeApp.render(); });
    await page.waitForTimeout(1200);
    trims.slides = (Date.now() - t0) / 1000 - 0.1;
    await page.evaluate(() => { gradeApp.state.screen = 'intro'; gradeApp.render(); });
    await page.waitForTimeout(2600); // slide 1 plays
    await page.click('.intro-foot .btn'); // tap Next: slide 2
    await page.waitForTimeout(2600);
    await realDrag(page, 330, 330 - 0.4 * 390, 480, 500); // 40%, hold, let go: springs back
    await page.waitForTimeout(1000);
    console.log('after 40% drag, slide', await page.evaluate(() => gradeApp.state.introSlide + 1));
    await realDrag(page, 340, 340 - 0.6 * 390, 720); // 60%, let go: goes through to slide 3
    await page.waitForTimeout(2600);
    console.log('after 60% drag, slide', await page.evaluate(() => gradeApp.state.introSlide + 1));
    await realDrag(page, 120, 190, 64); // a fast short flick right: back to slide 2
    await page.waitForTimeout(2600);
    console.log('after flick, slide', await page.evaluate(() => gradeApp.state.introSlide + 1));
    const path = await page.video().path();
    await ctx.close();
    fs.renameSync(path, out + '/raw/slides.webm');
  }
  {
    const t0 = Date.now();
    const { ctx, page } = await newPage(browser, { colorScheme: 'light', recordVideo: video });
    await page.goto(base + '/?home=h4&tour=1');
    await signIn(page);
    await page.waitForTimeout(800);
    trims.tour = (Date.now() - t0) / 1000 - 0.1; // starts on Home while it loads
    await page.waitForSelector('.tour-card.in', { timeout: 6000 });
    await page.waitForTimeout(1800);
    await page.click('.tour-go'); // Next
    await page.waitForTimeout(2000);
    await page.click('.tour-go'); // Done
    await page.waitForTimeout(1300);
    const path = await page.video().path();
    await ctx.close();
    fs.renameSync(path, out + '/raw/tour.webm');
  }
  fs.writeFileSync(out + '/raw/trim.json', JSON.stringify(trims));
  await browser.close();
})();
