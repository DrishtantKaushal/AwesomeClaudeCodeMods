// Masks secrets, personal details, and business figures for screen recording.
// Pure functions: no mods API calls here. The same file ships in each mod that
// draws text, since a mod may import only its own files.

const DOTS = '••••••••'
const HIDE = '•••'
const HIDDEN_OUTPUT = '••• hidden while recording'

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{16,}/g,
  /\bsk-(?:proj-|live-|test-|svcacct-)?[A-Za-z0-9_-]{20,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\b(?:hf|r8|pk_live|sk_live|rk_live|whsec|pat|key)_[A-Za-z0-9]{20,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi,
]

// NAME=value or "name": "value" where the name looks like a credential
const ASSIGNMENT =
  /\b([A-Za-z0-9_.-]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLIENT[_-]?SECRET|AUTH)[A-Za-z0-9_.-]*)(["']?\s*[=:]\s*["']?)([^\s"'`,;}{]{6,})/gi

const EMAIL_SRC = '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}'
const EMAIL = new RegExp(`\\b${EMAIL_SRC}\\b`, 'g')

// People: "Jane Doe <jane@x.com>", "displayName": "Jane Doe", and From:/Attendees: lines
const NAME_WORD = "[A-Z][\\p{L}'’.-]*"
const DISPLAY_NAME = new RegExp(`(["']?)(${NAME_WORD}(?:[ \\t]+${NAME_WORD}){0,3})\\1([ \\t]*<[ \\t]*${EMAIL_SRC}[ \\t]*>)`, 'gu')
const PERSON_KEY =
  /("(?:displayName|display_name|fullName|full_name|firstName|first_name|lastName|last_name|givenName|given_name|familyName|family_name|real_name|realName|senderName|sender_name|authorName|author_name|username|user_name)"\s*:\s*")([^"]{1,80})(")/g
const PERSON_LINE = /^([ \t>*-]*(?:From|To|Cc|Bcc|Reply-To|Attendees?|Organizer|Invitees?|Guests?|Assignees?|Sender|Owner)[ \t]*:[ \t]*)(\S.*)$/gm

// Personal details
const PHONE = /(?<![\w.])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w.])/g
const PHONE_INTL = /(?<![\w.])\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?![\w.])/g
const SSN = /(?<![\w-])\d{3}-\d{2}-\d{4}(?![\w-])/g
const EIN = /(?<![\w-])\d{2}-\d{7}(?![\w-])/g
const CARD = /(?<![\w-])(?:4\d{3}|5[1-5]\d{2}|2[2-7]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))(?:[ -]?\d{2,4}){3,4}(?![\w-])/g
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g
const ACCOUNT = /\b((?:routing|account|acct|a\/c|aba|swift|bic|iban|passport|driver'?s license)(?:\s*(?:number|no\.?|num|#))?\s*[:#]?\s*)(\d[\d -]{3,}\d)/gi
const CARD_ENDING = /\b((?:ending(?:\s+in)?|last\s+(?:4|four)(?:\s+digits)?)\s*[:#]?\s*)(\d{4})\b/gi
const STREET = /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Z][\p{L}'.-]*\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Parkway|Pkwy|Highway|Hwy|Circle|Cir|Terrace|Ter|Trail|Trl|Square|Sq)\b\.?(?:,?\s+(?:Apt|Apartment|Suite|Ste|Unit|#)\.?\s*[\w-]+)?/gu
const PO_BOX = /\bP\.?\s?O\.?\s+Box\s+\d+/gi
const STATE_ZIP = /(,\s*(?:A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY]))\s+\d{5}(?:-\d{4})?\b/g
const BIRTH = /\b((?:DOB|D\.O\.B\.|date of birth|birth\s?date|birthday|born(?: on)?)\s*[:-]?\s*)([A-Za-z0-9 ,/.-]{4,20}\d)/gi
const IPV4 = /(?<![\w.])((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})(?![\w.])/g

// Money in any common currency
const MONEY = /(?:US|CA|AU)?[$€£¥]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:[kKmMbB]|bn|million|thousand|billion)\b)?/g
const MONEY_WORD = /(?<![\w.])(?:(?:USD|EUR|GBP|CAD|AUD)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:[kKmMbB]|bn|million|thousand|billion)\b)?|\d[\d,]*(?:\.\d+)?(?:\s?(?:[kKmMbB]|bn|million|thousand|billion))?\s?(?:USD|EUR|GBP|CAD|AUD|dollars|bucks)\b)/gi

