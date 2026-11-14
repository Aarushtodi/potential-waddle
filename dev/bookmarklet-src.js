// Tally bookmarklet, readable source. dev/build-bookmarklet.mjs turns it into js/bookmarklet-code.js
// (one line, javascript: prefix), which the setup page copies.
//
// Runs on the student's own signed in HAC page. Reads the Assignments page from the same site
// (the page itself, the Classwork frame, or one same origin fetch), packs the grades and shows one
// big Copy button. It makes no request to any other site and sends nothing anywhere.
//
// Packed text: "TALLY1.<length>.<base64 of deflated JSON>" ("TALLY0" = not deflated, for phones
// without CompressionStream). JSON: {v:1, q:"Q2", t:<ms>, c:[[name, average, [[category, weight]],
// [[due, title, category index, score, total, weight]]]]}.
(function () {
  var ID = 'tally-grab';
  var old = document.getElementById(ID);
  if (old) old.remove();

  var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  var C = dark
    ? { paper: '#0B0B07', card: '#24241C', ink: '#F0F0E4', sec: '#A9A99A', urgent: '#D87058' }
    : { paper: '#D8D2C6', card: '#EDE8DD', ink: '#181812', sec: '#4A473F', urgent: '#A83030' };
  var SANS = '"Avenir Next","Avenir","Nunito Sans","Segoe UI",system-ui,sans-serif';
  var SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';

  function el(tag, css, text) {
    var e = document.createElement(tag);
    for (var k in css) e.style[k] = css[k];
    if (text != null) e.textContent = text;
    return e;
  }

  // One overlay in a shadow root, so HAC's own styles never touch it.
  var host = el('div', { position: 'fixed', inset: '0', zIndex: '2147483647' });
  host.id = ID;
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  var dim = el('div', {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,.45)', display: 'flex',
    alignItems: 'flex-end', justifyContent: 'center', fontFamily: SANS,
  });
  var card = el('div', {
    background: C.card, color: C.ink, width: '100vw', maxWidth: '480px', boxSizing: 'border-box',
    borderRadius: '22px 22px 0 0', padding: '22px 20px calc(env(safe-area-inset-bottom) + 20px)',
    boxShadow: '0 -8px 30px rgba(0,0,0,.25)',
  });
  dim.appendChild(card);
  root.appendChild(dim);
  document.body.appendChild(host);

  function close() { host.remove(); }
  dim.addEventListener('click', function (e) { if (e.target === dim) close(); });

  function show(lead, accent, line, urgent) {
    card.textContent = '';
    card.appendChild(el('div', { font: '600 13.5px ' + SANS, color: C.sec }, 'Tally'));
    var hd = el('div', { font: '800 30px/1.14 ' + SANS, margin: '2px 0 8px' }, lead);
    hd.appendChild(el('i', { fontFamily: SERIF, fontWeight: '700', color: urgent ? C.urgent : C.ink }, accent));
    card.appendChild(hd);
    if (line) card.appendChild(el('div', { font: '500 15.5px/1.4 ' + SANS, color: C.sec, marginBottom: '16px' }, line));
  }
  function button(label, primary, onTap) {
    var b = el('button', {
      display: 'block', width: '100%', border: '0', borderRadius: '22px', padding: primary ? '18px' : '13px',
      marginTop: '10px', font: (primary ? '700 19px ' : '700 15.5px ') + SANS, cursor: 'pointer',
      background: primary ? C.ink : C.paper, color: primary ? C.paper : C.ink,
    }, label);
    b.type = 'button';
    b.addEventListener('click', onTap);
    card.appendChild(b);
    return b;
  }

  show('Reading your ', 'grades', 'On this phone only.');

  // ---- Read -------------------------------------------------------------------------------
  var T = function (n) { return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; };
  var hasClasses = function (d) { return d && d.querySelector('div.AssignmentClass'); };

  function findDoc() {
    if (hasClasses(document)) return Promise.resolve(document);
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try { if (hasClasses(frames[i].contentDocument)) return Promise.resolve(frames[i].contentDocument); } catch (e) {}
    }
    var m = location.pathname.match(/^(.*?\/HomeAccess)(\/|$)/i);
    var base = m ? m[1] : '/HomeAccess';
    return fetch(location.origin + base + '/Content/Student/Assignments.aspx', { credentials: 'same-origin' })
      .then(function (r) { return r.text(); })
      .then(function (html) { return new DOMParser().parseFromString(html, 'text/html'); });
  }

  function parse(doc) {
    var run = doc.querySelector('select[name$="ddlReportCardRuns"] option[selected], select[id$="ddlReportCardRuns"] option[selected]');
    var runText = run ? T(run) : '';
    var q = /^\d+$/.test(runText) ? 'Q' + runText : (/all/i.test(runText) ? 'All year' : runText);
    var c = [].map.call(doc.querySelectorAll('div.AssignmentClass'), function (div) {
      var name = T(div.querySelector('.sg-header-heading:not(.sg-right)') || div.querySelector('a'));
      var avgM = T(div.querySelector('.sg-header-heading.sg-right')).match(/\d+(\.\d+)?/);
      var catT = div.querySelector('table[id*="dgCourseCategories"]');
      var cats = [];
      var ci = {};
      if (catT) [].forEach.call(catT.querySelectorAll('tr.sg-asp-table-data-row'), function (r) {
        var d = [].map.call(r.cells, T);
        if (d.length > 4 && d[0] && !isNaN(parseFloat(d[4]))) { ci[d[0]] = cats.length; cats.push([d[0], parseFloat(d[4])]); }
      });
      var asgT = div.querySelector('table[id*="dgCourseAssignments"]');
      var rows = [];
      if (asgT) [].forEach.call(asgT.querySelectorAll('tr.sg-asp-table-data-row'), function (r) {
        var d = [].map.call(r.cells, T);
        if (d.length < 6 || !d[2]) return;
        rows.push([d[0], d[2].replace(/\s*\*$/, ''), d[3] in ci ? ci[d[3]] : d[3], d[4], d[5], d[6] || '']);
      });
      return [name, avgM ? +avgM[0] : null, cats, rows];
    });
    return { v: 1, q: q, t: Date.now(), c: c };
  }

  function b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return btoa(s);
  }
  function pack(data) {
    var bytes = new TextEncoder().encode(JSON.stringify(data));
    var done = function (tag, out) { var body = b64(out); return 'TALLY' + tag + '.' + body.length + '.' + body; };
    if (!window.CompressionStream) return Promise.resolve(done('0', bytes));
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Response(stream).arrayBuffer().then(function (buf) { return done('1', new Uint8Array(buf)); });
  }

  // ---- Copy ------------------------------------------------------------------------------
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    root.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return ok;
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  findDoc().then(function (doc) {
    if (!hasClasses(doc)) {
      var signedOut = doc.querySelector('input[name*="UserName"], input[type="password"]');
      if (signedOut) show('Sign in ', 'first', 'Sign in to HAC, then tap the Tally bookmark again.', true);
      else show('No grades ', 'here', 'Open HAC and sign in, then tap the Tally bookmark again.', true);
      button('Close', false, close);
      return;
    }
    var data = parse(doc);
    var classes = data.c.length;
    var rows = data.c.reduce(function (n, x) { return n + x[3].length; }, 0);
    return pack(data).then(function (packed) {
      var what = classes + (classes === 1 ? ' class' : ' classes') + (data.q ? ', ' + data.q : '');
      if (rows) show('Grades ', 'ready', what + '. Tap Copy, then open Tally and paste.');
      else show('No grades ', 'yet', what + ' has no assignments yet. To use another grading period, pick it in HAC, then tap the bookmark again.', true);
      var b = button('Copy grades', true, function () {
        copy(packed).then(function (ok) {
          if (ok) {
            show('', 'Copied', 'Now open Tally and paste. ' + what + '.');
            button('Done', true, close);
          } else {
            b.textContent = 'Copy grades';
            card.appendChild(el('div', { font: '500 14px/1.4 ' + SANS, color: C.urgent, marginTop: '10px' },
              'Could not copy. Tap Copy grades again.'));
          }
        });
      });
      button('Close', false, close);
    });
  }).catch(function () {
    show('No grades ', 'here', 'Open HAC and sign in, then tap the Tally bookmark again.', true);
    button('Close', false, close);
  });
})();
