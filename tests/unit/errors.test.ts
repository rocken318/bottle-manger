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
    expect(toUserMessage(new Error('inactive_drink'))).toBe('廃止されたドリンクが含まれています');
    expect(toUserMessage(new Error('already_voided'))).toBe('この記録はすでに取り消されています');
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
