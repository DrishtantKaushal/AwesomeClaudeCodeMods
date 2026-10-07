import { describe, expect, test } from 'claude-code/testing';
import type { SessionMessage } from 'claude-code';
import { trimToolHistory } from './trim';

const user = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] });
const call = (id: string, input = 'x'.repeat(200)): SessionMessage => ({
  role: 'assistant',
  text: '',
  toolUses: [{ tool_use_id: id, tool: 'Read', input: { file_path: input } }],
});
const result = (id: string, text = 'r'.repeat(2000)): SessionMessage => ({
  role: 'user',
  text: '',
  toolUses: [],
  toolResults: [{ tool_use_id: id, text, isError: false }],
});

describe('trimToolHistory', () => {
  test('残す範囲より古いツール呼び出しと結果を、ペアごと消す', async () => {
    const input = [user('依頼'), call('a'), result('a'), user('次'), ...Array.from({ length: 6 }, (_, i) => user(`最近${i}`))];
    const out = trimToolHistory(input, 6);
    expect(out.messages.some((m) => m.toolUses.length > 0)).toBe(false);
    expect(out.messages.some((m) => (m.toolResults ?? []).length > 0)).toBe(false);
    expect(out.dropped).toBe(1);
  });

  test('先頭メッセージと直近 N 件の呼び出しは残す', async () => {
    const first: SessionMessage = { ...call('first'), role: 'assistant' };
    const input = [first, result('first'), user('a'), user('b'), call('recent'), result('recent')];
    const out = trimToolHistory(input, 2);
    const ids = out.messages.flatMap((m) => m.toolUses.map((t) => t.tool_use_id));
    expect(ids).toEqual(['first', 'recent']);
    const resultIds = out.messages.flatMap((m) => (m.toolResults ?? []).map((r) => r.tool_use_id));
    expect(resultIds).toEqual(['first', 'recent']);
  });

  test('結果だけが直近の範囲にあり呼び出しが古い場合は、結果も消す（呼び出しの無い結果を残さない）', async () => {
    const input = [user('依頼'), call('old'), user('間'), result('old')];
    const out = trimToolHistory(input, 1);
    const resultIds = out.messages.flatMap((m) => (m.toolResults ?? []).map((r) => r.tool_use_id));
    expect(resultIds).toEqual([]);
  });

  test('呼び出しが会話に無い結果は、直近の範囲にあっても消す', async () => {
    const input = [user('依頼'), user('間'), result('orphan')];
    const out = trimToolHistory(input, 6);
    const resultIds = out.messages.flatMap((m) => (m.toolResults ?? []).map((r) => r.tool_use_id));
    expect(resultIds).toEqual([]);
  });

  test('本文の無いメッセージは消し、本文のあるメッセージは本文を原文のまま残す', async () => {
    const mixed: SessionMessage = { role: 'assistant', text: '方針を説明', toolUses: call('m').toolUses };
    const input = [user('依頼'), mixed, result('m'), user('a'), user('b')];
    const out = trimToolHistory(input, 2);
    expect(out.messages.map((m) => m.text)).toEqual(['依頼', '方針を説明', 'a', 'b']);
    expect(out.messages[1]!.toolUses).toEqual([]);
  });

  test('変更しなかったメッセージは同じオブジェクトを返す（engine の handle を保つ）', async () => {
    const keep = { ...user('依頼'), handle: 'h1' };
    const out = trimToolHistory([keep, call('a'), result('a'), user('z')], 1);
    expect(out.messages[0]).toBe(keep);
  });

  test('削減率を文字数で返す', async () => {
    const input = [user('依頼'), call('a'), result('a'), user('z')];
    const out = trimToolHistory(input, 1);
    expect(out.charsBefore).toBeGreaterThan(out.charsAfter);
    expect(out.reduction).toBeGreaterThan(0.9);
  });

  test('ツール呼び出しが無ければ何も変えず、削減率は 0', async () => {
    const input = [user('a'), user('b')];
    const out = trimToolHistory(input, 1);
    expect(out.messages).toEqual(input);
    expect(out.reduction).toBe(0);
    expect(out.dropped).toBe(0);
  });

  test('空の会話でも例外を出さない', async () => {
    const out = trimToolHistory([], 6);
    expect(out.messages).toEqual([]);
    expect(out.reduction).toBe(0);
  });
});
