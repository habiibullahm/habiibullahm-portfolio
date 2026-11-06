#!/usr/bin/env bash
# Reusable Hermes agent capability check. Read-only unless --live.
#
# Static (default): for each profile and platform, record which toolsets
# `hermes tools list` reports as enabled or disabled. Optional expectations
# file turns that inventory into a pass/fail check.
#
#   agent-cap-test.sh
#   agent-cap-test.sh -p juragan -p aci --platform cli,whatsapp
#   agent-cap-test.sh --platform whatsapp -e expectations.txt
#
# Expectations file: "profile platform toolset enabled|disabled"
# profile or platform may be *. Blank lines and # comments are ignored.
#
#   aci whatsapp terminal disabled
#   * whatsapp cronjob disabled
#
# --live also runs one agent turn per profile (costs tokens). `hermes -z`
# bypasses approvals, so the turn is limited to one toolset (default
# context_engine), --ignore-rules, and --reasoning none. Stdout must be
# exactly CAP_OK. This does not change saved tool config.
#
# Run on the VPS (hermes is not on PATH in a non-login shell):
#   bash -lc '~/hermes-migration-backups/tools/agent-cap-test.sh --platform whatsapp'
set -euo pipefail
shopt -s nullglob

PATH="$HOME/.local/bin:$PATH"

live=0
self_test=0
expect_file=
live_toolset=context_engine
timeout_s=180
prompt='Do not call tools. Reply with exactly CAP_OK and no other characters.'
platforms=()
profiles=()

usage() {
  sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
}

die() { printf 'agent-cap-test: %s\n' "$1" >&2; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --self-test) self_test=1; shift ;;
    --live) live=1; shift ;;
    -e|--expect)
      [ $# -ge 2 ] || die "--expect needs a file"
      expect_file=$2; shift 2 ;;
    --live-toolset)
      [ $# -ge 2 ] || die "--live-toolset needs a name"
      live_toolset=$2; shift 2 ;;
    --timeout)
      [ $# -ge 2 ] || die "--timeout needs seconds"
      timeout_s=$2; shift 2 ;;
    -P|--platform)
      [ $# -ge 2 ] || die "--platform needs a value"
      IFS=',' read -r -a _plats <<< "$2"
      platforms+=("${_plats[@]}")
      shift 2 ;;
    -p|--profile)
      [ $# -ge 2 ] || die "--profile needs a name"
      profiles+=("$2"); shift 2 ;;
    --) shift; profiles+=("$@"); break ;;
    -*) die "unknown option: $1" ;;
    *) profiles+=("$1"); shift ;;
  esac
done

valid_name() { [[ "$1" =~ ^[A-Za-z0-9_.-]+$ ]]; }

# stdin: `hermes tools list` text. stdout: toolset<TAB>enabled|disabled
# Also checks the "(platform)" header matches $1.
parse_tool_list() {
  awk -v want="$1" '
    BEGIN { saw = "" }
    {
      line = $0
      sub(/\r$/, "", line)
      if (match(line, /toolsets \(([^)]*)\)/, m)) {
        if (saw == "") saw = m[1]
      }
      n = split(line, f, /[[:space:]]+/)
      status = ""
      name = ""
      for (i = 1; i <= n; i++) {
        if (f[i] == "enabled" || f[i] == "disabled") {
          status = f[i]
          if (i < n) name = f[i + 1]
          break
        }
      }
      if (name == "" || index(name, "(") > 0 || name ~ /:$/) next
      if (!(name in seen)) order[++k] = name
      seen[name] = status
    }
    END {
      if (saw == "") {
        print "tools list has no platform header" > "/dev/stderr"
        exit 3
      }
      if (want != "" && saw != want) {
        print "tools list platform is " saw ", wanted " want > "/dev/stderr"
        exit 4
      }
      for (i = 1; i <= k; i++) print order[i] "\t" seen[order[i]]
    }
  '
}

