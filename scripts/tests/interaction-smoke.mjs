import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { startServer, findChrome } from './render-smoke.mjs';

// npm install --no-save --package-lock=false playwright@1.58.0
// node scripts/tests/interaction-smoke.mjs
// Uses the installed Chrome (or CHROME=/absolute/path), like render-smoke.
const { chromium } = createRequire(import.meta.url)('playwright');
const chrome = findChrome();
assert.ok(chrome, 'Chrome is required for the interaction smoke test');
const server = await startServer();
const url = `http://127.0.0.1:${server.address().port}/index.html`;
let browser;

async function withPage(viewport, theme, run, { savedSeason = '', fixtures } = {}) {
  const context = await browser.newContext({
    viewport, serviceWorkers: 'block', locale: 'es-ES',
    timezoneId: 'Atlantic/Canary', reducedMotion: 'reduce',
  });
  try {
    await context.addInitScript(({ theme, savedSeason }) => {
      localStorage.setItem('theme', theme);
      localStorage.setItem('season', savedSeason);
    }, { theme, savedSeason });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (fixtures) {
      await page.route('**/data-history.js*', route => route.fulfill({
        contentType: 'text/javascript',
        body: 'const HISTORY=' + JSON.stringify(fixtures) + ';',
      }));
    }
    await page.goto(url);
    await page.locator('.me-hero').waitFor();
    await run(page);
    assert.deepEqual(errors, [], 'No application JavaScript errors');
  } finally {
    await context.close();
  }
}

