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
  await page.getByRole('link', { name: 'ボトル', exact: true }).click();
  await page.getByLabel('ボトル名').fill('コーラ');
  await page.getByLabel('1ケースの本数').fill('24');
  await page.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.getByText('コーラ を登録しました')).toBeVisible();

  // Receive 2 cases at 事務所 (the admin's home location)
  await page.getByRole('link', { name: '入力', exact: true }).click();
  await page.getByLabel('コーラのケース').fill('2');
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByText('入荷 1件登録しました')).toBeVisible();

  // Transfer 5 bottles to Kingyo
  await page.getByRole('button', { name: '移動', exact: true }).click();
  await page.getByLabel('移動先').selectOption({ label: 'Kingyo' });
  await page.getByLabel('コーラの本').fill('5');
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByText('移動 1件登録しました')).toBeVisible();

  // Check stock (the stock page opens on the all-locations table)
  await page.getByRole('link', { name: '在庫', exact: true }).click();
  await expect(page.getByLabel('表示する拠点')).toHaveValue('all');
  await page.getByLabel('表示する拠点').selectOption({ label: '事務所' });
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
  await page.getByLabel('表示する拠点').selectOption({ label: '事務所' });
  await expect(page.getByText('2ケース（計48本）')).toBeVisible();

  // The drink name on the stock page opens the entry page for that drink
  await page.getByRole('link', { name: 'コーラ', exact: true }).click();
  await expect(page).toHaveURL(/\/entry\?drink=/);
  await expect(page.getByLabel('絞り込み')).toHaveValue('コーラ');
  await expect(page.getByLabel('コーラのケース')).toBeVisible();
  await expect(page.getByLabel('拠点').locator('option:checked')).toHaveText('事務所');

  // Anyone can edit a drink: rename コーラ → コーラ500
  await page.getByRole('link', { name: 'ボトル', exact: true }).click();
  await page.getByRole('button', { name: 'コーラを編集' }).click();
  await page.getByLabel('コーラの名前').fill('コーラ500');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('保存しました')).toBeVisible();

  await page.getByRole('link', { name: '在庫', exact: true }).click();
  await expect(page.getByRole('link', { name: 'コーラ500', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'コーラ', exact: true })).toHaveCount(0);
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

test('staff can change their own PIN', async ({ page }) => {
  // 花子 (PIN 5678) was registered by the previous test.
  await login(page, '花子', '5678');
  await page.getByRole('link', { name: '花子', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);

  // A wrong current PIN is rejected and the typed values are kept
  await page.getByLabel('現在のPIN').fill('0000');
  await page.getByLabel('新しいPIN', { exact: true }).fill('2468');
  await page.getByLabel('新しいPIN（確認）').fill('2468');
  await page.getByRole('button', { name: 'PINを変更' }).click();
  await expect(page.getByText('現在のPINが違います')).toBeVisible();
  await expect(page.getByLabel('現在のPIN')).toHaveValue('0000');
  await expect(page.getByLabel('新しいPIN', { exact: true })).toHaveValue('2468');
  await expect(page.getByLabel('新しいPIN（確認）')).toHaveValue('2468');

  await page.getByLabel('現在のPIN').fill('5678');
  await page.getByLabel('新しいPIN', { exact: true }).fill('2468');
  await page.getByLabel('新しいPIN（確認）').fill('2468');
  await page.getByRole('button', { name: 'PINを変更' }).click();
  await expect(page.getByText('PINを変更しました')).toBeVisible();
  await expect(page.getByLabel('現在のPIN')).toHaveValue('');

  await page.getByRole('button', { name: 'ログアウト' }).click();

  // The old PIN no longer works
  await page.goto('/login');
  await page.getByLabel('名前').selectOption({ label: '花子' });
  await page.getByLabel('PIN').fill('5678');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByText('PINが違います')).toBeVisible();

  await login(page, '花子', '2468');
});