# $1 matrix TSV (profile platform toolset state), $2 expectations file
# prints mismatches to stderr, returns 1 when any fail
check_expectations() {
  local matrix=$1 file=$2 line prof plat tool state rc=0 n=0
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line//$'\r'/}
    case "$line" in ''|\#*) continue ;; esac
    read -r prof plat tool state _extra <<< "$line"
    [ -n "${_extra:-}" ] && die "bad expectation (4 fields): $line"
    [[ "$prof" == "*" ]] || valid_name "$prof" || die "bad profile in expectation: $line"
    [[ "$plat" == "*" ]] || valid_name "$plat" || die "bad platform in expectation: $line"
    valid_name "$tool" || die "bad toolset in expectation: $line"
    case "$state" in
      enabled|disabled) ;;
      *) die "state must be enabled or disabled: $line" ;;
    esac
    n=$((n + 1))
    # shellcheck disable=SC2016
    awk -v p="$prof" -v plat="$plat" -v tool="$tool" -v want="$state" '
      $3 == tool && (p == "*" || $1 == p) && (plat == "*" || $2 == plat) {
        found = 1
        if ($4 != want) {
          print "mismatch " $1 " " $2 " " $3 ": want " want " got " $4 > "/dev/stderr"
          bad = 1
        }
      }
      END {
        if (!found) {
          print "missing " p " " plat " " tool > "/dev/stderr"
          exit 2
        }
        if (bad) exit 1
      }
    ' "$matrix" || rc=1
  done < "$file"
  [ "$n" -gt 0 ] || die "expectations file has no rules: $file"
  return "$rc"
}

run_self_test() {
  local tmp raw parsed matrix exp rc
  tmp=$(mktemp -d)
  raw=$(cat <<'EOF'
Built-in toolsets (whatsapp):
  ✓ enabled  web  Web Search
  ✗ disabled  terminal  Terminal
  ✗ disabled  cronjob  Cron Jobs
Plugin toolsets (whatsapp):
  ✗ disabled  a2a  A2A
MCP servers:
  tebar  all tools enabled
EOF
)
  parsed=$(printf '%s\n' "$raw" | parse_tool_list whatsapp)
  printf '%s\n' "$parsed" > "$tmp/parsed"
  printf '%s\n' $'web\tenabled\nterminal\tdisabled\ncronjob\tdisabled\na2a\tdisabled' > "$tmp/want"
  if ! cmp -s "$tmp/parsed" "$tmp/want"; then
    echo "self-test: parser mismatch" >&2
    diff -u "$tmp/want" "$tmp/parsed" >&2 || true
    exit 1
  fi
  if printf '%s\n' "$raw" | parse_tool_list cli >/dev/null 2>"$tmp/err"; then
    echo "self-test: platform mismatch was accepted" >&2
    exit 1
  fi
  grep -q "wanted cli" "$tmp/err"

  matrix=$tmp/matrix
  printf '%s\n' \
    $'aci\twhatsapp\tterminal\tdisabled' \
    $'aci\twhatsapp\tweb\tenabled' \
    $'juragan\twhatsapp\tterminal\tenabled' \
    > "$matrix"
  exp=$tmp/exp-fail
  printf '%s\n' '* whatsapp terminal disabled' 'aci whatsapp web enabled' > "$exp"
  if check_expectations "$matrix" "$exp" >"$tmp/out" 2>"$tmp/exp-err"; then
    echo "self-test: expected a mismatch" >&2
    exit 1
  fi
  grep -q "mismatch juragan whatsapp terminal" "$tmp/exp-err"

  exp=$tmp/exp-ok
  printf '%s\n' 'aci whatsapp terminal disabled' 'aci whatsapp web enabled' > "$exp"
  check_expectations "$matrix" "$exp" >/dev/null

  exp=$tmp/exp-miss
  printf '%s\n' 'forge whatsapp web enabled' > "$exp"
  if check_expectations "$matrix" "$exp" >/dev/null 2>"$tmp/miss-err"; then
    echo "self-test: missing toolset was accepted" >&2
    exit 1
  fi
  grep -q "missing forge whatsapp web" "$tmp/miss-err"

  rm -rf "$tmp"
  echo "self-test: ok"
}

