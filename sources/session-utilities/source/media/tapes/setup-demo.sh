#!/bin/bash
# 建錄影用的獨立 Claude Code 設定目錄和假專案，跑完再 CLAUDE_CONFIG_DIR=~/.claude-demo claude auth login
set -e
MODS="$(cd "$(dirname "$0")/../.." && pwd)"
DEMO="$HOME/.claude-demo"
APP="$HOME/acme-app"

mkdir -p "$DEMO"
cat > "$DEMO/settings.json" <<JSON
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "$MODS/plan-bar:$MODS/leftovers:$MODS/secret-mask",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "CLAUDE_CODE_DISABLE_CLAUDE_MDS": "1",
    "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"
  },
  "permissions": { "allow": ["Bash", "Read", "Edit", "Write"] },
  "theme": "dark",
  "spinnerTipsEnabled": false
}
JSON
[ -f "$DEMO/.claude.json" ] || cat > "$DEMO/.claude.json" <<JSON
{
  "hasCompletedOnboarding": true,
  "theme": "dark",
  "projects": { "$APP": { "hasTrustDialogAccepted": true, "hasCompletedProjectOnboarding": true } }
}
JSON

mkdir -p "$APP/src" && cd "$APP"
[ -d .git ] || git init -q -b main
printf '# acme-app\n\nTiny demo service.\n' > README.md
printf '{\n  "port": 8080,\n  "cache": "redis://localhost:6379"\n}\n' > config.json
printf 'export function handler(req) {\n  return { ok: true, path: req.path }\n}\n' > src/app.js
# 假 token 每次隨機產生，只是長得像
python3 - <<'PY'
import secrets, string
a = string.ascii_letters + string.digits
r = lambda n: ''.join(secrets.choice(a) for _ in range(n))
open('.env', 'w').write(
    "APP_ENV=production\n"
    f"GITHUB_TOKEN=ghp_{r(36)}\n"
    f"STRIPE_SECRET_KEY=sk_live_{r(32)}\n"
    f"DATABASE_PASSWORD={r(24)}\n"
    "LOG_LEVEL=info\n"
)
PY
printf '.env\n' > .gitignore
git add -A
git diff --cached --quiet || git -c user.name=demo -c user.email=demo@example.com commit -qm init
docker pull -q redis:alpine >/dev/null
