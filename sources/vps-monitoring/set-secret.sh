#!/usr/bin/env bash
# Usage: set-secret.sh <profile> <VAR_NAME>
# Reads the value from a hidden prompt (never printed, never in shell history) and writes it
# to that profile's .env (mode 600). Replaces an existing line for the same variable.
set -euo pipefail
p="${1:?profile}"; v="${2:?VAR_NAME}"
[[ "$v" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "bad variable name"; exit 2; }
if [ "$p" = default ]; then f="$HOME/.hermes/.env"; else f="$HOME/.hermes/profiles/$p/.env"; fi
[ -f "$f" ] || { echo "no .env for profile $p"; exit 2; }
read -rsp "Paste value for $v ($p), input is hidden: " val; echo
[ -n "$val" ] || { echo "empty value, aborted"; exit 1; }
umask 077
cp -p "$f" "$f.bak-before-$v-$(date +%Y%m%d-%H%M%S)"
tmp="$(mktemp)"
grep -v "^${v}=" "$f" > "$tmp" || true
printf '%s=%s\n' "$v" "$val" >> "$tmp"
cat "$tmp" > "$f"; rm -f "$tmp"; chmod 600 "$f"
unset val
echo "saved $v in profile $p (value not shown)"
