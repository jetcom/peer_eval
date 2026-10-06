/**
 * Helpers for organizing classes by academic term.
 * Semesters are free text ("Fall 2025", "Spring 2026", "2025-26 Winter"), so
 * we parse a year and a season and sort newest first; anything we can't parse
 * sorts after parsed terms, alphabetically; blank goes last as "No term".
 */
const SEASON_ORDER = { winter: 0, spring: 1, summer: 2, fall: 3, autumn: 3 };

export const NO_TERM = 'No term';

export function parseTerm(semester) {
  const s = String(semester || '').trim();
  if (!s) return { year: -Infinity, season: -1, label: NO_TERM, raw: '' };
  const yearMatch = s.match(/(20\d{2}|19\d{2})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  const seasonMatch = s.toLowerCase().match(/winter|spring|summer|fall|autumn/);
  const season = seasonMatch ? SEASON_ORDER[seasonMatch[0]] : null;
  return { year, season, label: s, raw: s };
}

/** Sort comparator: newest term first, unparseable after, "No term" last. */
export function compareTermsDesc(a, b) {
  const ta = parseTerm(a);
  const tb = parseTerm(b);
  if (ta.label === NO_TERM && tb.label !== NO_TERM) return 1;
  if (tb.label === NO_TERM && ta.label !== NO_TERM) return -1;
  const aParsed = ta.year !== null;
  const bParsed = tb.year !== null;
  if (aParsed && !bParsed) return -1;
  if (!aParsed && bParsed) return 1;
  if (aParsed && bParsed) {
    if (ta.year !== tb.year) return tb.year - ta.year;
    const sa = ta.season ?? -1;
    const sb = tb.season ?? -1;
    if (sa !== sb) return sb - sa;
  }
  return ta.label.localeCompare(tb.label);
}

/** Distinct term labels present in a list of classes, newest first. */
export function distinctTerms(classes) {
  const set = new Set(classes.map(c => (c.semester || '').trim() || NO_TERM));
  return [...set].sort((a, b) => compareTermsDesc(a === NO_TERM ? '' : a, b === NO_TERM ? '' : b));
}

/** [{ term, classes }] grouped and ordered newest term first. */
export function groupClassesByTerm(classes) {
  const groups = new Map();
  for (const c of classes) {
    const key = (c.semester || '').trim() || NO_TERM;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return distinctTerms(classes).map(term => ({
    term,
    classes: groups.get(term).slice().sort((a, b) => a.name.localeCompare(b.name) || (a.section || '').localeCompare(b.section || ''))
  }));
}
