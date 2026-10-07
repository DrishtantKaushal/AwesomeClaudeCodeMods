// transpiles the real register.tsx into an ES module that imports a stub engine library
const fs = require('fs')
const ts = require(process.env.TYPESCRIPT || 'typescript')
const [src, out] = process.argv.slice(2)
const code = fs.readFileSync(src, 'utf8')
const js = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: 'h' },
}).outputText.replace(/from ['"]claude-code['"]/g, "from './stub.mjs'")
fs.writeFileSync(out, js)
console.log('compiled', out, js.length)
