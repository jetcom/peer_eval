// Takes every landing-page screenshot, light and dark, into $WORK/out/*.png.
// Viewport widths are deliberately narrow so text stays legible once the
// images are scaled down on the landing page.
const path = require('path');
const { open } = require('./lib');
const out = (name) => path.join(process.env.WORK, 'out', name);
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const cardTop = (page, heading) => page.evaluate((heading) => {
  const h = [...document.querySelectorAll('h1,h2,h3,h4')].find(e => e.textContent.trim().startsWith(heading));
  const r = (h.closest('.card') || h.parentElement).getBoundingClientRect();
  return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
}, heading);
const textTop = (page, text) => page.evaluate((text) => {
  const e = [...document.querySelectorAll('h1,h2,h3,h4,h5,div,p,span,strong')].filter(e => e.children.length === 0 && e.textContent.trim().startsWith(text))[0];
  return e.getBoundingClientRect().top + window.scrollY;
}, text);
// The teacher dashboard opens on the newest class; pick the named one. The
// class list is a table on wide screens and a stack of cards on narrow ones.
const manageClass = async (s, name) => {
  await s.page.evaluate((name) => {
    const card = [...document.querySelectorAll('.mobile-card')].find(c => c.offsetParent !== null && c.textContent.includes(name));
    const btn = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.trim() === name);
    (card || btn).click();
  }, name);
  await wait(900);
};
const setSelect = (page, optionText, value) => page.evaluate((optionText, value) => {
  const sel = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.textContent.trim() === optionText));
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, value);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}, optionText, value);

(async () => {
  for (const dark of [false, true]) {
    const tag = dark ? 'dark' : 'light';

    // Hero: progress by phase + heat map, phase 3 selected so it shows gaps
    let s = await open({ dark, width: 860, height: 1000, scale: 2 });
    await s.go('/teacher');
    await manageClass(s, 'Software Engineering');
    await setSelect(s.page, 'Phase 3', '3'); await wait(500);
    const byPhase = await cardTop(s.page, 'Progress by Phase');
    const heat = await cardTop(s.page, 'Evaluation Heat Map');
    await s.page.screenshot({ path: out(`hero-${tag}.png`), clip: { x: 0, y: byPhase.y - 12, width: 860, height: (heat.y - byPhase.y) + 12 + 438 } });
    await s.browser.close();

    // Instructor: nudge list and reports
    s = await open({ dark, width: 720, height: 1000, scale: 2 });
    await s.go('/teacher');
    await manageClass(s, 'Software Engineering');
    const nudge = await cardTop(s.page, 'Who Needs a Nudge?');
    await s.page.screenshot({ path: out(`instructor-${tag}.png`), clip: { x: 0, y: nudge.y - 12, width: 720, height: 480 } });
    await s.clickText('Reports', 'button');
    const visual = await cardTop(s.page, 'Visual Comparison');
    await s.page.screenshot({ path: out(`reports-${tag}.png`), clip: { x: 0, y: visual.y - 12, width: 720, height: 480 } });
    await s.browser.close();

    // Instructor: class settings, Assignments tab of the assignment-based class
    s = await open({ dark, width: 800, height: 1700, scale: 2 });
    await s.go('/teacher');
    await s.page.evaluate(() => {
      const row = [...document.querySelectorAll('tr')].find(r => r.textContent.includes('Technical Communication'));
      [...row.querySelectorAll('button')].find(b => b.textContent.trim() === 'Settings').click();
    });
    await wait(800);
    await s.clickText('Assignments', 'button');
    const box = await s.page.evaluate(() => {
      const h = [...document.querySelectorAll('h4')].find(e => e.textContent.trim().startsWith('Assignments ('));
      const r = h.getBoundingClientRect(); return { x: r.left, y: r.top, w: Math.round(h.parentElement.getBoundingClientRect().width) };
    });
    await s.page.screenshot({ path: out(`settings-${tag}.png`), clip: { x: box.x - 14, y: box.y - 10, width: box.w + 28, height: Math.round((box.w + 28) * 2 / 3) } });
    await s.browser.close();

    // Student: phase 3 peer evaluation form
    s = await open({ who: 'student', dark, width: 720, height: 1000, scale: 2 });
    await s.go(`/evaluate/3?class_id=${s.tokens.classId}`);
    const y = await textTop(s.page, 'Rahman, Aisha');
    await s.page.screenshot({ path: out(`student-${tag}.png`), clip: { x: 0, y: y - 26, width: 720, height: 480 } });
    await s.browser.close();

    // Student: assignment list and a partly filled audience evaluation
    s = await open({ who: 'student2', dark, width: 720, height: 1000, scale: 2 });
    await s.go(`/dashboard?class_id=${s.tokens.class2Id}&assignment=${s.tokens.assignment2Id}`);
    const asg = await cardTop(s.page, 'Assignments');
    await s.page.screenshot({ path: out(`assignments-${tag}.png`), clip: { x: 0, y: asg.y - 12, width: 720, height: 480 } });
    await s.go(s.tokens.audienceUrl);
    const top = await s.page.evaluate(() => {
      const card = [...document.querySelectorAll('.card')].find(c => c.textContent.includes('Team Kestrel'));
      const radios = card.querySelectorAll('input[type=radio]');
      for (const i of [4, 8, 14, 18, 24]) radios[i].click();
      return card.getBoundingClientRect().top + window.scrollY;
    });
    await wait(300);
    const ta = await s.page.evaluateHandle(() => [...document.querySelectorAll('.card')].find(c => c.textContent.includes('Team Kestrel')).querySelector('textarea'));
    await ta.click(); await ta.type('Clear structure and a confident delivery. The live demo made the idea click.');
    await s.page.evaluate(() => window.scrollTo(0, 0)); await wait(300);
    await s.page.screenshot({ path: out(`audience-${tag}.png`), clip: { x: 0, y: top - 12, width: 720, height: 480 } });
    await s.browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
