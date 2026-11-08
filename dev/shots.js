// Quick WebKit check of the live preview: Home and Bell screenshots, Face ID reopen, corrections math.
// usage: node dev/shots.js <outDir>
// Uses window.gradeApp, the debug handle js/app.js exposes for this script.
const { webkit } = require('/Users/todismacbook/bin/whatsapp_agent/node_modules/playwright');

(async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto('https://grade-app-preview.vercel.app?' + Date.now());
  await page.waitForTimeout(800);
  const out = process.argv[2];

  await page.evaluate(() => { gradeApp.actions.signIn(); gradeApp.render(); });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: out + '/home.png' });
  console.log('home text:', (await page.innerText('#main')).slice(0, 160).replace(/\n/g, ' | '));

  await page.evaluate(() => { gradeApp.actions.openBell(); gradeApp.render(); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: out + '/bell.png' });

  await page.evaluate(() => {
    gradeApp.state.tab = 'grades';
    gradeApp.render();
    gradeApp.actions.lock();
    gradeApp.render();
  });
  await page.waitForTimeout(2200);
  console.log('after FaceID reopen tab:', await page.evaluate(() => gradeApp.state.tab));

  await page.evaluate(() => { gradeApp.state.tab = 'grades'; gradeApp.render(); });
  const result = await page.evaluate(() => {
    const { CLASSES, whatIfFor, whatIfAverage } = gradeApp;
    const isGradedTest = row => row.category === 'Test' && typeof row.score === 'number';
    const course = CLASSES.find(c => c.rows.some(isGradedTest));
    const test = course.rows.find(isGradedTest);
    const before = whatIfAverage(course);
    whatIfFor(course.id).corrections[test.id] = String(test.total);
    return {
      cls: course.name, test: test.title, was: test.score, total: test.total,
      before: before.toFixed(2), after: whatIfAverage(course).toFixed(2),
    };
  });
  console.log('correction check:', JSON.stringify(result));
  await browser.close();
})();
