const MESSAGES: Record<string, string> = {
  inactive_drink: '廃止されたドリンクが含まれています',
  inactive_location: '無効になった拠点が含まれています',
  already_voided: 'この記録はすでに取り消されています',
  movement_not_found: '記録が見つかりません',
  staff_not_found: 'スタッフが見つかりません',
  cannot_demote_self: '自分自身を無効化したり、スタッフ権限に変更したりはできません',
  invalid_pin_format: 'PINは4〜6桁の数字にしてください',
  drink_not_found: 'ドリンクが見つかりません',
  location_not_found: '拠点が見つかりません',
};

export function toUserMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === '23505') return '同じ名前がすでに登録されています';
  const message = error instanceof Error ? error.message : '';
  if (Object.hasOwn(MESSAGES, message)) return MESSAGES[message];
  console.error(error);
  return 'エラーが発生しました。もう一度お試しください';
}
