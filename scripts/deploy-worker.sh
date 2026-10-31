#!/usr/bin/env bash
# Docs: docs/deploy.md
# Deploy the worker (apps/worker Docker image) to a Google Cloud VM as an always-on service.
# Idempotent: safe to re-run for every update. Run by a human, never by an agent.
#
#   From your laptop (repo root, gcloud signed in):
#     scripts/deploy-worker.sh push <vm-name> [zone]   # ships the committed HEAD, then runs setup
#   On the VM (inside the repo folder: a git clone or the folder `push` created):
#     scripts/deploy-worker.sh setup
#
# Env knobs: SWAP_GB (default 2; 0 = no swap), REMOTE_DIR (default ~/clip-studio on the VM),
# ENV_FILE (push only: a filled worker .env to copy to the VM, e.g. apps/worker/.env.prod),
# YES=1 (skip the "laptop worker stopped?" question).
set -euo pipefail

cmd=${1:-}

push() {
  local vm=${1:?usage: deploy-worker.sh push <vm-name> [zone]} zone=${2:-}
  local zflag=() dir=${REMOTE_DIR:-clip-studio}
  [[ -n $zone ]] && zflag=(--zone "$zone")
  cd "$(git rev-parse --show-toplevel)"
  if [[ ${YES:-} != 1 ]]; then
    echo "Two workers must never run against production at once."
    read -r -p "Is the laptop worker stopped (docker compose stop worker / no 'python main.py')? [y/N] " ok
    [[ $ok == [yY] ]] || { echo "Stop it first (docs/deploy.md)."; exit 1; }
  fi
  [[ -n $(git status --porcelain -- apps/worker docker-compose.yml scripts) ]] &&
    echo "Note: uncommitted worker changes are NOT shipped; push sends the committed HEAD."
  local tar
  tar=$(mktemp -t clip-worker.XXXXXX.tar.gz)
  git archive --format=tar.gz -o "$tar" HEAD apps/worker docker-compose.yml scripts/deploy-worker.sh
  gcloud compute scp ${zflag[@]+"${zflag[@]}"} "$tar" "$vm:/tmp/clip-worker.tar.gz"
  rm -f "$tar"
  if [[ -n ${ENV_FILE:-} ]]; then
    gcloud compute scp ${zflag[@]+"${zflag[@]}"} "$ENV_FILE" "$vm:/tmp/clip-worker.env"
  fi
  gcloud compute ssh ${zflag[@]+"${zflag[@]}"} "$vm" --command "set -e
    mkdir -p ~/$dir && tar -xzf /tmp/clip-worker.tar.gz -C ~/$dir && rm /tmp/clip-worker.tar.gz
    if [ -f /tmp/clip-worker.env ]; then
      install -m 600 /tmp/clip-worker.env ~/$dir/apps/worker/.env && rm /tmp/clip-worker.env
    fi
    cd ~/$dir && SWAP_GB=${SWAP_GB:-2} bash scripts/deploy-worker.sh setup"
}

setup() {
  cd "$(dirname "$0")/.."
  [[ -f docker-compose.yml && -d apps/worker ]] || { echo "Run from the repo folder."; exit 1; }
  local sudo=""
  [[ $(id -u) == 0 ]] || sudo=sudo

  # 1. Docker Engine + compose plugin (official convenience script; skipped once installed).
  if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | $sudo sh
  fi
  $sudo systemctl enable --now docker >/dev/null
  local docker="$sudo docker"
  docker info >/dev/null 2>&1 && docker=docker

  # 2. Swap: FFmpeg + the NSFW model can spike past small VMs' RAM (docs/deploy.md "Sizing").
  local gb=${SWAP_GB:-2}
  if [[ $gb != 0 ]] && ! $sudo swapon --show | grep -q /swapfile; then
    $sudo fallocate -l "${gb}G" /swapfile && $sudo chmod 600 /swapfile
    $sudo mkswap /swapfile >/dev/null && $sudo swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | $sudo tee -a /etc/fstab >/dev/null
    echo "swap: ${gb} GB on /swapfile"
  fi

  # 3. A git clone updates itself; a pushed folder is already current.
  if [[ -d .git ]] && git remote get-url origin >/dev/null 2>&1; then
    git pull --ff-only
  fi

  # 4. Worker env: created once from the template, then the human fills it in.
  if [[ ! -f apps/worker/.env ]]; then
    install -m 600 apps/worker/.env.example apps/worker/.env
    echo "Created apps/worker/.env from the template. Fill in the production values"
    echo "(docs/deploy.md \"Worker env\"), then re-run: bash scripts/deploy-worker.sh setup"
    exit 1
  fi
  if grep -Eq '^YOUTUBE_FAKE=(true|1)' apps/worker/.env; then
    echo "apps/worker/.env sets YOUTUBE_FAKE; remove it for production." && exit 1
  fi
  if grep -Eq 'your-project|sb_secret_xxx|your-db-password|base64-32-bytes' apps/worker/.env; then
    echo "apps/worker/.env still has template placeholders. Fill it in first." && exit 1
  fi

  # 5. Build + start. restart: unless-stopped (docker-compose.yml) brings it back after reboots.
  $docker compose build worker
  $docker compose up -d worker
  $docker compose ps worker
  echo
  echo "Worker running. Logs: cd $(pwd) && $docker compose logs -f worker"
  echo "Stop: $docker compose stop worker   (do this before running a worker anywhere else)"
}

case $cmd in
  push) shift; push "$@" ;;
  setup) setup ;;
  *) sed -n '3,13p' "$0"; exit 2 ;;
esac
