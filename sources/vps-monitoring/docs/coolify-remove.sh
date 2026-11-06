#!/usr/bin/env bash
# Coolify backup + removal. docex (own volume docex-data, bridge network) is NOT touched.
# Usage:  coolify-remove.sh backup        non-destructive, writes ~/hermes-migration-backups/coolify-<ts>/
#         coolify-remove.sh plan          shows what remove would do (default for 'remove')
#         coolify-remove.sh remove --yes  destructive, needs a backup from the last 24h
set -euo pipefail
D="sudo -n docker"
ROOT="$HOME/hermes-migration-backups"
CONTAINERS="coolify coolify-db coolify-redis coolify-sentinel coolify-proxy"
VOLUMES="coolify-db coolify-redis"          # never docex-data
IMAGES="coollabsio/coolify coollabsio/coolify-helper coollabsio/sentinel postgres:15-alpine redis:7-alpine traefik:v3.7"

latest_backup() { ls -dt "$ROOT"/coolify-* 2>/dev/null | head -1 || true; }

do_backup() {
  umask 077
  dest="$ROOT/coolify-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$dest"; chmod 700 "$dest"
  echo "backup -> $dest"
  $D exec coolify-db pg_dump -U coolify coolify | gzip > "$dest/coolify-db.sql.gz"
  sudo -n tar czf "$dest/data-coolify.tar.gz" -C /data coolify
  sudo -n cat /root/.ssh/authorized_keys > "$dest/root-authorized_keys.bak"
  sudo -n chown -R "$(id -u):$(id -g)" "$dest"; chmod 600 "$dest"/*
  gzip -t "$dest/coolify-db.sql.gz" && tar tzf "$dest/data-coolify.tar.gz" >/dev/null
  echo "verified: gzip + tar readable"; ls -lh "$dest"
  echo "(contains Coolify keys/APP_KEY: keep 700, never share)"
}

show_plan() {
  echo "containers to stop+remove: $CONTAINERS"
  echo "volumes to remove:         $VOLUMES   (docex-data stays)"
  echo "networks to remove:        coolify, source_default (only if unused)"
  echo "images to remove:          $IMAGES (docex:latest stays)"
  echo "directory to remove:       /data/coolify"
  echo "root authorized_keys lines mentioning coolify: $(sudo -n grep -ci coolify /root/.ssh/authorized_keys || true)"
  echo "docex now: $($D inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' docex)"
  b="$(latest_backup)"; echo "latest backup: ${b:-NONE}"
}

do_remove() {
  b="$(latest_backup)"
  [ -n "$b" ] && [ -f "$b/coolify-db.sql.gz" ] || { echo "no backup, run: $0 backup"; exit 1; }
  [ -n "$(find "$b" -maxdepth 0 -mmin -1440)" ] || { echo "latest backup older than 24h, run backup again"; exit 1; }
  [ "${1:-}" = "--yes" ] || { show_plan; echo; echo "dry run only. add --yes to execute."; exit 0; }
  for c in $CONTAINERS; do $D rm -f "$c" 2>/dev/null && echo "removed container $c" || echo "skip container $c"; done
  for v in $VOLUMES; do $D volume rm "$v" 2>/dev/null && echo "removed volume $v" || echo "skip volume $v"; done
  for n in coolify source_default; do $D network rm "$n" 2>/dev/null && echo "removed network $n" || echo "skip network $n"; done
  for i in $IMAGES; do $D images -q "$i" | xargs -r $D rmi 2>/dev/null || true; done
  $D images --format '{{.Repository}}:{{.Tag}}' | grep '^coollabsio/' | xargs -r $D rmi 2>/dev/null || true
  sudo -n rm -rf /data/coolify && echo "removed /data/coolify"
  sudo -n sed -i '/coolify/Id' /root/.ssh/authorized_keys && echo "removed coolify key line(s) from root authorized_keys"
  echo "--- after ---"; $D ps --format '{{.Names}}|{{.Status}}'
  ss -tlnp 2>/dev/null | awk 'NR==1||/:8000|:6001|:6002|:80 |:443 /'
  free -m | head -2
}

case "${1:-}" in
  backup) do_backup ;;
  plan)   show_plan ;;
  remove) shift; do_remove "${1:-}" ;;
  *) echo "usage: $0 backup|plan|remove [--yes]"; exit 2 ;;
esac
