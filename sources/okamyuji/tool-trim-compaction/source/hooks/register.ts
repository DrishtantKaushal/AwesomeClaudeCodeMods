import type { Register } from 'claude-code';
import { trimToolHistory } from './trim';

const KEEP_RECENT_MESSAGES = 6;
const MIN_REDUCTION = 0.25;
const COMPACT_AT_PERCENT = 60;

const pct = (r: number) => `${Math.round(r * 100)}%`;

export const register: Register = (on) => {
  let compacting = false;

  on('session.compact', async ($, e, next) => {
    if (e.trigger === 'precompute') return next(e);
    let out;
    try {
      out = trimToolHistory(e.messages, KEEP_RECENT_MESSAGES);
    } catch (error) {
      $.ui.log(`tool-trim: failed (${error instanceof Error ? error.message : String(error)}); standard summary`);
      return next(e);
    }
    if (out.reduction < MIN_REDUCTION) {
      $.ui.log(`tool-trim: ${pct(out.reduction)} reduction, below ${pct(MIN_REDUCTION)}; standard summary`);
      return next(e);
    }
    const line = `tool-trim: dropped ${out.dropped} tool calls, ${pct(out.reduction)} reduction, kept ${out.messages.length}/${e.messages.length} messages`;
    $.ui.log(line);
    $.ui.toast(line, { timeoutMs: 15_000 });
    return { messages: out.messages };
  });

  // 標準の自動 compaction より早い 60% で切る。要約を作らないので、早めに切っても費用が増えない。
  on('turn.complete', async ($, e, next) => {
    if (compacting) return next(e);
    try {
      const { context } = await $.session.usage();
      if ((context.percent ?? 0) >= COMPACT_AT_PERCENT) {
        compacting = true;
        await $.session.compact();
      }
    } catch (error) {
      $.ui.log(`tool-trim: auto-compact skipped (${error instanceof Error ? error.message : String(error)})`);
    } finally {
      compacting = false;
    }
    return next(e);
  });
};