if [ "$self_test" -eq 1 ]; then
  run_self_test
  exit 0
fi

command -v hermes >/dev/null 2>&1 || die "hermes not on PATH (run under bash -lc, or install to ~/.local/bin)"
[ ${#platforms[@]} -gt 0 ] || platforms=(cli)

if [ ${#profiles[@]} -eq 0 ]; then
  [ -f "$HOME/.hermes/config.yaml" ] && profiles+=(default)
  for d in "$HOME/.hermes/profiles"/*; do
    [ -f "$d/config.yaml" ] || continue
    profiles+=("$(basename "$d")")
  done
fi
[ ${#profiles[@]} -gt 0 ] || die "no profiles found"

for name in "${profiles[@]}"; do
  valid_name "$name" || die "bad profile name: $name"
done
for name in "${platforms[@]}"; do
  valid_name "$name" || die "bad platform name: $name"
done
if [ -n "$expect_file" ]; then
  [ -f "$expect_file" ] || die "expectations not found: $expect_file"
fi
if [ "$live" -eq 1 ]; then
  command -v timeout >/dev/null 2>&1 || die "timeout(1) is required for --live"
  valid_name "$live_toolset" || die "bad --live-toolset"
  [[ "$timeout_s" =~ ^[0-9]+$ ]] || die "bad --timeout"
fi

matrix=$(mktemp)
trap 'rm -f "$matrix"' EXIT

for profile in "${profiles[@]}"; do
  for platform in "${platforms[@]}"; do
    printf 'listing %s %s\n' "$profile" "$platform" >&2
    raw=$(hermes -p "$profile" tools list --platform "$platform")
    parsed=$(printf '%s\n' "$raw" | parse_tool_list "$platform")
    [ -n "$parsed" ] || die "no toolsets for $profile $platform"
    while IFS=$'\t' read -r tool state; do
      printf '%s\t%s\t%s\t%s\n' "$profile" "$platform" "$tool" "$state" >> "$matrix"
    done <<< "$parsed"
  done
done

sort -o "$matrix" "$matrix"
cat "$matrix"

fail=0
if [ -n "$expect_file" ]; then
  check_expectations "$matrix" "$expect_file" || fail=1
fi

if [ "$live" -eq 1 ]; then
  echo "live probe uses hermes -z (approvals bypassed) toolset=$live_toolset" >&2
  for profile in "${profiles[@]}"; do
    work=$(mktemp -d)
    usage=$work/usage.json
    out=$work/out.txt
    err=$work/err.txt
    rc=0
    timeout "$timeout_s" hermes -p "$profile" \
      --ignore-rules --reasoning none -t "$live_toolset" \
      --in "$work" --usage-file "$usage" -z "$prompt" \
      >"$out" 2>"$err" || rc=$?
    reply=$(tr -d '\r' < "$out" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    detail="rc=$rc"
    if [ -s "$usage" ] && command -v python3 >/dev/null 2>&1; then
      stats=$(python3 -c '
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
keep = []
def walk(x):
    if isinstance(x, dict):
        for k, v in x.items():
            if isinstance(v, (dict, list)):
                walk(v)
            elif k in ("model", "provider", "cost", "estimated_cost", "api_calls") or "token" in k:
                keep.append("%s=%s" % (k, v))
walk(d)
print(" ".join(keep[:8]))
' "$usage" 2>/dev/null || true)
      [ -n "$stats" ] && detail="$detail $stats"
    fi
    if [ "$rc" -eq 0 ] && [ "$reply" = "CAP_OK" ]; then
      printf 'live %s pass %s\n' "$profile" "$detail" >&2
    else
      fail=1
      snippet=$(printf '%s' "$reply" | tr '\n' ' ' | cut -c1-180)
      printf 'live %s fail %s reply=%s\n' "$profile" "$detail" "$snippet" >&2
      if [ -s "$err" ]; then
        tr '\n' ' ' < "$err" | cut -c1-300 >&2
        echo >&2
      fi
    fi
    rm -rf "$work"
  done
fi

exit "$fail"
