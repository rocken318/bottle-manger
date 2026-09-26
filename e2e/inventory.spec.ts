import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, name: string, pin: string) {
  await page.goto('/login');
  await page.getByLabel('名前').selectOption({ label: name });
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByRole('link', { name: '在庫', exact: true })).toBeVisible();
}

test('receive, transfer, check stock and void', async ({ page }) => {
  await login(page, '管理者', '1234');

  // Register a drink
  await page.getByRole('link', { name: 'ドリンク', exact: true }).click();
  await page.getByLabel('ドリンク名').fill('コーラ');
  await page.getByLabel('1ケースの本数').fill('24');
  await page.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.getByText('コーラ を登録しました')).toBeVisible();

  // Receive 2 cases at 事務所 (the admin's home location)
  await page.getByRole('link', { name: '入力', exact: true }).click();
  await page.getByLabel('ドリンク1', { exact: true }).selectOption({ label: 'コーラ' });
  await page.getByLabel('ケース1').fill('2');
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByText('1件登録しました')).toBeVisible();

  // Transfer 5 bottles to Kingyo
  await page.getByRole('button', { name: '移動', exact: true }).click();
  await page.getByLabel('移動先').selectOption({ label: 'Kingyo' });
  await page.getByLabel('ドリンク1', { exact: true }).selectOption({ label: 'コーラ' });
  await page.getByLabel('本1').fill('5');
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByText('1件登録しました')).toBeVisible();

  // Check stock
  await page.getByRole('link', { name: '在庫', exact: true }).click();
  await expect(page.getByText('1ケース＋19本（計43本）')).toBeVisible();
  await page.getByLabel('表示する拠点').selectOption({ label: 'Kingyo' });
  await expect(page.getByText('5本', { exact: true })).toBeVisible();

  // Search across all locations
  await page.getByLabel('表示する拠点').selectOption({ label: '全拠点' });
  await page.getByLabel('検索').fill('こーら');
  await expect(page.getByRole('cell', { name: '計48本' })).toBeVisible();

  // Void the transfer (newest entry)
  await page.getByRole('link', { name: '履歴', exact: true }).click();
  await page.getByRole('button', { name: '取り消し' }).first().click();
  await page.getByRole('button', { name: '本当に取り消す' }).click();
  await expect(page.getByText(/取り消し済み/)).toBeVisible();

  await page.getByRole('link', { name: '在庫', exact: true }).click();
  await expect(page.getByText('2ケース（計48本）')).toBeVisible();
});

test('staff cannot see the admin area', async ({ page }) => {
  await login(page, '管理者', '1234');
  await page.getByRole('link', { name: '管理', exact: true }).click();
  await page.getByRole('link', { name: 'スタッフ管理' }).click();
  await page.getByLabel('名前').fill('花子');
  await page.getByLabel('PIN').fill('5678');
  await page.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.getByText('花子 を登録しました')).toBeVisible();
  await page.getByRole('button', { name: 'ログアウト' }).click();

  await login(page, '花子', '5678');
  await expect(page.getByRole('link', { name: '管理', exact: true })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/$/);
});
