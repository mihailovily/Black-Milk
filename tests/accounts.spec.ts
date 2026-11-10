import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from '@playwright/test';
import { ADMIN_EMAIL, MEMBER_EMAIL, TEST_PASSWORD } from './support/constants';
import ru from '../messages/ru.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:3101/reset-limits');
});

async function signIn(
  page: Page,
  email: string,
  locale = 'ru',
  password = TEST_PASSWORD,
) {
  const m = locale === 'ru' ? ru : en;
  await page.goto(`/${locale}/sign-in`);
  await page.getByLabel(m.Common.email, { exact: true }).fill(email);
  await page.getByLabel(m.Common.password, { exact: true }).fill(password);
  await page
    .getByRole('button', { name: m.Common.signIn, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
  await expect(page.getByLabel(m.Common.email, { exact: true })).toHaveValue(
    email,
  );
}
async function linkFromMail(
  request: APIRequestContext,
  email: string,
  pathname: string,
) {
  let link = '';
  await expect
    .poll(async () => {
      const messages: string[] = await (
        await request.get('http://127.0.0.1:3101/messages')
      ).json();
      for (const raw of messages.toReversed()) {
        if (!raw.includes(email)) continue;
        const text = raw
          .replace(/=\r?\n/g, '')
          .replace(/=([A-F0-9]{2})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16)),
          );
        const candidate = text.match(/https?:\/\/[^\s<>]+/)?.[0];
        if (candidate && new URL(candidate).pathname.includes(pathname)) {
          link = candidate;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return link;
}

test('member profile, language navigation, security and logout', async ({
  page,
}) => {
  await signIn(page, MEMBER_EMAIL);
  await page
    .getByRole('link', { name: ru.Account.security, exact: true })
    .click();
  await expect(
    page.getByText(ru.Account.current, { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/account\/security$/);
  await expect(
    page.getByRole('heading', { name: en.Account.sessions, exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: en.Common.signOut, exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test('administrator creates and activates a user, then blocks and deletes it', async ({
  page,
  request,
}, info) => {
  const email = `activation-${info.project.name}@blackmilk.test`;
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/ru/admin/users');
  await page
    .getByRole('button', { name: ru.Admin.create, exact: true })
    .click();
  await page
    .getByLabel(ru.Common.name, { exact: true })
    .fill('Coffee activation');
  await page.getByLabel(ru.Common.email, { exact: true }).fill(email);
  await page
    .getByRole('button', { name: ru.Admin.create, exact: true })
    .click();
  await expect(
    page.getByText(ru.Admin.createdInvite, { exact: true }),
  ).toBeVisible();
  const activation = await linkFromMail(request, email, 'activate');
  const member = await page.context().browser()!.newContext();
  const memberPage = await member.newPage();
  await memberPage.goto(activation);
  await expect(memberPage.getByText(email, { exact: true })).toBeVisible();
  await memberPage
    .getByLabel(ru.Common.password, { exact: true })
    .fill(TEST_PASSWORD);
  await memberPage
    .getByRole('button', { name: ru.Auth.setPassword, exact: true })
    .click();
  await expect(
    memberPage.getByText(ru.Auth.passwordSaved, { exact: true }),
  ).toBeVisible();
  await signIn(memberPage, email);
  await page.goto('/ru/admin/users');
  await page.getByLabel(ru.Admin.search, { exact: true }).fill(email);
  await page.getByRole('button', { name: ru.Admin.apply, exact: true }).click();
  await page.getByRole('link', { name: ru.Admin.view, exact: true }).click();
  await page.getByRole('button', { name: ru.Admin.block, exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: ru.Common.confirm, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: ru.Admin.unblock, exact: true }),
  ).toBeVisible();
  const denied = await memberPage.request.get('/api/v1/me');
  expect([401, 403]).toContain(denied.status());
  await page
    .getByRole('button', { name: ru.Admin.delete, exact: true })
    .click();
  await page.getByRole('dialog').getByLabel(ru.Admin.confirmEmail).fill(email);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: ru.Common.confirm, exact: true })
    .click();
  await expect(page).toHaveURL(/\/ru\/admin\/users$/);
  await member.close();
});

test('allowlisted password registration verifies email through the local mailbox', async ({
  page,
  request,
}, info) => {
  const email = `signup-${info.project.name}@blackmilk.test`;
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/en/admin/access-grants');
  await page.getByLabel(en.Common.email, { exact: true }).fill(email);
  await page.getByRole('button', { name: en.Admin.grant, exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.goto('/en/account');
  await page
    .getByRole('button', { name: en.Common.signOut, exact: true })
    .click();
  await page.goto('/en/sign-up');
  await page.getByLabel(en.Common.name, { exact: true }).fill('Coffee member');
  await page.getByLabel(en.Common.email, { exact: true }).fill(email);
  await page
    .getByLabel(en.Common.password, { exact: true })
    .fill(TEST_PASSWORD);
  await page
    .getByRole('button', { name: en.Auth.signUpTitle, exact: true })
    .click();
  await expect(
    page.getByText(en.Auth.verifySent, { exact: true }),
  ).toBeVisible();
  await page.goto(await linkFromMail(request, email, 'verify-email'));
  await expect(
    page.getByText(en.Auth.emailVerified, { exact: true }),
  ).toBeVisible();
  await signIn(page, email, 'en');
});

test('password recovery and password change work through email and the security form', async ({
  page,
  request,
}, info) => {
  const email = `reset-${info.project.name}@blackmilk.test`;
  await signIn(page, ADMIN_EMAIL);
  const response = await page.request.post('/api/v1/admin/users', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { email, name: 'Password recovery', locale: 'en' },
  });
  expect(response.ok()).toBe(true);
  const member = await page.context().browser()!.newContext();
  const oldPage = await member.newPage();
  await oldPage.goto(await linkFromMail(request, email, 'activate'));
  await oldPage
    .getByLabel(en.Common.password, { exact: true })
    .fill(TEST_PASSWORD);
  await oldPage
    .getByRole('button', { name: en.Auth.setPassword, exact: true })
    .click();
  await expect(
    oldPage.getByText(en.Auth.passwordSaved, { exact: true }),
  ).toBeVisible();
  await signIn(oldPage, email, 'en');
  const recovery = await page.context().browser()!.newContext();
  const recoveryPage = await recovery.newPage();
  await recoveryPage.goto('/en/forgot-password');
  await recoveryPage.getByLabel(en.Common.email, { exact: true }).fill(email);
  await recoveryPage
    .getByRole('button', { name: en.Auth.sendReset, exact: true })
    .click();
  await expect(
    recoveryPage.getByText(en.Auth.mailSent, { exact: true }),
  ).toBeVisible();
  await recoveryPage.goto(await linkFromMail(request, email, 'reset-password'));
  const resetPassword = TEST_PASSWORD + '-reset';
  await recoveryPage
    .getByLabel(en.Common.password, { exact: true })
    .fill(resetPassword);
  await recoveryPage
    .getByRole('button', { name: en.Auth.setPassword, exact: true })
    .click();
  await expect(
    recoveryPage.getByText(en.Auth.passwordSaved, { exact: true }),
  ).toBeVisible();
  expect((await oldPage.request.get('/api/v1/me')).status()).toBe(401);
  await signIn(recoveryPage, email, 'en', resetPassword);
  await recoveryPage.goto('/en/account/security');
  await recoveryPage
    .getByLabel(en.Account.currentPassword, { exact: true })
    .fill(resetPassword);
  await recoveryPage
    .getByLabel(en.Account.newPassword, { exact: true })
    .fill(TEST_PASSWORD + '-changed');
  await recoveryPage
    .getByRole('button', { name: en.Common.save, exact: true })
    .click();
  await expect(
    recoveryPage.getByText(en.Account.passwordUpdated, { exact: true }),
  ).toBeVisible();
  await member.close();
  await recovery.close();
});

test('account and administration visual matrix, keyboard and modal focus', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signIn(page, ADMIN_EMAIL);
  if (info.project.name !== 'desktop') {
    await page.goto('/en/admin/users');
    await expect(page.locator('.loading-state')).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath('mobile-admin.png'),
      fullPage: true,
    });
    return;
  }
  for (const locale of ['ru', 'en']) {
    for (const width of [360, 390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of [
        'sign-in',
        'sign-up',
        'forgot-password',
        'verify-email',
        'reset-password',
        'activate',
        'account',
        'account/security',
        'admin/users',
        'admin/invitations',
        'admin/access-grants',
        'admin/settings',
        'admin/audit',
      ]) {
        await page.goto(`/${locale}/${route}`);
        await expect(page.getByRole('main')).toBeVisible();
        await expect(page.locator('.loading-state')).toHaveCount(0);
        if (
          ['sign-in', 'sign-up', 'forgot-password', 'verify-email'].includes(
            route,
          )
        )
          await expect(page.locator('.stack-form .button')).toBeEnabled();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(
            `${locale}-${route.replaceAll('/', '-')}-${width}.png`,
          ),
          fullPage: true,
        });
      }
    }
  }
  await page.goto('/en/admin/settings');
  await expect(page.locator('.loading-state')).toHaveCount(0);
  await page.getByRole('button', { name: en.Common.save, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: en.Common.save, exact: true }),
  ).toBeFocused();
});
