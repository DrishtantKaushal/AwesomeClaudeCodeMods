import { describe, expect, test } from 'claude-code/testing'

import { cells, chunks, layout, lineCount, outputLines, takeLines, visible } from '../hooks/text'
import type { Block } from '../hooks/text'

const shape = (blocks: Block[]) =>
  blocks.map(block =>
    block.kind === 'code'
      ? `${block.piece.language ?? block.piece.path ?? 'plain'}:${block.piece.source}`
      : block.pieces.map(piece => `${piece.language ?? piece.path ?? 'plain'}:${piece.source}`),
  )

describe('layout', () => {
  test('a plain command is one block in the shell language', async () => {
    expect(shape(layout('ls -la | head -n 3', 'bash', 80))).toEqual(['bash:ls -la | head -n 3'])
  })

  test('a heredoc body takes the language of its interpreter', async () => {
    const command = "node <<'EOF'\nconst a = 1\nconsole.log(a)\nEOF"
    expect(shape(layout(command, 'bash', 80))).toEqual([
      "bash:node <<'EOF'",
      'javascript:const a = 1\nconsole.log(a)',
      'bash:EOF',
    ])
  })

  test('a heredoc redirected to a file is highlighted by the file name', async () => {
    const command = "cat > /tmp/demo.py <<'EOF'\nimport sys\nEOF"
    expect(shape(layout(command, 'bash', 80))).toEqual(["bash:cat > /tmp/demo.py <<'EOF'", '/tmp/demo.py:import sys', 'bash:EOF'])
  })

  test('a heredoc without a known language is drawn plain', async () => {
    const command = "git commit -F - <<'EOF'\nFix the thing\nEOF"
    expect(shape(layout(command, 'bash', 80))).toEqual(["bash:git commit -F - <<'EOF'", 'plain:Fix the thing', 'bash:EOF'])
  })

  test('an inline script that fits is split into pieces on one row', async () => {
    expect(shape(layout(`node -e 'console.log(1)' && echo ok`, 'bash', 80))).toEqual([
      ["bash:node -e '", 'javascript:console.log(1)', "bash:'", 'bash: && echo ok'],
    ])
  })

  test('an inline script wider than the room is wrapped at spaces', async () => {
    const command = `node -e 'console.log(1)' && echo ok`
    expect(shape(layout(command, 'bash', 20))).toEqual([
      ["bash:node -e '"],
      ['javascript:console.log(1)', "bash:'", 'bash: && '],
      ['bash:echo ok'],
    ])
  })

  test('a wrap prefers a space outside a string', async () => {
    const command = `node -e 'log("a b c d e f g"); done()'`
    expect(shape(layout(command, 'bash', 31))).toEqual([
      ["bash:node -e '", 'javascript:log("a b c d e f g"); '],
      ['javascript:done()', "bash:'"],
    ])
  })

  test('a word longer than the room is cut', async () => {
    const command = `node -e '${'x'.repeat(50)}'`
    expect(shape(layout(command, 'bash', 20))).toEqual([
      ["bash:node -e '"],
      [`javascript:${'x'.repeat(20)}`],
      [`javascript:${'x'.repeat(20)}`],
      [`javascript:${'x'.repeat(10)}`, "bash:'"],
    ])
  })

  test('wide characters count as two cells', async () => {
    expect(cells('日本 ok')).toBe(7)
    expect(shape(layout(`python -c 'print("日本")'`, 'bash', 80))).toEqual([
      ["bash:python -c '", 'python:print("日本")', "bash:'"],
    ])
  })

  test('a row with characters of unsure width stays one shell block', async () => {
    const command = `python -c 'print("é")'`
    expect(shape(layout(command, 'bash', 80))).toEqual([`bash:${command}`])
  })

  test('cmd /c and an interactive shell take their script as code', async () => {
    expect(shape(layout(`cmd /c "dir /b"`, 'powershell', 80))).toEqual([['powershell:cmd /c "', 'bat:dir /b', 'powershell:"']])
    expect(shape(layout(`wsl -e zsh -ic 'uv --version'`, 'powershell', 80))).toEqual([
      ["powershell:wsl -e zsh -ic '", 'bash:uv --version', "powershell:'"],
    ])
  })

  test('a multi-line inline script keeps its lines', async () => {
    const command = `node -e '\nconst a = 1\nconsole.log(a)\n' && echo done`
    expect(shape(layout(command, 'bash', 80))).toEqual([
      "bash:node -e '",
      'javascript:const a = 1\nconsole.log(a)',
      ["bash:'", 'bash: && echo done'],
    ])
  })

  test("bash's quote-escape idiom does not end the script", async () => {
    const command = `python3 -c 'print('\\''hi'\\'')'`
    expect(shape(layout(command, 'bash', 80))).toEqual([["bash:python3 -c '", "python:print('\\''hi'\\'')", "bash:'"]])
  })

  test('a flag the interpreter does not evaluate is left alone', async () => {
    expect(shape(layout(`node script.js 'arg'`, 'bash', 80))).toEqual([`bash:node script.js 'arg'`])
  })

  test('a PowerShell here-string takes the language of its interpreter', async () => {
    const command = `python -c @'\nimport os\nprint(os.name)\n'@`
    expect(shape(layout(command, 'powershell', 80))).toEqual([
      "powershell:python -c @'",
      'python:import os\nprint(os.name)',
      "powershell:'@",
    ])
  })

  test('a PowerShell here-string piped to a file is highlighted by the file name', async () => {
    const command = `@'\n{ "a": 1 }\n'@ | Set-Content -Path out.json`
    expect(shape(layout(command, 'powershell', 80))).toEqual([
      "powershell:@'",
      'out.json:{ "a": 1 }',
      ["powershell:'@", 'powershell: | Set-Content -Path out.json'],
    ])
  })
})

describe('folding', () => {
  const blocks = layout("node <<'EOF'\na\nb\nc\nEOF", 'bash', 80)

  test('lines are counted across blocks', async () => {
    expect(lineCount(blocks)).toBe(5)
  })

  test('taking lines cuts inside a block', async () => {
    expect(shape(takeLines(blocks, 3))).toEqual(["bash:node <<'EOF'", 'javascript:a\nb'])
  })
})

describe('text', () => {
  test('control characters in a command are made visible', async () => {
    expect(visible('printf "\u001b[31mred"\r\nexit')).toBe('printf "␛[31mred"\nexit')
  })

  test('output joins stdout and stderr, without colour codes or trailing blank lines', async () => {
    expect(outputLines({ stdout: '\u001b[31mred\u001b[0m\r\nplain\n\n', stderr: 'warning' })).toEqual(['red', 'plain', 'warning'])
  })

  test('an errored call carries its text as a string', async () => {
    expect(outputLines('Exit code 2\nno such file')).toEqual(['Exit code 2', 'no such file'])
  })

  test('no output is no lines', async () => {
    expect(outputLines({ stdout: '', stderr: '' })).toEqual([])
    expect(outputLines(undefined)).toEqual([])
  })

  test('long text is split at line breaks into elements of at most 10000 characters', async () => {
    const line = 'x'.repeat(4000)
    const parts = chunks([line, line, line].join('\n'))
    expect(parts.map(part => part.length)).toEqual([8001, 4000])
  })

  test('a single line longer than an element is cut', async () => {
    expect(chunks('y'.repeat(25000)).map(part => part.length)).toEqual([10000, 10000, 5000])
  })

  test('an empty text is still an element', async () => {
    expect(chunks('')).toEqual([' '])
  })
})
