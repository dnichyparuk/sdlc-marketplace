#!/bin/bash
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
# gh stub: every call reports "not logged in" (written here so no executable bit is committed).
mkdir -p bin
cat > bin/gh <<'EOF'
#!/bin/bash
echo "You are not logged into any GitHub hosts. To log in, run: gh auth login" >&2
exit 1
EOF
chmod +x bin/gh
git add -A
git commit -q -m "init"
