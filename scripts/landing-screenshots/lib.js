// Shared helper for the capture script: opens the local demo app in headless
// Chrome as a given user (tokens come from the seed scripts) and returns
// small navigation helpers.
const path = require('path');
const puppeteer = require('puppeteer-core');
const tokens = require(path.join(process.env.WORK, 'tokens.json'));
const BASE = 'http://localhost:3000';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function open({ who = 'teacher', dark = false, width = 1440, height = 900, scale = 1 } = {}) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
  await page.evaluate((t, d) => { localStorage.setItem('token', t); localStorage.setItem('darkMode', JSON.stringify(d)); }, tokens[who], dark);
  const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 600)); };
  const clickText = async (text, sel = 'button, a') => {
    const ok = await page.evaluate((text, sel) => {
      const els = [...document.querySelectorAll(sel)].filter(e => e.textContent.trim() === text && e.offsetParent !== null);
      const el = els[els.length - 1]; if (!el) return false; el.click(); return true;
    }, text, sel);
    if (!ok) throw new Error('no element with text: ' + text);
    await new Promise(r => setTimeout(r, 900));
  };
  return { browser, page, go, clickText, tokens };
}
module.exports = { open };
