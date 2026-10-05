import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, name: string, pin: string) {
  await page.goto('/login');
  await page.getByLabel('名前').selectOption({ label: name });
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByRole('link', { name: '在庫', exact: true })).toBeVisible();
}

test('register a keep bottle from the drink list, use it, and drop it', async ({ page }) => {
  await login(page, '管理者', '1234');

  // キープ用のお酒を在庫側で登録しておく
  await page.getByRole('link', { name: 'ボトル', exact: true }).click();
  await page.getByLabel('ボトル名').fill('キープ用ウイスキー');
  await page.getByLabel('1ケースの本数').fill('12');
  await page.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.getByText('キープ用ウイスキー を登録しました')).toBeVisible();

  // 在庫側のヘッダーからキープ側の入り口へ
  await page.getByRole('link', { name: 'キープ管理へ' }).click();
  await expect(page).toHaveURL(/\/keep$/);
  await expect(page.getByText('キープ中のボトルはありません。')).toBeVisible();

  // 登録: ひらがなで検索してお酒を選ぶ
  await page.getByRole('navigation', { name: 'キープ' }).getByRole('link', { name: '登録' }).click();
  await page.getByLabel('お客様名', { exact: true }).fill('田中様');
  await page.getByLabel('お酒の名前で検索').fill('きーぷ');
  await page.getByRole('button', { name: /キープ用ウイスキー/ }).click();
  await expect(page.getByText('選択中：キープ用ウイスキー')).toBeVisible();
  await page.getByRole('button', { name: '登録する' }).click();

  // 一覧に出る。登録したばかりなので あと180日
  await expect(page).toHaveURL(/\/keep$/);
  await expect(page.getByText('田中様')).toBeVisible();
  await expect(page.getByText('あと180日')).toBeVisible();

  // 検索（ひらがなでもカタカナでも）
  await page.getByLabel('お客様名で検索').fill('たなか');
  await expect(page.getByTestId('keep-row')).toHaveCount(0); // 「田中」は漢字なので、かなでは当たらない
  await page.getByLabel('お客様名で検索').fill('田中');
  await expect(page.getByTestId('keep-row')).toHaveCount(1);
  await page.getByLabel('お客様名で検索').fill('さとう');
  await expect(page.getByTestId('keep-row')).toHaveCount(0);
  await page.getByLabel('お客様名で検索').fill('');

  // 最終利用日の更新
  await page.getByRole('button', { name: '今日使った（最終利用日を今日にする）' }).click();
  await expect(page.getByText('最終利用日を今日にしました')).toBeVisible();

  // 期限切れにする（確認つき）
  await page.getByRole('button', { name: '期限切れにする', exact: true }).click();
  await page.getByRole('button', { name: '本当に期限切れにする' }).click();
  await expect(page.getByText('キープ中のボトルはありません。')).toBeVisible();
  await page.getByRole('tab', { name: /期限切れ（1）/ }).click();
  await expect(page.getByText('田中様')).toBeVisible();
  await expect(page.getByText(/に期限切れ/)).toBeVisible();

  // キープ側のヘッダーから在庫側へ戻れる
  await page.getByRole('link', { name: '在庫管理へ' }).click();
  await expect(page.getByRole('link', { name: '在庫', exact: true })).toBeVisible();
});

test('keep pages need a login', async ({ page }) => {
  await page.goto('/keep');
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/keep/new');
  await expect(page).toHaveURL(/\/login/);
});