async function checkNavPosition(page, mobile) {
  const { nav, header, width, height, pageWidth } = await page.evaluate(() => ({
    nav: document.querySelector('.section-tabs').getBoundingClientRect().toJSON(),
    header: document.querySelector('.header').getBoundingClientRect().toJSON(),
    width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(pageWidth <= width + 1, `Page width ${pageWidth}px exceeds viewport ${width}px`);
  if (mobile) {
    assert.ok(Math.abs(nav.bottom - height) < 1, 'Mobile nav must touch the viewport bottom');
    assert.ok(nav.top > header.bottom, 'Mobile nav must not cover the header');
    assert.ok(Math.abs(nav.width - width) < 1, 'Mobile nav must span the viewport');
  } else {
    assert.ok(nav.top >= header.top && nav.bottom <= header.bottom,
      'Desktop nav must remain within the header');
  }
}

async function checkCurrentSeason(page) {
  const state = await page.evaluate(async () => {
    const { S, getCurrentSeason } = await import('./src/state.js');
    return {
      selected: S.season,
      actual: SEASONS.find(s => s.current).name,
      active: getCurrentSeason(),
      label: document.getElementById('seasonLabel').textContent,
      select: document.getElementById('seasonSelect').value,
      scorersDisabled: document.querySelector('[data-section="goleadores"]').disabled,
    };
  });
  assert.equal(state.selected, '');
  assert.equal(state.active, state.actual);
  assert.equal(state.label, 'Temporada ' + state.actual.replace('-', '/'));
  assert.equal(state.select, '');
  assert.equal(state.scorersDisabled, false);
}

try {
  browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  for (const viewport of [
    { width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 768, height: 1024 }, { width: 1440, height: 1000 },
  ]) {
    for (const theme of ['dark', 'light']) {
      await withPage(viewport, theme, async page => {
        const mobile = viewport.width <= 768;
        await checkNavPosition(page, mobile);
        await page.locator('[data-section="clasif"]').click();
        // Normal clicks: Playwright must detect any element intercepting them.
        for (const cat of ['prebenjamin', 'benjamin']) {
          await page.locator(`[data-cat="${cat}"]`).click();
          assert.equal(await page.locator('.cat-btn.active').getAttribute('data-cat'), cat);
        }
        for (const section of ['jornadas', 'goleadores', 'isla', 'stats', 'miequipo']) {
          await page.locator(`[data-section="${section}"]`).click();
          assert.equal(await page.locator('.section.active').getAttribute('id'), 'sec-' + section);
          await checkNavPosition(page, mobile);
        }
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
        await checkNavPosition(page, mobile);
        await page.locator('[data-section="jornadas"]').click();
        await page.locator('#seasonSelect').selectOption('2021-2022');
        await page.waitForFunction(async () => {
          const { S, getData } = await import('./src/state.js');
          return S.season === '2021-2022' && getData().length > 0;
        });
        assert.equal(await page.locator('#seasonLabel').innerText(), 'Temporada 2021/2022');
        await page.locator('[data-section="miequipo"]').click();
        await checkCurrentSeason(page);
        if (viewport.width === 390 && theme === 'dark') {
          await page.locator('.me-crow[data-mi]').first().click();
          await page.locator('#matchModal.open').waitFor();
          assert.match(await page.locator('.modal-group-label').innerText(), /Grupo 2/i);
          assert.ok(await page.locator('.modal-h2h-match').count() > 0,
            'Match dialog must read the current group and its fixtures after leaving history');
          await page.keyboard.press('Escape');
          await page.locator('#matchModal.open').waitFor({ state: 'hidden' });
        }
        await page.locator('#meGoGroup').click();
        await checkCurrentSeason(page);
        assert.equal(await page.locator('.cat-btn.active').getAttribute('data-cat'), 'prebenjamin');
        assert.equal(await page.locator('.section.active').getAttribute('id'), 'sec-clasif');
        await checkNavPosition(page, mobile);
      });
      console.log(`PASS: navigation, categories and historical return ${viewport.width}px ${theme}`);
    }
  }

  await withPage({ width: 390, height: 844 }, 'dark', async page => {
    await checkCurrentSeason(page);
  }, { savedSeason: '2021-2022' });
  console.log('PASS: reload with a saved historical season opens Mi equipo in the current season');

  for (const upcoming of [false, true]) {
    const fixtures = { PG2: {
      'Jornada 1': [['2000-01-01', 'Las Mesas Hu.', 'Rival A', 2, 1]],
      'Jornada 2': [['2000-01-08', 'Rival B', 'Las Mesas Hu.', null, null]],
      ...(upcoming ? { 'Jornada 3': [['2099-01-01', 'Las Mesas Hu.', 'Rival C', null, null]] } : {}),
    } };
    await withPage({ width: 390, height: 844 }, 'light', async page => {
      const missing = page.locator('.me-crow').filter({ hasText: 'Rival B' });
      assert.match(await missing.locator('.me-nd').innerText(), /^sin resultado$/i);
      assert.doesNotMatch(await page.locator('.me-cal').innerText(), /no disputado/i);
      assert.match(await page.locator('.me-coverage').innerText(), /recoge 1 resultado; la clasificación contabiliza \d+ partidos jugados/);
      assert.equal(await page.locator('.me-next').count(), upcoming ? 1 : 0);
      await checkNavPosition(page, true);
    }, { fixtures });
  }
  console.log('PASS: missing past results and calendar coverage, with and without upcoming fixtures');

  await withPage({ width: 390, height: 844 }, 'light', async page => {
    assert.equal(await page.locator('.me-crow').count(), 5);
    await page.locator('#meCalendarToggle').click();
    assert.ok(await page.locator('.me-crow').count() > 5);
    await page.locator('#meCalendarToggle').click();
    assert.equal(await page.locator('.me-crow').count(), 5);
    await page.locator('#chooseTeam').click();
    await page.locator('#matchModal.open').waitFor();
    assert.equal(await page.locator('main').evaluate(node => node.inert), true);
    const sheet = await page.locator('.modal').evaluate(node => ({
      radius: getComputedStyle(node).borderBottomLeftRadius,
      bottom: node.getBoundingClientRect().bottom, height: innerHeight,
    }));
    assert.equal(sheet.radius, '0px');
    assert.ok(Math.abs(sheet.bottom - sheet.height) <= 1);
    await page.locator('#modalClose').focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.querySelector('#matchModal').contains(document.activeElement)), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'modalClose');
    await page.locator('#favoriteSearch').fill('Las Mesas');
    await page.locator('#favoriteCategory').selectOption('benjamin');
    assert.ok(await page.locator('.picker-team').count() > 0);
    await page.locator('.picker-team').first().click();
    await page.waitForFunction(async () => (await import('./src/state.js')).FEATURED.cat === 'benjamin');
    assert.equal(await page.locator('.favorite-tab').count(), 2);
    const selected = await page.evaluate(async () => ({ ...(await import('./src/state.js')).FEATURED }));
    await page.reload();
    await page.locator('.me-hero').waitFor();
    assert.deepEqual(await page.evaluate(async () => ({ ...(await import('./src/state.js')).FEATURED })), selected);
    await page.locator('#chooseTeam').click();
    await page.locator('[data-remove="1"]').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.favorite-tab').count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'chooseTeam');
    assert.equal(await page.locator('main').evaluate(node => node.inert), false);
    assert.equal(await page.evaluate(async () => (await import('./src/state.js')).FEATURED.cat), 'prebenjamin');
  });
  console.log('PASS: last five/full calendar, favorites across categories and reload, removal, focus trap and mobile sheet');

  await withPage({ width: 1440, height: 1000 }, 'dark', async page => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#meTeamProfile').click();
    await page.locator('#matchModal.open').waitFor();
    const teamLink = page.url();
    await page.locator('#matchModal [data-copy]').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), teamLink);
    assert.ok((await page.locator('#matchModal a[href^="https://wa.me"]').getAttribute('href')).includes(encodeURIComponent(teamLink)));
    await page.goto(teamLink);
    await page.locator('#matchModal.open').waitFor();
    assert.match(await page.locator('#matchModal').getAttribute('aria-label'), /Las Mesas/);
    await page.keyboard.press('Escape');
    await page.locator('[data-section="miequipo"]').click();
    await page.locator('#meMatchDetail').click();
    const matchLink = page.url();
    assert.ok(new URL(matchLink).hash.includes('match='));
    await page.goto(matchLink);
    await page.locator('#matchModal.open').waitFor();
    assert.match(await page.locator('#matchModal').getAttribute('aria-label'), /Las Mesas.*Huracán/);
    assert.equal((await page.locator('.modal-big-score .sb-num').allTextContents()).join('-'), '2-7');
    await page.keyboard.press('Escape');
    await page.locator('[data-section="clasif"]').click();
    await page.locator('#filter-clasif-search').fill('Mesas');
    await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('q') === 'Mesas');
    const searchLink = page.url();
    assert.ok(await page.locator('#sec-clasif .group-card').count() > 0);
    await page.goto(searchLink);
    await page.locator('#filter-clasif-search').waitFor();
    assert.equal(await page.locator('#filter-clasif-search').inputValue(), 'Mesas');
    await page.locator('#filter-clasif-island').selectOption('grancanaria');
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('island'), 'grancanaria');
    await page.locator('#filter-clasif-search').fill('club inexistente 987');
    await page.waitForFunction(() => document.querySelector('#sec-clasif .empty-state')?.innerText.includes('No hay grupos'));
    await page.locator('#sec-clasif [data-clear]').click();
    await page.locator('[data-section="jornadas"]').click();
    await page.locator('.jornada-pill').first().click();
    const roundLink = page.url();
    const round = await page.locator('.jornada-pill.active').innerText();
    await page.locator('.jornada-pill').nth(1).click();
    const secondRound = await page.locator('.jornada-pill.active').innerText();
    await page.goBack();
    await page.waitForFunction(round => document.querySelector('.jornada-pill.active')?.innerText === round, round);
    await page.goForward();
    await page.waitForFunction(round => document.querySelector('.jornada-pill.active')?.innerText === round, secondRound);
    await page.goto(roundLink);
    await page.locator('.jornada-pill.active').waitFor();
    assert.equal(await page.locator('.jornada-pill.active').innerText(), round);
  });
  console.log('PASS: copy/WhatsApp, team and match deep links, reproducible filters, matchdays and Back/Forward');

  await withPage({ width: 390, height: 844 }, 'dark', async page => {
    assert.match(await page.locator('.me-next').innerText(), /18:30/);
    const map = new URL(await page.locator('.me-next a[href*="google.com/maps"]').getAttribute('href'));
    assert.match(map.searchParams.get('query'), /Campo de Las Mesas/);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#meDownload').click();
    const download = await downloadPromise;
    assert.ok(download.suggestedFilename().endsWith('.ics'));
    const stream = await download.createReadStream();
    let calendar = '';
    for await (const chunk of stream) calendar += chunk.toString();
    assert.match(calendar, /BEGIN:VCALENDAR/);
    assert.match(calendar, /DTSTART:20990101T183000Z/);
    assert.match(calendar, /LOCATION:Campo de Las Mesas/);
    await page.locator('#meMatchDetail').click();
    assert.doesNotMatch(await page.locator('.modal-top').innerText(), /EMPATE|GANADOR/);
    await page.keyboard.press('Escape');
    await page.locator('#meCalendarToggle').click();
    assert.match(await page.locator('.me-crow').filter({ hasText: 'Rival A' }).innerText(), /aplazado/i);
    assert.match(await page.locator('.me-crow').filter({ hasText: 'Rival B' }).innerText(), /no disputado/i);
  }, { fixtures: { PG2: {
    'Jornada 1': [['2000-01-01', 'Las Mesas Hu.', 'Rival A', null, null, null, '', '', 'postponed']],
    'Jornada 2': [['2000-01-08', 'Las Mesas Hu.', 'Rival B', null, null, null, '', '', 'not_played']],
    'Jornada 3': [['2099-01-01', 'Las Mesas Hu.', 'Rival C', null, null, null, '18:30', 'Campo de Las Mesas']],
  } } });
  console.log('PASS: future date/time/venue, maps, downloaded ICS and explicit source statuses');
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
