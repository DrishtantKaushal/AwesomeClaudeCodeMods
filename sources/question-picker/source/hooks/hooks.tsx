import type { Register } from 'claude-code';

const TOOL_NAME = 'pick';
const FULL_TOOL_NAME = 'mcp__better-ask-picker__pick';
const PANE_ID = 'ask-picker';

// hotkey は数字1桁か小文字1字。y/n/b は決定・キャンセル・戻るに空けておく。
const HOTKEYS = '123456789acdefghijklmopqrstuvwxz';
const CONFIRM_HOTKEY = 'y';
const CANCEL_HOTKEY = 'n';
const BACK_HOTKEY = 'b';

// 待機の上限（$.process.run の timeoutMs 上限は10分）
const WAIT_TIMEOUT_MS = 600_000;

type Option = { label: string; description?: string };

type Question = {
  question: string;
  summary?: string;
  options: Option[];
  multiSelect: boolean;
};

type Item = Question & { selected: Set<number> };

type Session = {
  items: Item[];
  // 表示中の設問（items の添字）
  index: number;
  // `questions` で渡されたか。true なら戻り値を answers 配列にする
  isBatch: boolean;
  status: 'open' | 'done' | 'cancelled';
  sentinel: string;
};

// 表示中の質問。ペインは1つだけ（同時に2件は受けない）。
let session: Session | null = null;

// フックの予算（10秒）は自分のコードの実行時間だけを数え、$ 呼び出しの実行中は止まる。
// 自作 Promise の await は止まらないので、人の回答待ちは「sentinel が現れるまで
// 待つ子プロセス」を $.process.run で待つ形にする。
const waitForAnswer = async ($: any, s: Session) => {
  await $.process.run(['sh', '-c', 'while [ ! -e "$1" ]; do sleep 0.2; done', 'sh', s.sentinel], {
    timeoutMs: WAIT_TIMEOUT_MS,
  });
};

const finish = async ($: any, s: Session, status: 'done' | 'cancelled') => {
  if (s.status !== 'open') return;
  s.status = status;
  await $.process.run(['touch', s.sentinel]);
};

const selectedLabels = (it: Item) =>
  [...it.selected].sort((a, b) => a - b).map((i) => it.options[i]?.label ?? '');

const cancelledAnswer = (s: Session) =>
  s.isBatch ? { answers: [], cancelled: true } : { selected: [] as string[], cancelled: true };

const answerOf = (s: Session) => {
  if (s.status !== 'done') return cancelledAnswer(s);
  if (s.isBatch) {
    return {
      answers: s.items.map((it) => ({ question: it.question, selected: selectedLabels(it) })),
    };
  }
  const only = s.items[0];
  return { selected: only ? selectedLabels(only) : [] };
};

// ペインを出せない環境（幅が足りない等）向け: ネイティブダイアログで4択ずつ聞く。
// multiSelect は4個ずつのチャンクをそれぞれ複数選択で聞いて連結する。
// キャンセル（ダイアログを閉じた）は null。
// 既知の制限: ラベルにカンマを含むと、複数選択の回答の分割がずれる。
const askOneWithNativeDialog = async (
  $: any,
  q: Question,
  tag: string
): Promise<string[] | null> => {
  const header = `${tag}${q.summary ? `${q.question}\n${q.summary}` : q.question}`;
  const labels = q.options.map((o) => o.label);
  try {
    if (q.multiSelect) {
      const chunks: string[][] = [];
      for (let i = 0; i < labels.length; i += 4) chunks.push(labels.slice(i, i + 4));
      const picked: string[] = [];
      for (const [n, chunk] of chunks.entries()) {
        const text = chunks.length > 1 ? `${header} (${n + 1}/${chunks.length})` : header;
        const answer: string = await $.ui.ask(text, { options: chunk, multiSelect: true });
        picked.push(
          ...answer
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        );
      }
      return picked;
    }
    const Prev = '← 前へ';
    const Next = '→ 次へ';
    const pageCount = Math.ceil(labels.length / 2);
    let page = 0;
    while (true) {
      const start = page * 2;
      const nav: string[] = [];
      if (page > 0) nav.push(Prev);
      if (start + 2 < labels.length) nav.push(Next);
      const text = pageCount > 1 ? `${header} (${page + 1}/${pageCount})` : header;
      const chosen: string = await $.ui.ask(text, [...labels.slice(start, start + 2), ...nav]);
      if (chosen === Next) page += 1;
      else if (chosen === Prev) page -= 1;
      else return [chosen];
    }
  } catch {
    return null;
  }
};