test('bulk entry: several drinks, hidden rows, tab switch and a zero stocktake', async ({ page }) => {
  // コーラ500 (renamed in the first test) has 48 bottles at 事務所.
  await login(page, '管理者', '1234');
  await page.getByRole('link', { name: 'ボトル', exact: true }).click();
  await page.getByLabel('ボトル名').fill('お茶');
  await page.getByLabel('1ケースの本数').fill('24');
  await page.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.getByText('お茶 を登録しました')).toBeVisible();

  // Two drinks in one submit
  await page.getByRole('link', { name: '入力', exact: true }).click();
  await page.getByLabel('コーラ500のケース').fill('1');
  await page.getByLabel('お茶のケース').fill('1');
  await expect(page.getByText('入力中 2件')).toBeVisible();
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByText('入荷 2件登録しました')).toBeVisible();
  await expect(page.getByLabel('お茶のケース')).toHaveValue('');

  // A filled row hidden by the filter is only submitted after confirmation
  await page.getByLabel('お茶の本').fill('3');
  await page.getByLabel('絞り込み').fill('コーラ');
  await expect(page.getByLabel('お茶の本')).toHaveCount(0);
  await expect(page.getByText('入力中 1件（うち 1件は絞り込みで非表示）')).toBeVisible();
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'お茶' })).toBeVisible();
  await page.getByRole('button', { name: '非表示の分も含めて登録する' }).click();
  await expect(page.getByText('入荷 1件登録しました')).toBeVisible();
  await page.getByLabel('絞り込み').fill('');

  // Switching the type while rows are filled asks first
  await page.getByLabel('お茶のケース').fill('9');
  await page.getByRole('button', { name: '棚卸', exact: true }).click();
  await expect(page.getByText('入力中の1件を消して「棚卸」に切り替えますか？')).toBeVisible();
  await page.getByRole('button', { name: 'やめる' }).click();
  await expect(page.getByRole('button', { name: '入荷', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('お茶のケース')).toHaveValue('9');
  await page.getByRole('button', { name: '棚卸', exact: true }).click();
  await page.getByRole('button', { name: '消して切り替える' }).click();
  await expect(page.getByRole('button', { name: '棚卸', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('お茶のケース')).toHaveValue('');

  // Stocktake with an explicit 0 (book: 1 case + 3 = 27 bottles)
  await page.getByLabel('お茶のケース').fill('0');
  await expect(page.getByText(/差 −27本/)).toBeVisible();
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByText('棚卸 1件登録しました')).toBeVisible();

  await page.getByRole('link', { name: '在庫', exact: true }).click();
  await page.getByLabel('表示する拠点').selectOption({ label: '事務所' });
  await expect(page.getByRole('listitem').filter({ hasText: 'お茶' })).toContainText('0本');
  await expect(page.getByRole('listitem').filter({ hasText: 'コーラ500' })).toContainText('3ケース（計72本）');
});

test('stock page: only-in-stock filter hides zero-stock drinks', async ({ page }) => {
  // From the previous test: お茶 was counted to exactly 0 (everywhere); コーラ500 has 72
  // bottles at 事務所 and 0 everywhere else.
  await login(page, '管理者', '1234');
  await page.getByRole('link', { name: '在庫', exact: true }).click();
  await expect(page.getByLabel('表示する拠点')).toHaveValue('all');

  // Off by default: both drinks are visible in the all-locations table.
  await expect(page.getByLabel('在庫があるものだけ表示')).not.toBeChecked();
  await expect(page.getByRole('link', { name: 'お茶', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'コーラ500', exact: true })).toBeVisible();

  // Turning it on hides お茶 (0 everywhere) but keeps コーラ500 (has stock at 事務所).
  await page.getByLabel('在庫があるものだけ表示').check();
  await expect(page.getByRole('link', { name: 'お茶', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'コーラ500', exact: true })).toBeVisible();

  // Same behaviour in the single-location view.
  await page.getByLabel('表示する拠点').selectOption({ label: '事務所' });
  await expect(page.getByRole('link', { name: 'お茶', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'コーラ500', exact: true })).toBeVisible();

  // A location with no stock at all for either drink shows the empty message while filtered.
  await page.getByLabel('表示する拠点').selectOption({ label: 'Kingyo' });
  await expect(page.getByText('該当するボトルがありません')).toBeVisible();

  // Turning it back off restores both drinks.
  await page.getByLabel('表示する拠点').selectOption({ label: '事務所' });
  await page.getByLabel('在庫があるものだけ表示').uncheck();
  await expect(page.getByRole('link', { name: 'お茶', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'コーラ500', exact: true })).toBeVisible();
});
