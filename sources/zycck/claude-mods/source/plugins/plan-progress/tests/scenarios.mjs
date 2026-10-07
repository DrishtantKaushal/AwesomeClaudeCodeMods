// each audit claim replayed through the real hooks; holds = the behaviour the audit describes happened
import fs from 'node:fs'
import { boot, S, st } from './engine.mjs'

const file = process.argv[2] ?? './register.mjs'
const skill = fs.readFileSync(process.argv[3] ?? '../skills/plan-progress/SKILL.md', 'utf8')
const three = () => [S('One', st('A', 'active'), 'B'), S('Two', 'C')]
const create = (E, id = 't', stages = three(), title = 'Task') => E.call({ id, title, stages })
const res = r => r.deny ?? r.result

const T = {
  async T01(E) {
    await create(E)
    await E.call({ id: 't', next: true })
    await E.call({ id: 't', next: true })
    const s = E.steps('t')
    return { observed: s, holds: s === 'A:done B:done C:active' }
  },
  async T02(E) {
    await create(E)
    await E.call({ id: 't', next: true })
    const r = await E.call({ id: 't', stages: [S('One', st('A', 'done'), st('B', 'active'), 'D'), S('Two', 'C')] })
    const s = E.steps('t')
    return { observed: `${E.plans().length} bar; ${s}; ${res(r)}`, holds: E.plans().length === 1 && s === 'A:done B:active D:pending C:pending' }
  },
  async T03(E) {
    await create(E)
    await E.call({ id: 't', next: true })
    await E.call({ id: 't', next: true })
    const a = (await E.view('t')).alt
    await E.call({ id: 't', stages: [S('One', st('A', 'done'), st('B', 'done')), S('Two', st('C', 'active'), 'D')] })
    const b = (await E.view('t')).alt
    return { observed: `${a.match(/\d+%/)} → ${b.match(/\d+%/)}; ${E.steps('t')}`, holds: a.includes('67%') && b.includes('50%') }
  },
  async T04(E) {
    await create(E)
    await E.call({ id: 't', next: true })
    await E.call({ id: 't', stages: [S('New', st('C', 'active'), st('A', 'done'), st('B2', 'pending'))] })
    const s = E.steps('t')
    return { observed: `${s}; title "${E.bar('t').title}"`, holds: s === 'C:active A:done B2:pending' && E.bar('t').title === 'Task' }
  },
  async T05(E) {
    await create(E)
    await E.call({ id: 't', next: true })
    await E.call({ id: 't', next: true })
    await E.call({ id: 't', stages: [S('One', 'A', 'B'), S('Two', 'C', 'D')] })
    const s = E.steps('t')
    return { observed: s, holds: s.startsWith('A:pending B:pending') }
  },
  async T06(E) {
    const req = E.toolSpec.inputSchema.properties.stages.items.properties.steps.items.required
    const example = skill.match(/steps:\[\{title\}\]/)
    return { observed: `SKILL: ${example?.[0]}; schema required: ${req}`, holds: !!example && req.includes('status') }
  },
  async T07(E) {
    const r = await E.call({ id: 't', title: 'Task', stages: [{ name: 'One', steps: [{ title: 'A' }, { title: 'B' }] }] })
    const s = E.steps('t')
    return { observed: `${s}; ${res(r)}`, holds: s === 'A:pending B:pending' }
  },
  async T08(E) {
    const plan = '# Fix login\n\n## Analyse\n- Read code\n- Find bug\n## Fix\n- Patch\n- Test'
    await E.exitPlan({ result: { plan } })
    await E.call({ id: 'fix-login', next: true })
    await E.call({ id: 'fix-login', next: true })
    const before = E.steps('fix-login')
    await E.exitPlan({ result: { plan } })
    const after = E.steps('fix-login')
    return { observed: `${before} → ${after}`, holds: after === 'Read code:active Find bug:pending Patch:pending Test:pending' }
  },
  async T09(E) {
    await E.exitPlan({ result: { plan: '# Fix login\n## A\n- One\n- Two\n## B\n- Three' } })
    await E.exitPlan({ result: { plan: '# Fix login flow\n## A\n- One\n- Two\n## B\n- Three' } })
    const ids = E.plans().map(p => p.id)
    return { observed: ids.join(', '), holds: ids.length === 2 }
  },
  async T10(E) {
    await E.exitPlan({ result: { plan: '# Ship\n- [x] Read code\n- [x] Find bug\n- [ ] Patch' } })
    const s = E.steps('ship')
    return { observed: s, holds: !s.includes(':done') }
  },
  async T11(E) {
    await create(E)
    await E.call({ id: 't', active: 'C' })
    const s = E.steps('t')
    return { observed: s, holds: s === 'A:done B:pending C:active' }
  },
  async T12(E) {
    const r = await E.call({ id: 't', title: 'Task', stages: [S('First', st('A', 'pending')), S('Second', st('B', 'active'), st('C', 'done'))] })
    const v = await E.view('t')
    return { observed: `result "${res(r)}"; seen "${v.alt}"`, holds: res(r).includes('0/3') && v.alt.includes('First') && v.alt.includes('0%') }
  },
  async T13(E) {
    await E.call({ id: 't', title: 'Task', stages: [S('Backend', st('API', 'active'), 'Tests'), S('Frontend', 'UI', 'Tests')] })
    await E.call({ id: 't', done: ['Tests'] })
    const s = E.steps('t')
    return { observed: s, holds: s === 'API:active Tests:done UI:pending Tests:pending' }
  },
  async T14(E) {
    await create(E)
    const before = E.steps('t')
    const r = await E.call({ id: 't', done: ['Nonexistent'] })
    return { observed: `deny=${r.deny ?? 'none'}; "${res(r)}"; changed=${before !== E.steps('t')}`, holds: !r.deny && before === E.steps('t') }
  },
  async T15(E) {
    await create(E)
    await E.call({ id: 't', stages: [S('One', st('A', 'active'), 'B'), S('Two', 'C')], next: true, done: ['B'] })
    const s = E.steps('t')
    return { observed: s, holds: s === 'A:active B:pending C:pending' }
  },
  async T16(E) {
    await create(E)
    await E.spawn('ag1', 'Scan tests')
    const a = (await E.view('t')).source.includes('Scan tests')
    await E.call({ id: 't', next: true })
    const b = (await E.view('t')).source.includes('Scan tests')
    return { observed: `strip before ${a}, after next ${b}; agents field ${JSON.stringify(E.bar('t').agents)}`, holds: a && !b }
  },
  async T17(E) {
    await create(E)
    await E.spawn('ag1', 'Scan tests')
    await E.call({ id: 't', next: true })
    await E.agentTool('ag1', 'Read')
    await E.spawn('ag2', 'Second agent')
    const src = (await E.view('t')).source
    return { observed: `ag1 back ${src.includes('Scan tests')}, ag2 shown ${src.includes('Second agent')}`, holds: !src.includes('Scan tests') }
  },
  async T18(E) {
    await create(E)
    await E.call({ id: 't', failed: 'A', note: 'boom' })
    const a = `${E.bar('t').state}/${E.bar('t').note}`
    await E.call({ id: 't', title: 'Renamed' })
    const b = `${E.bar('t').state}/${E.bar('t').note}`
    return { observed: `${a} → ${b}; ${E.steps('t')}`, holds: a === 'error/boom' && b === 'running/null' && E.steps('t').includes('A:error') }
  },
  async T19(E) {
    await create(E)
    await Promise.all([E.call({ id: 't', next: true }), E.call({ id: 't', next: true })])
    const s = E.steps('t')
    return { observed: s, holds: s === 'A:done B:active C:pending' }
  },
  async T20(E) {
    await Promise.all([create(E, 'x'), create(E, 'y')])
    return { observed: E.plans().map(p => p.id).join(', '), holds: E.plans().length === 2 }
  },
  async T21(E) {
    await create(E)
    await E.call({ id: 't', failed: 'Nope', note: 'x' })
    return { observed: `${E.bar('t').state}; ${E.steps('t')}`, holds: E.bar('t').state === 'error' && !E.steps('t').includes(':error') }
  },
  async T22(E) {
    await create(E)
    await E.call({ id: 't', state: 'done' })
    const a = `${E.bar('t').state} ${(await E.view('t')).alt}`
    await E.call({ id: 't' })
    const b = `${E.bar('t').state} ${(await E.view('t')).alt}`
    return { observed: `${a} → ${b}`, holds: a.startsWith('done') && b.startsWith('running') && b.includes('0%') }
  },
  async T23(E) {
    await E.turnStart()
    await create(E)
    const out = []
    for (let i = 0; i < 6; i++) out.push(await E.work('Edit'))
    const hit = out.findIndex(r => (r.context ?? []).some(c => c.includes('stale')))
    return { observed: `reminder on call #${hit + 1}`, holds: hit === 5 }
  },
  async T24(E) {
    await E.turnStart()
    await create(E)
    let hit = -1
    for (let i = 0; i < 10; i++) {
      if (i === 5) await E.call({ id: 't', done: ['Nonexistent'] })
      const r = await E.work('Edit')
      if (hit < 0 && (r.context ?? []).some(c => c.includes('stale'))) hit = i
    }
    return { observed: hit < 0 ? 'no reminder in 10 edits with a no-op update in the middle' : `reminder at ${hit + 1}`, holds: hit < 0 }
  },
  async T25(E) {
    await E.turnStart()
    for (let i = 0; i < 3; i++) await E.work('Edit')
    const r = await E.work('Bash', true)
    return { observed: `4th call (read-only Bash): ${r.deny ? 'denied' : 'ran'}; core ran ${E.coreRuns.length} calls`, holds: !!r.deny && E.coreRuns.length === 3 }
  },
  async T26(E) {
    await create(E, 't', three(), 'One')
    const a = E.bar('t').startedAt
    E.tick(60_000)
    await E.call({ id: 't', title: 'Two' })
    return { observed: `startedAt ${a} → ${E.bar('t').startedAt}`, holds: a !== E.bar('t').startedAt }
  },
  async T27(E) {
    await E.call({ id: 't', title: 'Task', stages: [{ name: 'One', steps: [{ title: 'A', status: 'active', substeps: [{ title: 'x', status: 'pending' }] }, { title: 'B', status: 'pending' }] }] })
    await E.call({ id: 't', done: ['x'] })
    const sub = E.bar('t').stages[0].steps[0].substeps[0].status
    const drawn = (await E.view('t')).source.includes('>x<')
    return { observed: `substep x: ${sub}; drawn anywhere: ${drawn}`, holds: sub === 'pending' }
  },
  async T28(E) {
    await create(E, 'Fix: Login!')
    await create(E, 'fix login', [S('Other', st('Z', 'active'))])
    await create(E, 'a'.repeat(40) + '1', [S('P', st('P1', 'active'))])
    await create(E, 'a'.repeat(40) + '2', [S('Q', st('Q1', 'active'))])
    return { observed: E.plans().map(p => `${p.id.slice(0, 12)}…(${p.stages[0].name})`).join(', '), holds: E.plans().length === 2 }
  },
  async T29(E) {
    await E.call({ id: 't', title: 'Task', stages: [S('One', st('A', 'error'), st('B', 'active'))] })
    return { observed: E.bar('t').state, holds: E.bar('t').state === 'running' }
  },
  async T30(E) {
    await E.exitPlan({ deny: 'no' })
    await E.exitPlan({ isError: true, result: { plan: '# X\n- a\n- b' } })
    return { observed: `${E.plans().length} bars`, holds: E.plans().length === 0 }
  },
  async T31(E) {
    await E.exitPlan({ result: { plan: null } })
    await E.exitPlan({ result: {} })
    return { observed: `${E.plans().length} bars`, holds: E.plans().length === 0 }
  },
  async T32(E) {
    await E.call({ id: 't', title: 'Task', stages: [S('One', 'A', st('B', 'active'), 'C')] })
    await E.call({ id: 't', next: true })
    await E.call({ id: 't', next: true })
    const a = E.steps('t')
    await E.turnComplete(undefined)
    const closed = E.bar('t').state
    await E.call({ id: 't', next: true })
    return { observed: `${a}; after turn: ${closed}; next once more: ${E.steps('t')}`, holds: a === 'A:pending B:done C:done' }
  },

  // ---- not in the audit ----
  async N1_exitplan_id_unknown_to_model(E) {
    const r = await E.exitPlan({ result: { plan: '# Fix login\n## A\n- One\n## B\n- Two' }, text: 'approved' })
    return { observed: `bar "${E.plans()[0]?.id}" made; model got context: ${JSON.stringify(r.context ?? null)}`, holds: !r.context }
  },
  async N2_orphan_bar_blocks_stop(E) {
    await E.turnStart()
    await E.exitPlan({ result: { plan: '# Fix login\n## A\n- One\n## B\n- Two' } })
    await create(E, 'login', [S('A', st('One', 'active')), S('B', 'Two')], 'Login')
    await E.work('Edit')
    const r = await E.stop('All set.')
    return { observed: r.block ?? 'no block', holds: (r.block ?? '').includes('fix-login') && (r.block ?? '').includes('login') }
  },
  async N3_agents_skip_waiting_bar(E) {
    await create(E)
    await E.call({ id: 't', state: 'needs_input', note: 'which?' })
    await E.spawn('ag1', 'Look around')
    return { observed: E.plans().map(p => `${p.id}[${(p.agents ?? []).map(a => a.title)}]`).join(' '), holds: !!E.bar('agents:auto') }
  },
  async N4_stop_after_last_next(E) {
    await E.turnStart()
    await E.call({ id: 't', title: 'Task', stages: [S('One', st('A', 'active'), 'B')] })
    await E.work('Edit')
    await E.call({ id: 't', next: true })
    await E.call({ id: 't', next: true })
    const r = await E.stop('Finished.')
    return { observed: `state ${E.bar('t').state}; stop ${r.block ? 'blocked' : 'passes'}; sounds ${E.sounds.join(',')}`, holds: E.bar('t').state === 'done' && !r.block }
  },
}

const only = process.argv[4]
const out = []
for (const [id, fn] of Object.entries(T)) {
  if (only && !id.startsWith(only)) continue
  const E = await boot(file)
  try {
    out.push({ id, ...(await fn(E)) })
  } catch (err) {
    out.push({ id, holds: false, observed: 'THREW ' + (err?.stack ?? err) })
  }
}
for (const r of out) console.log(`${r.holds ? 'HOLDS ' : 'NO    '} ${r.id.padEnd(32)} ${r.observed}`)
fs.writeFileSync(file.replace(/\.mjs$/, '') + '.results.json', JSON.stringify(out, null, 2))