const askAllWithNativeDialog = async ($: any, s: Session) => {
  const answers: { question: string; selected: string[] }[] = [];
  for (const [k, it] of s.items.entries()) {
    const tag = s.items.length > 1 ? `(${k + 1}/${s.items.length}) ` : '';
    const picked = await askOneWithNativeDialog($, it, tag);
    if (!picked) return cancelledAnswer(s);
    answers.push({ question: it.question, selected: picked });
  }
  return s.isBatch ? { answers } : { selected: answers[0]?.selected ?? [] };
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const parseQuestion = (raw: unknown): Parsed<Question> => {
  const input = (raw ?? {}) as {
    question?: unknown;
    summary?: unknown;
    options?: unknown;
    multiSelect?: unknown;
  };
  if (typeof input.question !== 'string' || input.question.length === 0) {
    return { ok: false, error: 'question が空です' };
  }
  if (!Array.isArray(input.options) || input.options.length < 2) {
    return { ok: false, error: 'options には2個以上の選択肢が必要です' };
  }
  const options: Option[] = [];
  for (const rawOption of input.options) {
    const o = rawOption as { label?: unknown; description?: unknown };
    if (typeof o?.label !== 'string' || o.label.length === 0) {
      return { ok: false, error: '各 option には空でない label が必要です' };
    }
    options.push({
      label: o.label,
      description: typeof o.description === 'string' && o.description ? o.description : undefined,
    });
  }
  return {
    ok: true,
    value: {
      question: input.question,
      summary: typeof input.summary === 'string' && input.summary ? input.summary : undefined,
      options,
      multiSelect: input.multiSelect === true,
    },
  };
};

const parseInput = (e: unknown): Parsed<{ questions: Question[]; isBatch: boolean }> => {
  const input = e as { questions?: unknown; question?: unknown; options?: unknown };
  if (input.questions !== undefined) {
    if (input.question !== undefined || input.options !== undefined) {
      return { ok: false, error: 'question/options と questions は同時に指定できません' };
    }
    if (!Array.isArray(input.questions) || input.questions.length === 0) {
      return { ok: false, error: 'questions には1問以上必要です' };
    }
    const questions: Question[] = [];
    for (const [k, raw] of input.questions.entries()) {
      const parsed = parseQuestion(raw);
      if (!parsed.ok) return { ok: false, error: `questions[${k}]: ${parsed.error}` };
      questions.push(parsed.value);
    }
    return { ok: true, value: { questions, isBatch: true } };
  }
  const parsed = parseQuestion(e);
  if (!parsed.ok) return parsed;
  return { ok: true, value: { questions: [parsed.value], isBatch: false } };
};

// ペインの高さ: 最も背の高い設問に合わせる（設問が切り替わっても高さは変えない）
const rowsFor = (s: Session) => {
  const tallest = Math.max(
    ...s.items.map(
      (it) =>
        6 +
        it.options.length * (it.options.some((o) => o.description) ? 2 : 1) +
        (it.summary ? 3 : 0)
    )
  );
  return Math.min(26, tallest + (s.items.length > 1 ? 2 : 0));
};

export const register: Register = (on, _options) => {
  on('session.start', async ($, e, next) => {
    const questionSchema = {
      type: 'object',
      properties: {
        question: { type: 'string', description: '質問文（?で終わる）' },
        summary: { type: 'string', description: '質問の概要・背景（Markdown、任意）' },
        options: {
          type: 'array',
          minItems: 2,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: '選択肢のラベル' },
              description: { type: 'string', description: '選択肢の説明（任意）' },
            },
            required: ['label'],
          },
          description: '選択肢の一覧（上限なし）',
        },
        multiSelect: { type: 'boolean', description: 'true で複数選択（決定ボタンで確定）' },
      },
      required: ['question', 'options'],
    };
    await $.tool.register({
      name: TOOL_NAME,
      description:
        '質問の概要を表示しつつ、選択肢を全件1画面に出してユーザーに選ばせる。' +
        '選択肢の数に上限はなく、multiSelect で複数選択もできる。' +
        '1問だけなら question/options を、複数の設問を順に聞くなら questions を使う（同時指定は不可）。' +
        '戻り値は JSON 文字列。1問: {"selected": [選んだlabel...]}、' +
        'questions: {"answers": [{"question": 質問文, "selected": [...]}...]}。' +
        'キャンセル時は cancelled: true。',
      inputSchema: {
        type: 'object',
        properties: {
          ...questionSchema.properties,
          questions: {
            type: 'array',
            minItems: 1,
            items: questionSchema,
            description:
              '複数の設問を順に聞く場合の設問一覧（1問だけなら question/options を使う）',
          },
        },
      },
    });
    // 前回のモジュールが残したペインを片付ける
    try {
      if ((await $.ui.panes()).some((p) => p.id === PANE_ID)) await $.ui.close({ id: PANE_ID });
    } catch {}
    return next(e);
  });

  on('tool.call', { tool: FULL_TOOL_NAME }, async ($, e, next) => {
    const parsed = parseInput(e);
    if (!parsed.ok) return { deny: parsed.error };
    if (session && session.status === 'open') {
      return { deny: '別の質問を表示中です。回答を待ってから呼び直してください' };
    }

    const s: Session = {
      items: parsed.value.questions.map((q) => ({ ...q, selected: new Set<number>() })),
      index: 0,
      isBatch: parsed.value.isBatch,
      status: 'open',
      sentinel: `/tmp/ask-picker-${Date.now()}-${Math.floor(Math.random() * 1e9)}.done`,
    };
    session = s;
    const onAbort = () => void finish($, s, 'cancelled');
    next.signal.addEventListener('abort', onAbort);

    try {
      await $.ui.open({
        id: PANE_ID,
        title: '質問',
        focus: true,
        closeOnEscape: true,
        holdToasts: true,
        rows: rowsFor(s),
      });

      const pane = (await $.ui.panes()).find((p) => p.id === PANE_ID);
      if (!pane?.isPlaced) {
        // 端末幅が足りずペインが描画されない: 待たずにネイティブダイアログへ
        await $.ui.close({ id: PANE_ID });
        const fallback = await askAllWithNativeDialog($, s);
        return {
          result: JSON.stringify(fallback),
          context: [`answered (native dialog): ${JSON.stringify(fallback)}`],
        };
      }
      if (!pane.isFocused) $.ui.toast('ペインを選ぶには ctrl+x の後に tab キー');

      await waitForAnswer($, s);
      if (s.status === 'open') s.status = 'cancelled';

      const answer = answerOf(s);
      return { result: JSON.stringify(answer), context: [`answered: ${JSON.stringify(answer)}`] };
    } catch (err) {
      return {
        deny: `質問を表示できませんでした: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      next.signal.removeEventListener('abort', onAbort);
      if (session === s) session = null;
      if (s.status === 'open') s.status = 'cancelled';
      try {
        await $.ui.close({ id: PANE_ID });
      } catch {}
      try {
        await $.process.run(['rm', '-f', s.sentinel]);
      } catch {}
    }
  });

  // ユーザーがペインを閉じた（Esc・×）ときはキャンセル扱いで待機を解く
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE_ID && e.origin.kind === 'person' && session)
      void finish($, session, 'cancelled');
    return next(e);
  });

  on('ui.render', { component: 'Pane' }, ($, e, next) => {
    const s = session;
    if (e.requestId !== PANE_ID || !s || s.status !== 'open') return next(e);
    const it = s.items[s.index];
    if (!it) return next(e);

    const { Box, Text, Button, Markdown } = $.ui.resolve(e);

    const total = s.items.length;
    const isLast = s.index === total - 1;

    // 次の設問へ。最後の設問なら回答を確定する
    const advance = () => {
      if (s.status !== 'open') return;
      if (s.index < total - 1) {
        s.index += 1;
        $.ui.invalidate('ui.render');
      } else {
        void finish($, s, 'done');
      }
    };

    const press = (i: number) => {
      const cur = s.items[s.index];
      if (!cur || s.status !== 'open') return;
      if (cur.multiSelect) {
        if (cur.selected.has(i)) cur.selected.delete(i);
        else cur.selected.add(i);
        $.ui.invalidate('ui.render');
        return;
      }
      cur.selected = new Set([i]);
      advance();
    };

    // 設問が複数あるときだけ、単一選択にも選択状態の印を付ける（戻ったときに分かるように）
    const mark = (i: number) => {
      const isSelected = it.selected.has(i);
      if (it.multiSelect) return isSelected ? '[x] ' : '[ ] ';
      return total > 1 ? (isSelected ? '(*) ' : '( ) ') : '';
    };

    const progress = total > 1 ? `(${s.index + 1}/${total}) ` : '';
    const heading = it.summary
      ? `**${progress}${it.question}**\n\n${it.summary}`
      : `**${progress}${it.question}**`;

    return (
      <Box flexDirection="column">
        <Markdown text={heading} />
        <Box flexDirection="column" marginTop={1}>
          {it.options.map((o, i) => (
            <Box flexDirection="column">
              <Button
                key={`q${s.index}-opt-${i}`}
                plain
                autoFocus={i === 0 ? true : undefined}
                hotkey={HOTKEYS[i]}
                label={`${mark(i)}${o.label}`}
                onPress={() => press(i)}
              />
              {o.description ? (
                <Box paddingLeft={4}>
                  <Text dimColor wrap="wrap">
                    {o.description}
                  </Text>
                </Box>
              ) : null}
            </Box>
          ))}
        </Box>
        <Box marginTop={1} gap={2}>
          {it.multiSelect ? (
            <Button
              key="confirm"
              plain
              hotkey={CONFIRM_HOTKEY}
              label={`${isLast ? '決定' : '次へ'} (${it.selected.size}件)`}
              onPress={advance}
            />
          ) : null}
          {s.index > 0 ? (
            <Button
              key="back"
              plain
              hotkey={BACK_HOTKEY}
              label="戻る"
              onPress={() => {
                if (s.status !== 'open' || s.index === 0) return;
                s.index -= 1;
                $.ui.invalidate('ui.render');
              }}
            />
          ) : null}
          <Button
            key="cancel"
            plain
            hotkey={CANCEL_HOTKEY}
            label="キャンセル"
            onPress={() => void finish($, s, 'cancelled')}
          />
        </Box>
      </Box>
    );
  });
};
