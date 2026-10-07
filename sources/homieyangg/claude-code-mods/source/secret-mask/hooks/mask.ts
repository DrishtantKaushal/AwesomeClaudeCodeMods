export type Masked = { text: string; count: number }

// 每條規則兩個 capture：前綴照留，第二個是要遮的值
const PREFIXED: readonly RegExp[] = [
  /()(sk-[A-Za-z0-9_-]{20,})/g,
  /()(gh[pousr]_[A-Za-z0-9]{30,})/g,
  /()(github_pat_[A-Za-z0-9_]{40,})/g,
  /()(xox[abprs]-[A-Za-z0-9-]{10,})/g,
  /()(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g,
  /()(AKIA[0-9A-Z]{16})/g,
  /()(AIza[0-9A-Za-z_-]{35})/g,
  /()(ya29\.[0-9A-Za-z_-]{20,})/g,
  /(Bearer\s+)([A-Za-z0-9._~+/=-]{20,})/gi,
]

// KEY=值 和 "key": "值" 容易誤傷程式碼，所以值要夠長、同時有字母和數字才遮
const ASSIGNED: readonly RegExp[] = [
  /((?:^|[\s;])(?:export\s+)?[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*=["']?)([A-Za-z0-9_\-+/=]{16,})/gm,
  /("[A-Za-z0-9_]*(?:token|secret|password|api_?key)[A-Za-z0-9_]*"\s*:\s*")([A-Za-z0-9_\-+/=.]{16,})(?=")/gi,
]

const PRIVATE_KEY =
  /(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g

const looksRandom = (value: string) => /[A-Za-z]/.test(value) && /[0-9]/.test(value)

// 把文字裡疑似 token 的部分換成前 4 碼加標記，回傳遮了幾處
export const maskText = (input: string, mark: string): Masked => {
  let count = 0
  let text = input.replace(PRIVATE_KEY, (_, head: string) => {
    count += 1

    return `${head}${mark}`
  })

  const apply = (pattern: RegExp, isStrict: boolean) => {
    text = text.replace(pattern, (whole: string, prefix: string, secret: string) => {
      if (isStrict && !looksRandom(secret)) {
        return whole
      }
      count += 1

      return `${prefix}${secret.slice(0, 4)}${mark}`
    })
  }

  for (const pattern of PREFIXED) {
    apply(pattern, false)
  }
  for (const pattern of ASSIGNED) {
    apply(pattern, true)
  }

  return { text, count }
}