// Figures near business words: "MRR is 84k", "40% margin", "profit share 20%"
const FIN_WORD =
  /\b(?:revenues?|mrr|arr|gmv|profits?|profit share|margins?|ebitda|income|earnings|payroll|salar(?:y|ies)|wages?|compensation|comp|bonus(?:es)?|equity|stakes?|ownership|valuation|runway|burn(?: rate)?|cash(?:flow)?|balances?|budgets?|spend(?:ing)?|pric(?:e|es|ing)|fees?|invoices?|payouts?|distributions?|dividends?|tax(?:es)?|sales|ltv|cac|aov|sponsor(?:s|ships?)?|cpm|rpm|retainers?|commissions?|royalt(?:y|ies)|refunds?|expenses?|debts?|loans?|funding|investments?|deals?|net|gross|paid|pays?|owed?|costs?)\b/gi
const FIGURE = /(?<![\w.])\d[\d,]*(?:\.\d+)?(?:\s?(?:%|percent\b|[kKmMbB]\b|bn\b|million\b|thousand\b|billion\b|x\b))?/g
const BIG_FIGURE = /(?<![\w.])(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?\s?(?:%|percent\b|[kKmMbB]\b|bn\b|million\b|thousand\b|billion\b))/g

// Single names that are also ordinary words, and names that stay visible (the channel's own)
const COMMON_WORDS = new Set(
  'Will Mark Grant Bill Rich Art Hope Faith Joy May June April August Summer Rose Page Chase Hunter Max Ray Dawn Sky Brook Lane Dean Gene Guy Frank Sterling Major Price Young King Long Little Wood Hill Stone Field Ford Hall Bell Rice Banks Case Cook Fox Gray Green Brown White Black Day Lee West North South Love Church Park Street Bishop Mason Miller Baker Carter Cole Wells Hart Moon Star Van Von De Del La Le Da Di St Mr Mrs Ms Dr Jr Sr Claude Code Team Support Admin Info Hello The And Ai Slack Gmail Google Calendar Meeting Sync Notes Update Review Weekly Daily Monday Tuesday Wednesday Thursday Friday Saturday Sunday'.split(' '),
)
const ROLE_LOCAL_PARTS = /^(?:info|hello|hi|team|support|help|admin|noreply|no-reply|donotreply|contact|sales|billing|accounts?|notifications?|news|newsletter|marketing|office|mail|security|privacy|legal|press|jobs|careers|hr|ops|dev|bot|alerts?|updates?|calendar|invites?)$/i

