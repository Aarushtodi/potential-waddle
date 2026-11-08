# Grade App preview

A clickable web mock of an iPhone app for high school students: grades, to-dos, a calendar,
the bell schedule, and a What if predictor. It is a design preview, built to try the screens
with students before writing the real iOS app.

**All data is sample data.** The district, classes, teachers and scores are made up
(`js/sample-data.js`). The real app will read everything from HAC (Home Access Center),
the district gradebook. Nothing in the preview is ever sent anywhere.

Live: https://grade-app-preview.vercel.app (noindex)

## Run it locally

ES modules need a server (they do not load from `file://`):

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Plain HTML, CSS and JavaScript. No build step, no dependencies, no framework.
It deploys as a static site on Vercel.

## File map

```
index.html              Shell only: one <div id="app">, the stylesheet, and js/app.js
css/app.css             All styles. Light and dark themes (data-theme or the phone setting), phone frame on wide screens
js/app.js               Boot. Wires click / input / change / touch events to actions, starts the 1 s tick
js/state.js             The one mutable `state` object, plus selectors (read-only questions about it)
js/actions.js           Everything a tap or keystroke does. Also the simulated gradebook refresh
js/render.js            render(): redraw from state. refreshLive(): patch only [data-live] parts
js/grade-math.js        Pure grade math: averages, weights, what if, semester split, GPA (JSDoc'd)
js/schedule.js          Bell schedule: current period, minutes left
js/theme.js             Appearance: Light, Dark or Match my phone, saved in localStorage, crossfade on change
js/format.js            Escaping, sample calendar (day offsets), number and date text
js/sample-data.js       SAMPLE DATA: classes, rows, past report card, bell schedule, test dates
js/views/shell.js       view(): top bar + current page + tab bar + sheet / banner / Face ID cover
js/views/components.js  Shared HTML pieces: headings, rows, segmented controls, to-do rows
js/views/home.js        Home tab (look H4: missing card, Latest line, class chips, grouped to-dos) and the Missing work page
js/views/grades.js      Grades tab: class list, one class (with grade graph), one assignment
js/views/what-if.js     What if sheet and its 8 tools (the only place the app predicts)
js/views/gpa.js         GPA page, What do I need, GPA what if, GPA goal
js/views/calendar.js    Calendar tab
js/views/bell.js        Bell tab, three looks: big number, dial, tape
js/views/settings.js    Settings and the Widgets preview
js/views/sheets.js      Other bottom sheets: district, add to-do, test dates, task, period, email, add class
js/views/changes.js     What changed and Alerts pages
js/views/pace.js        Pacing page for the long project
js/views/intro.js       Intro slides before the district pick (and from Settings > Show intro again)
js/views/theme-pick.js  Pick a look, after the intro and before sign in (3 cards with mini Home pictures)
js/views/signin.js      Sign in
dev/                    Handoff notes and a Playwright check script. Not deployed (.vercelignore)
```

## Data flow

```
tap / keystroke
   -> app.js reads data-action / data-input (+ data-x, data-y) from the element
   -> actions.js changes `state`
   -> render.js calls view() and replaces #app's HTML
```

Views are plain functions that return HTML strings from `state`. They never attach listeners;
they put `data-action="name"` on elements and one delegated listener in `app.js` calls
`actions[name](x, y)`. While typing, only `[data-live]` regions are patched so the input
keeps focus. A 1 second tick refreshes the same regions (clock, "Updated N min ago").

## Grade math

All in `js/grade-math.js`, pure functions with no DOM or state. The rules follow HAC, not
what a student hopes:

- Every score counts exactly as the teacher entered it in HAC.
- Missing, incomplete (INC) and absent (ABS) count as 0. A blank row has no weight.
- The class average is a weighted average of category percents (sample weights: Test 60,
  Lab 25, HW 15). Empty categories drop out and the rest are scaled up.
- The main screens show only the real grade. Predictions live only in the What if sheet,
  which works on a copy of the rows and labels every number an estimate.
- The semester split (each quarter vs the final exam) is not published, so it is solved
  from a past report card (`solveSemesterSplit`): the one split whose rounded results
  match every class. The sample solves to 42.5 / 42.5 / 15.
- The retest line (80, 90 or typed) is picked at setup; graded tests under it get a
  retest reminder.

## Preview stubs vs real

| In the preview | In the real app |
| --- | --- |
| Sample classes, scores, report card (`sample-data.js`) | Read from HAC |
| Sign in takes no login | Student signs in to their district's HAC |
| Update / pull to refresh adds a queued sample score | Re-reads HAC, phone checks in the background |
| Alert banner inside the page | iOS notification |
| Sample day is always the next Tuesday, clock starts at 9:37 | Real date, district bell schedule and A/B calendar |
| Face ID is a 1.3 s cover | Real Face ID |
| Email teacher shows a draft | Opens Mail |
| Widgets and lock screen are pictures | Real iOS widgets |
| State resets on reload (except the Appearance pick, kept in localStorage) | Saved on the phone |
