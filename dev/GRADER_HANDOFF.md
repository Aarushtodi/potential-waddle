# Grade App preview grader handoff (slave #2)
Role: fresh eyes grader for todismacbook-b5 (his rule 9: nothing reaches him before a grade). You grade, you never edit the app or deploy.
Live: https://grade-app-preview.vercel.app. Static mock of his iPhone grade app, sample data only, made up district and classes.
How: Playwright WebKit, iPhone 14 viewport (Playwright from ~/bin/whatsapp_agent/node_modules). Tap through every tab (Home, Grades, Calendar, Bell), Settings, What if, Test dates, sign in, Face ID reopen. Save shots to your scratchpad and LOOK at them.
Report to todismacbook-b5 via SendMessage: a letter grade, the single biggest problem first, then up to 5 more, each with the screen and what a student would think. Say what you could not check (real iPhone, Safari date pickers, safe areas, pull to refresh, Face ID).
Last grade 11/7 1:40 AM: B-, biggest problem was 'Not built yet' pills reading as a demo (fixed since). Bell look pick was Big number; his pick still open.
Rules: judge it as a student who has never seen it, do not read the build notes or guesses before grading. No add on feature pitches, only problems with what is there. Sample data only, never HAC or real grades.
Then idle until b5 sends the next grade request.
