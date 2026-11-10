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

for (const [locale, messages] of Object.entries({ ru, en })) {
  test(`${locale}: photo links and skip link support keyboard navigation`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: messages.Home.skip });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();

    for (const feature of ['beans', 'brews', 'stock'] as const) {
      const link = page.getByRole('link', {
        name: messages.Home[`${feature}Title`],
        exact: true,
      });
      await link.focus();
      await expect(link).toBeFocused();
      expect(
        await link.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        ),
      ).toBe('solid');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/${locale}#${feature}$`));
      await expect(page.locator(`#${feature}`)).toBeInViewport();
    }
  });

  test(`${locale}: local fonts and photographs render across responsive widths`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'The viewport matrix runs once per locale.',
    );
    const failures: string[] = [];
    page.on('requestfailed', (request) => {
      // Resizing can cancel an obsolete srcset candidate before its replacement loads.
      if (
        request.resourceType() === 'image' &&
        request.failure()?.errorText === 'net::ERR_ABORTED'
      )
        return;
      failures.push(`${request.failure()?.errorText} ${request.url()}`);
    });
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== 'http://127.0.0.1:3100') {
        failures.push(`External request: ${request.url()}`);
      }
    });
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400)
        failures.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`/${locale}`);
    for (const width of [360, 390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const images = page.locator('main img');
      for (const image of await images.all()) {
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            image.evaluate(async (element) => {
              const image = element as HTMLImageElement;
              try {
                await image.decode();
                return image.complete && image.naturalWidth > 0;
              } catch {
                return false;
              }
            }),
          )
          .toBe(true);
      }
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const cards = page.locator('.category-card');
      const first = await cards.nth(0).boundingBox();
      const second = await cards.nth(1).boundingBox();
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      if (width <= 760) {
        expect(second!.y).toBeGreaterThan(first!.y);
        expect(first!.height).toBeLessThan(first!.width);
      } else {
        expect(second!.y).toBe(first!.y);
        expect(second!.x).toBeGreaterThan(first!.x);
      }
      await page.evaluate(async () => {
        window.scrollTo(0, 0);
        await Promise.all(
          Array.from(document.images).map((image) => image.decode()),
        );
        // Let the compositor paint the decoded images after scrolling back to the top.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
      await page.screenshot({
        path: testInfo.outputPath(`${locale}-${width}.png`),
        fullPage: true,
      });
      if (width === 1440) {
        await page.screenshot({
          path: testInfo.outputPath(`${locale}-preview.png`),
        });
      }
    }
    const fontState = await page.evaluate(() => {
      const din = getComputedStyle(document.documentElement)
        .getPropertyValue('--font-din')
        .trim()
        .split(',')[0]
        .replaceAll('"', '')
        .replaceAll("'", '');
      const gotham = getComputedStyle(document.documentElement)
        .getPropertyValue('--font-gotham')
        .trim()
        .split(',')[0]
        .replaceAll('"', '')
        .replaceAll("'", '');
      return {
        din: ['400', '500', '900'].map((weight) =>
          document.fonts.check(`${weight} 24px "${din}"`, 'АаЁёЙй Coffee'),
        ),
        gotham: ['400', '500'].map((weight) =>
          document.fonts.check(`${weight} 16px "${gotham}"`, 'АаЁёЙй Coffee'),
        ),
        loaded: Array.from(document.fonts).filter(
          (face) => face.status === 'loaded',
        ).length,
        synthetic: getComputedStyle(document.body).fontSynthesis,
      };
    });
    expect(fontState.din).toEqual([true, true, true]);
    expect(fontState.gotham).toEqual([true, true]);
    expect(fontState.loaded).toBeGreaterThanOrEqual(5);
    expect(fontState.synthetic).toBe('none');
    expect(failures).toEqual([]);
  });
}
