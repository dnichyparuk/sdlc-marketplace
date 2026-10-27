#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

mkdir -p openspec/specs openspec/changes/add-auth/specs bin

printf 'version: "1.0"\nproject: test-project\n' > openspec/config.yaml
printf '# Core Spec\n\nBase architecture.\n' > openspec/specs/core.md
printf '# Add Authentication\n\nAdd OAuth2 authentication flow.\n' > openspec/changes/add-auth/proposal.md
printf '# Tasks\n\n- [x] Implement OAuth2 provider\n- [x] Add session middleware\n- [x] Write integration tests\n' > openspec/changes/add-auth/tasks.md
printf '# Auth Spec\n\nOAuth2 PKCE flow.\n' > openspec/changes/add-auth/specs/auth-spec.md

# Stub openspec CLI (bin/ stays untracked; script_stub_bin puts it on PATH).
cat > bin/openspec <<'STUB'
#!/bin/sh
case "$1" in
  validate) exit 0 ;;
  archive) mkdir -p openspec/changes/archive && mv "openspec/changes/$2" "openspec/changes/archive/2026-01-01-$2" ;;
  *) exit 1 ;;
esac
STUB
chmod 755 bin/openspec

git add openspec
git commit -q -m init
