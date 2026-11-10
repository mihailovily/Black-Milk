import { expect, test } from '@playwright/test';
import en from '../messages/en.json';
import ru from '../messages/ru.json';

for (const [locale, messages] of Object.entries({ ru, en })) {
  test(`${locale}: page is translated, accessible by landmarks and fits the viewport`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    const response = await page.goto(`/${locale}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page).toHaveTitle(`Black&Milk — ${messages.Metadata.title}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `${messages.Home.title} ${messages.Home.titleEmphasis}`,
    );
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByText(messages.Home.status)).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: messages.Languages[locale as 'ru' | 'en'],
      }),
    ).toHaveAttribute('aria-current', 'page');

    await page.getByRole('link', { name: messages.Home.explore }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}#journal$`));
    await expect(
      page.getByRole('heading', { name: messages.Home.journalTitle }),
    ).toBeInViewport();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('language switch navigates between Russian and English', async ({
  page,
}) => {
  await page.goto('/ru');
  await page.getByRole('link', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    en.Home.titleEmphasis,
  );
  await page.getByRole('link', { name: 'Русский', exact: true }).click();
  await expect(page).toHaveURL(/\/ru$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    ru.Home.titleEmphasis,
  );
});

test('root defaults to Russian even when the browser requests English', async ({
  request,
}) => {
  const response = await request.get('/', {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location, response.url()).pathname).toBe(
    '/ru',
  );
});

test('health stays outside locale routing and matches its published contract', async ({
  request,
}) => {
  const response = await request.get('/api/v1/health', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(await response.json()).toEqual({ status: 'ok' });

  const spec = await request.get('/openapi.json', { maxRedirects: 0 });
  expect(spec.status()).toBe(200);
  const document = await spec.json();
  expect(document.openapi).toBe('3.1.0');
  expect(Object.keys(document.paths)).toEqual(['/api/v1/health']);
  expect(
    document.paths['/api/v1/health'].get.responses['200'].content[
      'application/json'
    ].example,
  ).toEqual(await response.json());
});

test('unknown pages return 404', async ({ request }) => {
  const response = await request.get('/ru/does-not-exist');
  expect(response.status()).toBe(404);
});