// Files that stay closed while recording. Add your own folders and file names
// in ~/.claude/mods-data/recording-mode/config.json ("privatePaths"); /rec config makes one.
const PRIVATE_PATHS = [
  /(^|[\\/\s"'`])\.env(\.[A-Za-z0-9_-]+)?(?=$|[\s"'`;|&)])/i,
  /\.credentials\.json/i,
  /[\\/]\.claude\.json\b/i,
  /\.claude[\\/]projects[\\/][^\\/\s"'`]+[\\/]memory/i,
  /(^|[\\/\s"'`])\.(?:ssh|aws|gnupg)(?=$|[\\/])/i,
  /\bid_(?:rsa|ed25519|ecdsa)\b/i,
  /(^|[\\/\s"'`])\.(?:netrc|npmrc|pypirc)\b/i,
  /\.(?:pem|p12|pfx)\b/i,
  /taxes?[-_ ]?20\d\d/i,
  /[\\/_-](?:payroll|invoices?|contracts?|financials?|finances?|budgets?|forecasts?|cap[-_ ]?table|term[-_ ]?sheets?|offer[-_ ]?letters?|business[-_ ]?plans?)(?=$|[\\/._\s"'`;|&)-])/i,
  /(^|[\s"'`])(?:payroll|invoices?|contracts?|financials?|finances?|budgets?|forecasts?|business[-_ ]?plans?)(?=[\\/.])/i,
]

// Tools whose results are business data: drawn as hidden while recording
const BUSINESS_TOOL =
  /(?:^|__|_)(?:clickup|slack|gmail|outlook|notion|asana|linear|jira|clay|qbo|quickbooks|xero|fireflies|hubspot|salesforce|stripe|calendar|gcal|google_drive|drive|sheets)|search_threads|get_thread|get_message|list_drafts|get_draft|read_file_content|download_file_content|search_files|list_recent_files|get_file_metadata|profit_loss|cash_flow|balance_sheet|payroll|session_transcripts|export_transcript/i
const BUSINESS_COMMAND = /\bgws(?:\.cmd|\.exe)?\b|fireflies|quickbooks/i
// Finance tools stay closed while recording
const FINANCE_TOOL = /__(?:qbo_|quickbooks|profit_loss|cash_flow|balance_sheet|benchmarking_quickbooks|money_onboarding|company_info)/i

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Values from .env files: long enough to be secret, and not plain words or numbers.
export function secretValuesFromEnv(text) {
  const values = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[1].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (v.length < 8) continue
    if (/^(true|false|null|none|yes|no)$/i.test(v)) continue
    if (/^\d+(\.\d+)?$/.test(v)) continue
    if (/your[-_ ]?(key|token|secret)|here$|^<.*>$|^xxx/i.test(v)) continue
    values.push(v)
  }
  return [...new Set(values)].sort((a, b) => b.length - a.length)
}

// The forms of one person's name that get masked: the full name, its slug, and each part that isn't an ordinary word
function nameForms(full, keep) {
  const clean = String(full || '').replace(/\s+/g, ' ').trim()
  if (!clean || clean.length > 60 || keep.has(clean)) return []
  const forms = new Set()
  const parts = clean.split(/[ -]/).filter((p) => /^[A-Z][\p{L}'’.]*$/u.test(p) && p.length >= 2)
  if (parts.length >= 2) {
    forms.add(clean)
    forms.add(clean.toLowerCase())
    forms.add(clean.toLowerCase().replace(/ /g, '-'))
    forms.add(clean.toLowerCase().replace(/ /g, '_'))
  }
  for (const p of parts) if (!COMMON_WORDS.has(p) && !keep.has(p)) forms.add(p)
  return [...forms]
}

function namesFromEmail(email) {
  const local = email.split('@')[0]
  if (ROLE_LOCAL_PARTS.test(local)) return null
  const parts = local.split(/[._+-]/).filter((p) => /^[a-z]{2,}$/i.test(p))
  if (parts.length < 2 || parts.length > 4) return null
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}

// Masks numbers in the same clause as a business word
function maskFigures(text, strict) {
  if (strict) text = text.replace(BIG_FIGURE, HIDE)
  const ranges = []
  for (const m of text.matchAll(FIN_WORD)) {
    const s = m.index
    const e = s + m[0].length
    let a = Math.max(0, s - 30)
    let b = Math.min(text.length, e + 45)
    const before = text.slice(a, s)
    const stop = Math.max(before.lastIndexOf('\n'), before.lastIndexOf(';'), before.search(/[.!?]\s[^.!?]*$/))
    if (stop >= 0) a += stop + 1
    const after = text.slice(e, b)
    const end = after.search(/\n|;|[.!?](?:\s|$)/)
    if (end >= 0) b = e + end
    ranges.push([a, b])
  }
  if (!ranges.length) return text
  return text.replace(FIGURE, (fig, offset) => {
    if (/^(?:19|20)\d\d$/.test(fig)) return fig // a year
    return ranges.some(([a, b]) => offset >= a && offset < b) ? HIDE : fig
  })
}

function luhn(digits) {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

function publicIp(ip) {
  const [a, b] = ip.split('.').map(Number)
  if (a === 10 || a === 127 || a === 0 || ip === '255.255.255.255') return false
  if (a === 192 && b === 168) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 169 && b === 254) return false
  return true
}

// Your own name and its parts stay visible
function keepSet(keepNames) {
  const keep = new Set()
  for (const n of keepNames || []) {
    const clean = String(n || '').replace(/\s+/g, ' ').trim()
    if (!clean) continue
    keep.add(clean)
    keep.add(clean.toLowerCase())
    keep.add(clean.toLowerCase().replace(/ /g, '-'))
    for (const part of clean.split(/[ -]/)) if (part) keep.add(part)
  }
  return keep
}

// strict: also every large figure (1,250 / 18% / 40k) wherever it appears
// names: people to mask; keepNames: names that stay visible (yours)
export function makeMasker({ strict = false, values = [], names = [], keepNames = [] } = {}) {
  const KEEP_NAMES = keepSet(keepNames)
  const valueRe = values.length
    ? new RegExp(values.map(escapeRegExp).join('|'), 'g')
    : null
  // Names: the roster passed in plus any learned from emails and contact fields. Memory only.
  const people = new Set()
  let nameRe = null
  let dirty = false
  const learn = (full) => {
    if (people.size > 2000) return
    for (const f of nameForms(full, KEEP_NAMES)) {
      if (!people.has(f)) {
        people.add(f)
        dirty = true
      }
    }
  }
  for (const n of names) learn(n)
  const nameRegex = () => {
    if (dirty) {
      const list = [...people].sort((a, b) => b.length - a.length).map(escapeRegExp)
      nameRe = list.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${list.join('|')})(?:['’]s)?(?![\\p{L}\\p{N}_])`, 'gu') : null
      dirty = false
    }
    return nameRe
  }

  return function mask(text) {
    if (typeof text !== 'string' || text.length === 0) return text
    let out = text
    if (valueRe) out = out.replace(valueRe, DOTS)
    for (const re of SECRET_PATTERNS) out = out.replace(re, DOTS)
    out = out.replace(ASSIGNMENT, (_, name, sep) => name + sep + DOTS)

    // people, learned before the emails that name them are masked
    for (const m of out.matchAll(EMAIL)) {
      const n = namesFromEmail(m[0])
      if (n) learn(n)
    }
    out = out.replace(DISPLAY_NAME, (_, q, name, addr) => {
      learn(name)
      return KEEP_NAMES.has(name) ? q + name + q + addr : HIDE + addr
    })
    out = out.replace(PERSON_KEY, (_, head, value, tail) => {
      learn(value)
      return head + (KEEP_NAMES.has(value) ? value : HIDE) + tail
    })
    out = out.replace(PERSON_LINE, (line, label, value) => (KEEP_NAMES.has(value.trim()) ? line : label + HIDE))
    out = out.replace(EMAIL, '•••@•••')
    const re = nameRegex()
    if (re) out = out.replace(re, HIDE)

    // personal details
    out = out.replace(CARD, (m) => {
      const digits = m.replace(/\D/g, '')
      return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? '•••• •••• •••• ••••' : m
    })
    out = out.replace(SSN, '•••-••-••••')
    out = out.replace(EIN, '••-•••••••')
    out = out.replace(IBAN, HIDE)
    out = out.replace(ACCOUNT, (_, head) => head + HIDE)
    out = out.replace(CARD_ENDING, (_, head) => head + '••••')
    out = out.replace(BIRTH, (_, head) => head + HIDE)
    out = out.replace(STREET, HIDE)
    out = out.replace(PO_BOX, HIDE)
    out = out.replace(STATE_ZIP, (_, head) => head + ' •••••')
    out = out.replace(PHONE, '•••-•••-••••')
    out = out.replace(PHONE_INTL, '+•• •••')
    out = out.replace(IPV4, (ip) => (publicIp(ip) ? '•••.•••.•••.•••' : ip))

    // business figures
    out = out.replace(MONEY, '$•••')
    out = out.replace(MONEY_WORD, HIDE)
    out = maskFigures(out, strict)
    return out
  }
}

// Masks every string inside plain data, keeping the shape.
export function deepMask(value, mask, depth = 0) {
  if (depth > 12) return value
  if (typeof value === 'string') return mask(value)
  if (Array.isArray(value)) return value.map((v) => deepMask(v, mask, depth + 1))
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return value
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = deepMask(v, mask, depth + 1)
    return out
  }
  return value
}

// Hides the readable text inside a business tool's result, keeping short tags (type: 'text') so the row still draws.
export function hideText(s) {
  if (typeof s !== 'string' || s.length === 0) return s
  return s.length > 24 || /\s/.test(s) ? HIDDEN_OUTPUT : s
}

// extra: your own folder or file names from the config file, matched anywhere in a path, any case
export function privatePathHit(text, extra = []) {
  const s = String(text || '')
  for (const re of PRIVATE_PATHS) {
    const m = s.match(re)
    if (m) return m[0].trim().replace(/^["'`\\/_-]/, '')
  }
  const flat = s.replace(/\\/g, '/').toLowerCase()
  for (const item of extra) {
    const needle = String(item || '').replace(/\\/g, '/').toLowerCase().trim()
    if (needle && flat.includes(needle)) return String(item)
  }
  return null
}

// The strings in a tool call's arguments that could name a file or carry a command.
export function toolCallTargets(e) {
  const keys = ['file_path', 'path', 'pattern', 'glob', 'command', 'notebook_path', 'url']
  const out = []
  for (const k of keys) if (typeof e?.[k] === 'string') out.push(e[k])
  return out
}

// Whether a tool's result is business data (mail, chat, tasks, files, calendar, finance)
// extra: more tool or command names (any part of the name) whose results draw as hidden
export function businessSource(tool, input, extra = []) {
  const name = String(tool || '')
  if (BUSINESS_TOOL.test(name)) return true
  const cmd = input && typeof input.command === 'string' ? input.command : ''
  const hay = (name + ' ' + cmd).toLowerCase()
  if (extra.some((x) => x && hay.includes(String(x).toLowerCase()))) return true
  const command = input && typeof input.command === 'string' ? input.command : ''
  return command ? BUSINESS_COMMAND.test(command) : false
}

// extra: more tool names (any part of the name) that stay closed while recording
export function financeTool(tool, extra = []) {
  const name = String(tool || '')
  return FINANCE_TOOL.test(name) || extra.some((x) => x && name.toLowerCase().includes(String(x).toLowerCase()))
}
