#!/bin/bash
# Fixture for validate-args-rule.js: three skills that each break the arguments rule.
set -e
S=plugins/sdlc-utilities/skills
mkdir -p "$S/github-sdlc" "$S/free-text-sdlc" "$S/no-hint-sdlc"

cat > "$S/github-sdlc/SKILL.md" <<'EOF'
---
name: github-sdlc
argument-hint: "[--repo <[HOST/]OWNER/REPO>] [--auto]"
---
# github-sdlc

```bash
node prepare.js $ARGUMENTS
```
EOF

cat > "$S/free-text-sdlc/SKILL.md" <<'EOF'
---
name: free-text-sdlc
argument-hint: "[--auto] [request]"
---
# free-text-sdlc

```bash
node prepare.js $ARGUMENTS
```
EOF

cat > "$S/no-hint-sdlc/SKILL.md" <<'EOF'
---
name: no-hint-sdlc
---
# no-hint-sdlc

```bash
node prepare.js $ARGUMENTS
```
EOF
