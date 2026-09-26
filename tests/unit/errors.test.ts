import { describe, expect, it, vi } from 'vitest';
import { toUserMessage } from '@/lib/errors';

describe('toUserMessage', () => {
  it('maps unique violations', () => {
    expect(toUserMessage(Object.assign(new Error('dup'), { code: '23505' }))).toBe('同じ名前がすでに登録されています');
  });
  it('maps foreign key violations', () => {
    expect(toUserMessage(Object.assign(new Error('fk'), { code: '23503' }))).toBe('関連するデータが見つかりません');
  });
  it('maps known domain errors', () => {
    expect(toUserMessage(new Error('inactive_drink'))).toBe('廃止されたボトルが含まれています');
    expect(toUserMessage(new Error('already_voided'))).toBe('この記録はすでに取り消されています');
    expect(toUserMessage(new Error('wrong_current_pin'))).toBe('現在のPINが違います');
    expect(toUserMessage(new Error('same_pin'))).toBe('新しいPINが現在のPINと同じです');
    expect(toUserMessage(new Error('pin_locked'))).toBe('PINを5回間違えたため15分間変更できません');
  });
  it('hides unknown errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(toUserMessage(new Error('boom'))).toBe('エラーが発生しました。もう一度お試しください');
  });
  it('does not treat inherited Object properties as known error codes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(toUserMessage(new Error('constructor'))).toBe('エラーが発生しました。もう一度お試しください');
  });
});
