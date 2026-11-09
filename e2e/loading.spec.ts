import { test, expect } from '@playwright/test';

test('shows loading content while the client bundle is delayed, then opens the connected menu', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/.*\.js$/, async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByRole('status')).toHaveText('Загружаем игру…');
    await expect(page.locator('#boot-screen')).toBeVisible();
    release();
    await expect(page.getByPlaceholder('Имя или позывной')).toBeVisible();
    await expect(page.getByText('Связь установлена', { exact: true })).toBeVisible();
    await expect(page.locator('#boot-screen')).toHaveCount(0);
  } finally {
    release();
  }
});

test('shows a persistent retry message if the game script cannot be downloaded', async ({
  page,
}) => {
  await page.clock.install();
  await page.route(/\/assets\/.*\.js$/, (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Не удалось загрузить игру');
  await expect(page.getByRole('link', { name: 'Обновить страницу' })).toBeVisible();
  await page.clock.fastForward(21000);
  await expect(page.getByRole('status')).toContainText('Не удалось загрузить игру');
});
