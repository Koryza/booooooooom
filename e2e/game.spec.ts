import { test, expect, type Page } from '@playwright/test';
async function create(page: Page, name = 'ИгрокАльфа') {
  await page.goto('/');
  await page.getByPlaceholder('Имя или позывной').fill(name);
  await expect(page.getByText('Связь установлена', { exact: true })).toBeVisible();
  await page.locator('form').getByRole('button', { name: 'Создать комнату', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Участники', exact: true })).toBeVisible();
  return (await page.locator('.invite-code b').textContent())!;
}
async function join(page: Page, code: string, name: string) {
  await page.goto('/?room=' + code);
  await page.getByPlaceholder('Имя или позывной').fill(name);
  await page.getByRole('button', { name: 'Присоединиться', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Участники', exact: true })).toBeVisible();
}
async function begin(pages: Page[]) {
  for (const page of pages)
    await page.getByRole('button', { name: 'Я готов', exact: true }).click();
  await pages[0].getByRole('button', { name: 'Раздать случайные карты' }).click();
  for (const page of pages)
    await expect(page.locator('.table-shell')).toHaveAttribute('data-phase', 'reveal');
}
const tile = (page: Page, name: string) =>
  page.locator('.player-tile').filter({ has: page.locator('header h3', { hasText: name }) });
const vote = (page: Page, name: string) =>
  tile(page, name).getByRole('button', { name: 'Голос за исключение', exact: true }).click();
test('three browsers play a complete social card game, use a special, vote secretly and deal again', async ({
  browser,
  baseURL,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 3 }, () => browser.newContext({ baseURL })),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [a, b, c] = pages;
  const errors: string[] = [];
  pages.forEach((p) => p.on('pageerror', (e) => errors.push(e.message)));
  try {
    const code = await create(a);
    await join(b, code, 'ИгрокБета');
    await join(c, code, 'ИгрокГамма');
    await begin(pages);
    await expect(a.locator('.private-cards .sheet-card')).toHaveCount(8);
    await expect(a.locator('.special-card')).toHaveCount(2);
    await expect(tile(b, 'ИгрокАльфа').locator('.hidden-card')).toHaveCount(7);
    const ownHealth = a.locator('.sheet-card[data-category="health"]');
    await expect(ownHealth.locator('h3')).not.toBeEmpty();
    await expect(
      tile(b, 'ИгрокАльфа').locator('[data-category="health"] .hidden-card'),
    ).toBeVisible();
    await a.locator('.special-card').first().getByRole('button', { name: 'Сыграть карту' }).click();
    await a.getByRole('dialog').getByRole('button', { name: 'Сыграть спецкарту' }).click();
    await expect(a.getByRole('dialog')).not.toBeVisible();
    await expect(a.locator('.special-card.used')).toHaveCount(1);
    const health = await ownHealth.locator('h3').textContent();
    await a.getByRole('button', { name: 'Раскрыть: Здоровье', exact: true }).click();
    await expect(tile(b, 'ИгрокАльфа').locator('[data-category="health"]')).toContainText(health!);
    await b.getByRole('button', { name: 'Раскрыть: Здоровье', exact: true }).click();
    await c.getByRole('button', { name: 'Раскрыть: Здоровье', exact: true }).click();
    await expect(a.locator('.table-shell')).toHaveAttribute('data-phase', 'discussion');
    await b
      .getByRole('textbox', { name: 'Сообщение команде' })
      .fill('Мой персонаж пригодится группе.');
    await b.getByRole('button', { name: 'Отправить сообщение' }).click();
    await expect(a.locator('.messages')).toContainText('Мой персонаж пригодится группе.');
    await a.getByRole('button', { name: 'Начать голосование', exact: true }).click();
    await vote(a, 'ИгрокГамма');
    await expect(
      tile(a, 'ИгрокГамма').getByRole('button', { name: 'Ваш голос за исключение', exact: true }),
    ).toContainText('Ваш голос за исключение');
    await expect(b.locator('.round-actions')).toContainText('1/3 голосов');
    await vote(b, 'ИгрокГамма');
    await vote(c, 'ИгрокБета');
    await expect(a.locator('.table-shell')).toHaveAttribute('data-phase', 'results');
    await expect(tile(a, 'ИгрокГамма')).toHaveClass(/eliminated/);
    await c.reload();
    await expect(tile(c, 'ИгрокГамма')).toHaveClass(/eliminated/);
    await expect(c.getByRole('button', { name: 'Раскрыть: Хобби', exact: true })).toBeDisabled();
    await a.getByRole('button', { name: 'Следующий раунд', exact: true }).click();
    await a.getByRole('button', { name: 'Раскрыть: Хобби', exact: true }).click();
    await b.getByRole('button', { name: 'Раскрыть: Хобби', exact: true }).click();
    await a.getByRole('button', { name: 'Начать голосование', exact: true }).click();
    await vote(a, 'ИгрокБета');
    await vote(b, 'ИгрокАльфа');
    await expect(a.locator('.result-banner')).toContainText('переголосование');
    await vote(a, 'ИгрокБета');
    await vote(b, 'ИгрокАльфа');
    await expect(a.locator('.table-shell')).toHaveAttribute('data-phase', 'ended');
    await expect(a.locator('.finale-banner')).toContainText('В бункере остаются');
    await expect(a.locator('.player-board .hidden-card')).toHaveCount(0);
    await a.screenshot({ path: 'test-results/bunker-cards-finale.png', fullPage: true });
    await a.getByRole('button', { name: 'Новая случайная раздача' }).click();
    await expect(a.getByRole('heading', { name: 'Участники', exact: true })).toBeVisible();
    await begin(pages);
    await expect(a.locator('.round-heading')).toContainText('ПАРТИЯ 02');
    await a.screenshot({ path: 'test-results/bunker-cards-table.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
  }
});
test('restores a private hand from a downloaded session key without redealing', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL });
  const a = await context.newPage();
  const code = await create(a, 'Архивист');
  const bcontext = await browser.newContext({ baseURL });
  const b = await bcontext.newPage();
  try {
    await join(b, code, 'Товарищ');
    await begin([a, b]);
    const hand = await a.locator('.private-cards h3').allTextContents();
    await a.getByRole('button', { name: 'Настройки', exact: true }).click();
    const download = a.waitForEvent('download');
    await a.getByRole('button', { name: 'Скачать ключ сессии' }).click();
    const file = await (await download).path();
    await a.getByRole('button', { name: 'Сохранить сейчас', exact: true }).click();
    await expect(a.getByRole('status')).toContainText('Партия сохранена');
    await a.getByRole('button', { name: 'Выйти в меню', exact: true }).click();
    await a.locator('input[type=file]').setInputFiles(file!);
    await expect(a.locator('.table-shell')).toHaveAttribute('data-phase', 'reveal');
    expect(await a.locator('.private-cards h3').allTextContents()).toEqual(hand);
    await expect(a.locator('.room-code')).toContainText(code);
  } finally {
    await context.close();
    await bcontext.close();
  }
});
test('mobile random-hand UI is usable with no horizontal overflow', async ({
  browser,
  baseURL,
}) => {
  const mobile = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } }),
    friend = await browser.newContext({ baseURL });
  const a = await mobile.newPage(),
    b = await friend.newPage();
  try {
    const code = await create(a, 'Мобильный');
    await join(b, code, 'Друг');
    await begin([a, b]);
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await a.getByRole('button', { name: 'Раскрыть: Биология', exact: true }).click();
    await expect(
      tile(b, 'Мобильный').locator('[data-category=biology] .revealed-trait'),
    ).toBeVisible();
    await a.screenshot({ path: 'test-results/bunker-cards-mobile.png', fullPage: true });
  } finally {
    await mobile.close();
    await friend.close();
  }
});
