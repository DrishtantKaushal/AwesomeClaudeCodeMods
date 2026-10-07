import type { SessionMessage } from 'claude-code';

export type TrimResult = {
  messages: SessionMessage[];
  dropped: number;
  charsBefore: number;
  charsAfter: number;
  reduction: number;
};

function chars(m: SessionMessage): number {
  let n = m.text.length;
  for (const t of m.toolUses) n += JSON.stringify(t.input ?? {}).length + (t.text?.length ?? 0);
  for (const r of m.toolResults ?? []) n += r.text.length;
  return n;
}

// 先頭メッセージと直近 keepRecent 件にある呼び出しだけを残す。結果は呼び出しと組で扱い、
// 呼び出しを消したら結果も消す（呼び出しの無い結果を API に渡すと拒否されるため）。
export function trimToolHistory(input: readonly SessionMessage[], keepRecent: number): TrimResult {
  const isPinned = (i: number) => i === 0 || i >= input.length - keepRecent;
  const pinnedCalls = new Set<string>();
  input.forEach((m, i) => {
    if (isPinned(i)) for (const t of m.toolUses) pinnedCalls.add(t.tool_use_id);
  });

  let dropped = 0;
  const messages: SessionMessage[] = [];
  input.forEach((m) => {
    const toolUses = m.toolUses.filter((t) => pinnedCalls.has(t.tool_use_id));
    const toolResults = (m.toolResults ?? []).filter((r) => pinnedCalls.has(r.tool_use_id));
    dropped += m.toolUses.length - toolUses.length;
    if (toolUses.length === m.toolUses.length && toolResults.length === (m.toolResults ?? []).length) {
      messages.push(m);
      return;
    }
    if (!m.text.trim() && toolUses.length === 0 && toolResults.length === 0) return;
    const rebuilt: SessionMessage = { role: m.role, text: m.text, toolUses };
    if (toolResults.length > 0) rebuilt.toolResults = toolResults;
    messages.push(rebuilt);
  });

  const charsBefore = input.reduce((n, m) => n + chars(m), 0);
  const charsAfter = messages.reduce((n, m) => n + chars(m), 0);
  return { messages, dropped, charsBefore, charsAfter, reduction: charsBefore ? 1 - charsAfter / charsBefore : 0 };
}
