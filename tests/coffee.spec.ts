import { test, expect, type Page } from '@playwright/test';
import { MEMBER_EMAIL, TEST_PASSWORD } from './support/constants';
import ru from '../messages/ru.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:3101/reset-limits');
});
async function signIn(page: Page, locale = 'ru') {
  const m = locale === 'ru' ? ru : en;
  await page.goto(`/${locale}/sign-in`);
  await page.getByLabel(m.Common.email, { exact: true }).fill(MEMBER_EMAIL);
  await page.getByLabel(m.Common.password, { exact: true }).fill(TEST_PASSWORD);
  await page
    .getByRole('button', { name: m.Common.signIn, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
}
async function createViaApi(
  page: Page,
  format = 'beans',
  quantity = 2500,
  name = 'Browser coffee',
) {
  const response = await page.request.post('/api/v1/coffee-items', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { name, format, initialQuantity: quantity },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
for (const [locale, m] of Object.entries({ ru, en })) {
  test(`${locale}: mixed set, quick drip, undo, notes and purchase duplication`, async ({
    page,
  }, info) => {
    await signIn(page, locale);
    const c = m.Coffee;
    await page.goto(`/${locale}/coffee/sets/new`);
    await page
      .getByLabel(c.name, { exact: true })
      .first()
      .fill(`World Cup ${locale} ${info.project.name}`);
    const first = page.locator('.coffee-position').first();
    await first.getByLabel(c.name, { exact: true }).fill('Brazil drip');
    await first.getByLabel(c.format, { exact: true }).selectOption('drip');
    await first
      .getByLabel(`${c.quantity}, ${c.pieces}`, { exact: true })
      .fill('3');
    await page
      .getByRole('button', { name: c.addPosition, exact: true })
      .click();
    const second = page.locator('.coffee-position').nth(1);
    await second.getByLabel(c.name, { exact: true }).fill('Guatemala drip');
    await second.getByLabel(c.format, { exact: true }).selectOption('drip');
    await second
      .getByLabel(`${c.quantity}, ${c.pieces}`, { exact: true })
      .fill('2');
    await page
      .getByRole('button', { name: c.addPosition, exact: true })
      .click();
    const third = page.locator('.coffee-position').nth(2);
    await third.getByLabel(c.name, { exact: true }).fill('Beans');
    await third
      .getByLabel(`${c.quantity}, ${c.grams}`, { exact: true })
      .fill('200');
    await page
      .getByRole('button', { name: m.Common.save, exact: true })
      .click();
    await expect(page).toHaveURL(/\/coffee\/sets\/[\da-f-]+$/);
    const setUrl = page.url();
    await page.getByRole('link', { name: 'Brazil drip', exact: true }).click();
    await page.getByRole('button', { name: c.drank, exact: true }).click();
    await expect(page.locator('.coffee-remaining')).toContainText('2');
    await page.getByRole('button', { name: c.undo, exact: true }).click();
    await expect(page.locator('.coffee-remaining')).toContainText('3');
    await page.getByRole('button', { name: c.drank, exact: true }).click();
    await page
      .getByRole('link', { name: c.addImpression, exact: true })
      .click();
    await page.getByLabel(c.rating, { exact: true }).fill('9');
    await page.getByLabel(c.note, { exact: true }).fill('Chocolate and orange');
    await page.getByRole('button', { name: c.saveBrew, exact: true }).click();
    await expect(
      page.getByText('Chocolate and orange', { exact: true }),
    ).toBeVisible();
    await page.goto(setUrl);
    await page.getByRole('link', { name: c.duplicate, exact: true }).click();
    await expect(page.locator('.coffee-position')).toHaveCount(3);
    await expect(
      page
        .locator('.coffee-position')
        .first()
        .getByLabel(`${c.quantity}, ${c.pieces}`, { exact: true }),
    ).toHaveValue('3');
    await page
      .getByRole('button', { name: m.Common.save, exact: true })
      .click();
    await expect(page).toHaveURL(/\/coffee\/sets\/[\da-f-]+$/);
    expect(page.url()).not.toBe(setUrl);
    await page.getByRole('button', { name: c.archive, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: c.archive, exact: true }),
    ).toBeFocused();
    await page
      .getByRole('link', {
        name: locale === 'ru' ? 'English' : 'Русский',
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/${locale === 'ru' ? 'en' : 'ru'}/coffee/sets/`),
    );
  });
  test(`${locale}: gram doses, stock corrections and history survive reload`, async ({
    page,
  }, info) => {
    await signIn(page, locale);
    const c = m.Coffee;
    const item = await createViaApi(
      page,
      'beans',
      2500,
      `Beans ${info.project.name}`,
    );
    await page.goto(`/${locale}/coffee/items/${item.id}/brew`);
    await page.getByLabel(`${c.dose}, ${c.grams}`, { exact: true }).fill('15');
    await page.getByLabel(c.rating, { exact: true }).fill('8');
    await page.getByRole('button', { name: c.saveBrew, exact: true }).click();
    await expect(page.locator('.coffee-remaining')).toContainText('235');
    await page.reload();
    await expect(page.locator('.coffee-remaining')).toContainText('235');
    await page.getByRole('link', { name: c.adjust, exact: true }).click();
    await page
      .getByLabel(`${c.actual}, ${c.grams}`, { exact: true })
      .fill('228');
    await page.getByLabel(c.reason, { exact: true }).fill('Measured');
    await page
      .getByRole('button', { name: m.Common.save, exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: c.saved }),
    ).toBeVisible();
    await page.goto(`/${locale}/coffee/items/${item.id}`);
    await expect(page.locator('.coffee-remaining')).toContainText('228');
    await expect(page.getByText(/Measured/)).toBeVisible();
  });
}
test('editing preserves fields across conflicts, moves stock between sets and archives safely', async ({
  page,
}) => {
  await signIn(page);
  const c = ru.Coffee,
    origin = { Origin: 'http://127.0.0.1:3100' };
  const item = await createViaApi(page, 'drip', 3, 'Move this coffee');
  const response = await page.request.post('/api/v1/coffee-sets', {
    headers: origin,
    data: {
      name: 'Destination set',
      items: [{ name: 'Other drip', format: 'drip', initialQuantity: 1 }],
    },
  });
  expect(response.ok()).toBeTruthy();
  const group = await response.json();
  await page.goto(`/ru/coffee/items/${item.id}/edit`);
  await page.getByLabel(c.name, { exact: true }).fill('Updated coffee');
  await page.getByLabel(c.set, { exact: true }).selectOption(group.id);
  await page.getByText(c.details, { exact: true }).click();
  await page.getByLabel(c.country, { exact: true }).fill('Guatemala');
  await page.getByLabel(c.bestBefore, { exact: true }).fill('2020-01-01');
  await page.getByLabel(c.repeat, { exact: true }).check();
  const changed = await page.request.patch('/api/v1/coffee-items/' + item.id, {
    headers: origin,
    data: { version: item.version, note: 'Changed on another device' },
  });
  expect(changed.ok()).toBeTruthy();
  await page.getByRole('button', { name: ru.Common.save, exact: true }).click();
  await expect(page.getByText(c.conflictHint, { exact: false })).toBeVisible();
  await page.getByRole('button', { name: c.refresh, exact: true }).click();
  await expect(page.getByLabel(c.name, { exact: true })).toHaveValue(
    'Updated coffee',
  );
  await expect(page.getByLabel(c.country, { exact: true })).toHaveValue(
    'Guatemala',
  );
  await expect(
    page.getByRole('status').filter({ hasText: /Загрузка/ }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: ru.Common.save, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/coffee/items/${item.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Updated coffee',
  );
  await expect(page.getByText(/Срок годности истёк/)).toBeVisible();
  await expect(page.getByText('Guatemala', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: c.drank, exact: true }).click();
  await expect(page.locator('.coffee-remaining')).toContainText('2');
  await page.getByRole('button', { name: c.delete, exact: true }).click();
  await page
    .getByRole('button', { name: ru.Common.confirm, exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: ru.Errors.HAS_HISTORY }),
  ).toHaveText(ru.Errors.HAS_HISTORY);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/ru/coffee');
  await page.getByLabel(c.search, { exact: true }).fill('Guatemala');
  await page.getByLabel(c.repeat, { exact: true }).check();
  await expect(
    page.getByRole('link', { name: 'Destination set', exact: true }),
  ).toBeVisible();
  await page.goto(`/ru/coffee/sets/${group.id}`);
  await expect(
    page.getByRole('link', { name: 'Updated coffee', exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: c.archive, exact: true }).click();
  await page
    .getByRole('button', { name: ru.Common.confirm, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: c.restore, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: c.restore, exact: true }).click();
  await page
    .getByRole('button', { name: ru.Common.confirm, exact: true })
    .click();
  await expect(page.getByText(/Дрипы · Архив/)).toHaveCount(2);
});

test('a lost quick-brew response retries without consuming a second drip', async ({
  page,
}) => {
  await signIn(page);
  const item = await createViaApi(page, 'drip', 3, 'Retry drip');
  await page.goto('/ru/coffee/items/' + item.id);
  let loseResponse = true;
  await page.route('**/api/v1/brews', async (route) => {
    if (route.request().method() === 'POST' && loseResponse) {
      loseResponse = false;
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.abort('failed');
    } else await route.continue();
  });
  await page
    .getByRole('button', { name: ru.Coffee.drank, exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: ru.Errors.SERVICE_UNAVAILABLE }),
  ).toHaveText(ru.Errors.SERVICE_UNAVAILABLE);
  const persisted = await (
    await page.request.get('/api/v1/coffee-items/' + item.id)
  ).json();
  expect(persisted.remaining).toBe(2);
  await page
    .getByRole('button', { name: ru.Coffee.drank, exact: true })
    .click();
  await expect(page.locator('.coffee-remaining')).toContainText('2');
  await expect(page.locator('.coffee-history-row')).toHaveCount(1);
});

test.describe('device time zone', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('calendar dates remain unchanged and brew time is stored as UTC', async ({
    page,
  }) => {
    await signIn(page, 'en');
    const item = await createViaApi(page, 'beans', 2500, 'Time zone coffee');
    await page.goto(`/en/coffee/items/${item.id}/edit`);
    await page.getByText(en.Coffee.details, { exact: true }).click();
    await page
      .getByLabel(en.Coffee.roastDate, { exact: true })
      .fill('2026-06-01');
    await page
      .getByRole('button', { name: en.Common.save, exact: true })
      .click();
    await expect(page.getByText('2026-06-01', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: en.Coffee.brew, exact: true }).click();
    await page
      .getByLabel(`${en.Coffee.dose}, ${en.Coffee.grams}`, { exact: true })
      .fill('15');
    await page
      .getByLabel(en.Coffee.occurredAt, { exact: true })
      .fill('2026-06-15T08:30');
    await page
      .getByRole('button', { name: en.Coffee.saveBrew, exact: true })
      .click();
    await expect(page.locator('.coffee-history-row')).toHaveCount(1);
    const history = await (
      await page.request.get('/api/v1/brews?itemId=' + item.id)
    ).json();
    expect(history.items[0].occurredAt).toBe('2026-06-15T12:30:00.000Z');
    await page
      .locator('.coffee-history-row')
      .getByRole('link', { name: en.Coffee.edit, exact: true })
      .click();
    await expect(
      page.getByLabel(en.Coffee.occurredAt, { exact: true }),
    ).toHaveValue('2026-06-15T08:30');
  });
});

test('coffee pages fit both languages across responsive widths', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Responsive matrix runs once per locale.',
  );
  test.setTimeout(180000);
  await signIn(page);
  const item = await createViaApi(
    page,
    'drip',
    3,
    'Brazil Guatemala — a longer coffee title',
  );
  const setResponse = await page.request.post('/api/v1/coffee-sets', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      name: 'World Cup collection',
      items: [{ name: 'Guatemala', format: 'drip', initialQuantity: 2 }],
    },
  });
  expect(setResponse.ok()).toBeTruthy();
  const group = await setResponse.json();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const locale of ['ru', 'en'])
    for (const width of [360, 390, 768, 1280, 1440])
      for (const [label, path] of Object.entries({
        list: 'coffee',
        new: 'coffee/new',
        setNew: 'coffee/sets/new',
        item: `coffee/items/${item.id}`,
        set: `coffee/sets/${group.id}`,
        edit: `coffee/items/${item.id}/edit`,
        brew: `coffee/items/${item.id}/brew`,
        adjust: `coffee/items/${item.id}/adjust`,
        history: 'brews',
      })) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`/${locale}/${path}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(
          page.getByRole('status').filter({ hasText: /Загрузка|Loading/ }),
        ).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBeTruthy();
        await page.screenshot({
          path: `test-results/coffee/${locale}-${width}-${label}.png`,
          fullPage: true,
        });
      }
  expect(errors).toEqual([]);
});
