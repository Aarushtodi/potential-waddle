# Grade App preview handoff (slave #1)
App: clickable web mock of his Grade App (iPhone frame), sample data only. Live: https://grade-app-preview.vercel.app (noindex via vercel.json).
Files (refactored 11/7 into ES modules, see README.md for the map): index.html (shell), css/app.css, js/*.js (state.js, actions.js, render.js, grade-math.js, sample-data.js, ...), js/views/*.js (one per screen). vercel.json, .vercelignore (keeps dev/ and backups off the site). Dev files live in dev/: this file, GRADER_HANDOFF.md, shots.js. Pre refactor single file: ~/code/grade-app-preview.index.bak-refactor.html.
Guesses + his answers: ~/Documents/Obsidian/Projects/App Research/Grade App Preview Guesses.md (mark each 'HIS ANSWER'). Project note: Projects/Grade App.md, rewrite its Current state each batch.
Deploy: back up first (git commit is the backup now; tag or note the commit before a batch), edit, syntax check (`for f in js/*.js js/views/*.js; do node --check $f; done`), then `vercel --prod --yes` in this folder, then commit and push: `git add -A && git commit -m "..." && git -c credential.helper= -c "credential.helper=!$(which gh) auth git-credential" push origin main` (the saved credential helper is broken). Repo: https://github.com/Aarushtodi/potential-waddle (public).
Check: curl -s -o /dev/null -w "%{http_code}" the live URL (want 200), and grep the live .js file you changed (e.g. /js/views/home.js) for a string from the new code. index.html is only a shell now.
Shots: node dev/shots.js ~/code/grade-app-shots, which writes home.png + bell.png and prints Home text, the tab after a Face ID reopen, and a corrections check. Playwright comes from ~/bin/whatsapp_agent/node_modules. LOOK at both shots before reporting.
Batches applied:
- Batch 1 (4, 6, 9, 10), backup ~/code/grade-app-preview.index.bak-batch1.html:
  - 4: Face ID reopen lands on Home (unlock() sets tab home).
  - 6: T0 moved to the next Tuesday, so the whole app reads as a sample Tuesday A day. Home class line says 'Sample school day'.
  - 9: no change, sample weights Test 60 / Lab 25 / HW 15.
  - 10: corrections = typed score that replaces the old one (wiRows). Half back rule and extra credit field removed (extra credit removal is my reading, revertable).
- Batch 2 (11 to 15), backup ~/code/grade-app-preview.index.bak-batch2.html:
  - 11 + 12: no 20% final, no 40/40/20. PAST (sample past report card, 4 classes) + solveSplit() finds the one quarter/exam split whose rounded semester grades match every row: 42.5 / 42.5 / 15. splitLine() says where it came from. Finals calculator, Semester tool, What do I need Final all use semNeed(). Asks once if unsolvable is text only.
  - 13: avgOf counts missing, ABS and INC as 0 (zero()); blank = no weight. Class page grade goal card removed (it was a prediction). Forecast page + GPA row removed; Your usual / 90 / 80 / 70 are now quick fill taps inside What if, Stack scores (wiFill). Missing work page shows what each 0 costs, no 'turned in = full credit'. Graph includes the 0s.
  - 14: retest windows cut (win data, Home Retests list, days left). under(r) = test under S.line. Alert body adds 'You can retest or waterfall this.' for tests under the line; sample = Algebra Unit 3 Test 72 seeded in alerts, and the queued Chemistry 78. Retest tool = type expected retest score per graded test. Settings retest line = 80 / 90 / Type your own, sample pick 80.
  - 15: Best and worst tool deleted.
  - Extra shots script: /private/tmp/claude-501/-Users-todismacbook/1e7f8f7d-bacc-4f11-9c35-83a360759172/scratchpad/shots2.js (may be gone after the session; it pushes stacks and calls A.wiOpen / A.wiT / A.wiFill, then screenshots b2-*.png). Those are pre refactor names; now gradeApp.actions.openWhatIf / openWhatIfTool / quickFill.
- Refactor 11/7 (no behavior change): split into css/ + js/ ES modules, descriptive names, README.md, dev/ folder. Regression check: node ~/code/grade-app-shots/capture-all.js <url> <outDir> (166 click driven shots, light, dark, desktop, frozen clock, plus a DOM dump), then python3 ~/code/grade-app-shots/compare.py <before> <after>. Before set: ~/code/grade-app-shots/before-refactor/run6.
Open: guesses 16 to 30, batches come from b5.
Rules:
- He talks to b5, not to me. Report every batch to todismacbook-b5 via SendMessage: what changed, the curl result, shot paths, anything I read into his answers.
- Shots get checked before he sees anything. Say plainly that nothing has been opened on a real iPhone.
- Sample data only, no real grades or HAC. No add ons beyond his answers.
- Log answers to the Guesses note + Grade App Current state in the same batch.
