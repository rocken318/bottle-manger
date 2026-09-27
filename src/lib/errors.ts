const MESSAGES: Record<string, string> = {
  inactive_drink: '廃止されたボトルが含まれています',
  inactive_location: '無効になった拠点が含まれています',
  already_voided: 'この記録はすでに取り消されています',
  movement_not_found: '記録が見つかりません',
  staff_not_found: 'スタッフが見つかりません',
  cannot_demote_self: '自分自身を無効化したり、スタッフ権限に変更したりはできません',
  last_admin: '管理者が1人もいなくなるため変更できません',
  invalid_pin_format: 'PINは4〜6桁の数字にしてください',
  drink_not_found: 'ボトルが見つかりません',
  wrong_current_pin: '現在のPINが違います',
  same_pin: '新しいPINが現在のPINと同じです',
  pin_locked: 'PINを5回間違えたため15分間変更できません',
  location_not_found: '拠点が見つかりません',
  location_has_stock: '在庫が残っているため無効にできません。移動または棚卸で0本にしてから無効にしてください',
  drink_has_stock: '在庫が残っているため廃止できません。棚卸などで全拠点を0本にしてから廃止してください',
  price_not_found: '卸価格が見つかりません（すでに削除されています）',
};

export function toUserMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === '23505') return '同じ名前がすでに登録されています';
  if (code === '23503') return '関連するデータが見つかりません';
  const message = error instanceof Error ? error.message : '';
  if (Object.hasOwn(MESSAGES, message)) return MESSAGES[message];
  console.error(error);
  return 'エラーが発生しました。もう一度お試しください';
}
