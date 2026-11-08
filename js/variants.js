/**
 * DESIGN VARIANTS (council preview only, not the shipped app). Branch looks-gpa.
 *
 * Read once from the URL so several looks can sit side by side:
 *   ?gpa=1   Edge (the council's pick): "3.57 this semester", one card of classes sorted by how
 *            close each is to a letter line, inline A to F what if, What do I need in a sheet.
 *   ?gpa=2   Verdict (the minority report, made honest): one sentence built only from distance
 *            facts, the classes near a line as big chips, the rest folded away.
 *   ?gpa=3   Swipe: three pages under the header, Now / What if / Goal, with the intro pager's
 *            physics (follows the finger, moves past half or on a flick, springs back).
 *   No param = today's GPA page.
 *
 *   ?slow=N  Shots only: every GPA look motion runs N times slower, so a still can catch it
 *            mid count up, mid flip or mid swipe. Never in the real app.
 *
 * Spec: the council brief, Obsidian Council/2026-11-08-grade-app-gpa-redo.md, "Build brief".
 * The look code lives in js/views/gpa-looks.js (+ css/gpa-looks.css), so the winner can be lifted
 * into gpa.js later. The hooks into the real app are marked "VARIANT HOOK".
 */
const params = new URLSearchParams(location.search);

/** 1 | 2 | 3, or null for today's GPA page. */
export const GPA_LOOK = ['1', '2', '3'].includes(params.get('gpa')) ? +params.get('gpa') : null;

/** Motion slow down for mid motion shots (1 = real speed). */
export const SLOW = Math.max(1, Math.min(20, +params.get('slow') || 1));

/** Mutable state only the GPA looks use. Their actions change it, render() redraws. */
export const gpaLook = {
  whatIf: {}, // class id -> letter, only where it differs from the gradebook letter
  picker: null, // look 1 and 3: class id whose A to F control is open
  moreOpen: false, // look 2: "5 more classes" expanded
  page: 0, // look 3: 0 Now, 1 What if, 2 Goal
};
