import { test, expect, type Page } from '@playwright/test';
async function create(page: Page, name = 'Север') {
  await page.goto('/');
  await page.getByPlaceholder('Как к вам обращаться?').fill(name);
  await expect(page.getByText('КАНАЛ СВЯЗИ АКТИВЕН')).toBeVisible();
  await page.getByRole('button', { name: 'Создать убежище' }).click();
  await expect(page.getByRole('heading', { name: 'Группа выживших' })).toBeVisible();
  return (await page.locator('.invite-code b').textContent())!;
}
test('two browsers survive, repair, chat, share resources and reconnect', async ({
  browser,
  baseURL,
}) => {
  const a = await browser.newContext({ baseURL });
  const b = await browser.newContext({ baseURL });
  try {
    const host = await a.newPage(),
      guest = await b.newPage();
    let keyboardCommandSent = false;
    host.on('websocket', (ws) =>
      ws.on('framesent', (frame) => {
        const text = String(frame.payload);
        if (text.includes('"type":"move"') && text.includes('"x":1')) keyboardCommandSent = true;
      }),
    );
    const code = await create(host);
    await guest.goto('/?room=' + code);
    await guest.getByPlaceholder('Как к вам обращаться?').fill('Искра');
    await guest.getByRole('button', { name: /МЕД Медик/ }).click();
    await guest.getByRole('button', { name: 'Войти в бункер', exact: true }).click();
    await expect(host.getByText('Искра', { exact: true })).toBeVisible();
    await host.getByRole('button', { name: 'Я готов', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Войти в бункер' })).toBeDisabled();
    await guest.getByRole('button', { name: 'Я готов', exact: true }).click();
    await host.getByRole('button', { name: 'Войти в бункер' }).click();
    await expect(host.locator('canvas')).toBeVisible();
    await expect(guest.locator('canvas')).toBeVisible();
    await guest.getByRole('button', { name: 'Инвентарь', exact: true }).click();
    await guest.locator('.give-row').getByRole('button', { name: 'Аптечка', exact: true }).click();
    await guest.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await host.getByRole('button', { name: 'Инвентарь', exact: true }).click();
    await expect(host.getByRole('heading', { name: 'Аптечка × 2' })).toBeVisible();
    await host.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await host.keyboard.down('d');
    try {
      await expect.poll(() => keyboardCommandSent).toBe(true);
    } finally {
      await host.keyboard.up('d');
    }
    await host
      .locator('.room-selector')
      .getByRole('button', { name: 'Генераторная', exact: true })
      .click();
    await host.getByRole('button', { name: 'Перейти в отсек' }).click();
    await expect(host.locator('.location-label')).toContainText('Генераторная', { timeout: 20000 });
    await host.getByRole('button', { name: /Починить оборудование/ }).click();
    const puzzle = host.getByRole('dialog', { name: 'Восстановление контура' });
    const sequence = await puzzle.locator('.wire-sequence span').allTextContents();
    for (const letter of sequence)
      await puzzle.getByRole('button', { name: letter, exact: true }).click();
    await expect(puzzle).not.toBeVisible();
    const repair = 'Север: починить оборудование — завершено.';
    await expect(host.locator('.game-messages p').filter({ hasText: repair })).toBeVisible({
      timeout: 15000,
    });
    await expect(guest.locator('.game-messages p').filter({ hasText: repair })).toBeVisible();
    await guest.getByRole('textbox', { name: 'Сообщение команде' }).fill('Генератор работает!');
    await guest.getByRole('button', { name: 'Отправить сообщение' }).click();
    await host.getByRole('button', { name: /Чат команды/ }).click();
    await expect(host.getByText('Генератор работает!', { exact: false })).toBeVisible();
    await guest.reload();
    await expect(guest.locator('canvas')).toBeVisible();
    await expect(guest.locator('.character-name')).toContainText('Искра');
    await host.screenshot({ path: 'test-results/bunker-desktop.png', fullPage: true });
  } finally {
    await a.close();
    await b.close();
  }
});
test('exports and imports a private session key to continue the same character', async ({
  page,
}) => {
  const code = await create(page, 'Архивист');
  await page.getByRole('button', { name: 'Я готов', exact: true }).click();
  await page.getByRole('button', { name: 'Войти в бункер' }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать ключ своей сессии' }).click();
  const file = await (await download).path();
  await page.getByRole('button', { name: 'Сохранить сейчас', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Убежище сохранено');
  await page.getByRole('button', { name: 'Выйти в главное меню' }).click();
  await expect(page.getByRole('button', { name: 'Создать убежище' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(file!);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.game-room-code')).toContainText(code);
  await expect(page.locator('.character-name')).toContainText('Архивист');
});
test('mobile menu and bunker remain usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page, 'Путник');
  await page.getByRole('button', { name: 'Я готов', exact: true }).click();
  await page.getByRole('button', { name: 'Войти в бункер' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Исследования', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Технологии нового мира' })).toBeVisible();
  await page.screenshot({ path: 'test-results/bunker-mobile.png', fullPage: true });
});
