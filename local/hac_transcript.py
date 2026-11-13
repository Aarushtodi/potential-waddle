"""Frisco ISD HAC transcript: the GPA HAC shows and every semester grade behind it.

Used by local/real_server.py (and a model for the native app's pull). Read only. Logs in through
~/bin/hac_grades.py (the password stays in ~/.hac), reads Content/Student/Transcript.aspx and returns
    {"weighted": 4.268, "unweighted": 3.351, "grades": [97, 100, ...]}
grades holds each numeric semester grade of a course with credit, once per half credit (Frisco
counts a 2 credit course twice). W, P and blank cells are skipped. js/grade-math.js
transcriptTotals checks the grades against HAC's two numbers before the app shows anything.
"""
import re
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

import hac_grades

TRANSCRIPT_URL = f"{hac_grades.BASE}/Content/Student/Transcript.aspx"
ROW_RE = re.compile(r'<tr class="sg-asp-table-data-row">(.*?)</tr>', re.S)
CELL_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
GPA_RE = re.compile(
    r'lblGPADescr\d+">([^<]*)</span>\s*</td>\s*<td>\s*<span id="[^"]*lblGPACum\d+">([^<]*)</span>', re.S)


def _num(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def parse(page):
    gpas = {hac_grades.clean(label).lower(): _num(value) for label, value in GPA_RE.findall(page)}
    weighted = next((v for k, v in gpas.items() if "weighted" in k and "un" not in k), None)
    unweighted = next((v for k, v in gpas.items() if "4.0" in k or "unweighted" in k or "college" in k), None)
    grades = []
    for row in ROW_RE.findall(page):
        cells = [hac_grades.clean(c) for c in CELL_RE.findall(row)]
        # Course | Description | SEM1 | SEM2 | FIN | Credit
        if len(cells) != 6 or not re.match(r"^\S+\s*-\s*\d+$", cells[0]):
            continue
        credit = _num(cells[5]) or 0
        sems = [_num(c) for c in cells[2:4]]
        sems = [g for g in sems if g is not None]
        if credit <= 0 or not sems:
            continue
        times = max(1, round(credit / len(sems) / 0.5))
        for g in sems:
            grades.extend([g] * times)
    if weighted is None or unweighted is None or not grades:
        raise ValueError("transcript page changed")
    return {"weighted": weighted, "unweighted": unweighted, "grades": grades}


def pull():
    """Fresh login, read the transcript. Raises on any failure; the caller keeps its last copy."""
    username, password = hac_grades.read_credentials()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(CookieJar()),
        urllib.request.HTTPSHandler(context=hac_grades.SSL_CONTEXT),
    )
    try:
        hac_grades.login(opener, username, password)
    except SystemExit:
        raise ValueError("login")
    page = opener.open(TRANSCRIPT_URL).read().decode("utf-8", "ignore")
    return parse(page)
