#!/usr/bin/env bash
#
# Deploy to the ECS box from your laptop: copies compose + env files, logs the
# remote Docker into CR, pulls the new image, and restarts the stack.
# Run from the repo root:  ./deploy/deploy.sh
#
# Required env (or sourced from deploy/.env.deploy):
#   ECS_HOST     user@ECS_PUBLIC_IP
#   REGISTRY     your-region.cr.bytepluses.com/your-namespace
#   CR_REGISTRY  your-region.cr.bytepluses.com   (host only, for docker login)
#   CR_USER      your-cr-username@your-account-id
#   CR_PASSWORD  <registry access password>
# Optional:
#   SSH_KEY      default ~/.ssh/id_rsa
#   REMOTE_DIR   default /opt/lumen-hub
#   IMAGE_TAG    default latest
#
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f deploy/.env.deploy ] && set -a && . deploy/.env.deploy && set +a

: "${ECS_HOST:?set ECS_HOST=user@1.2.3.4}"
: "${REGISTRY:?set REGISTRY}"
: "${CR_REGISTRY:?set CR_REGISTRY (login host)}"
: "${CR_USER:?set CR_USER}"
: "${CR_PASSWORD:?set CR_PASSWORD}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"
REMOTE_DIR="${REMOTE_DIR:-/opt/lumen-hub}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new $ECS_HOST"

[ -f .env.production ] || { echo "ERROR: .env.production not found in repo root"; exit 1; }

echo ">> Ensuring remote dir $REMOTE_DIR"
$SSH "mkdir -p $REMOTE_DIR"

echo ">> Copying docker-compose.yml + .env.production"
scp -i "$SSH_KEY" docker-compose.yml "$ECS_HOST:$REMOTE_DIR/docker-compose.yml"
scp -i "$SSH_KEY" .env.production    "$ECS_HOST:$REMOTE_DIR/.env.production"

# docker compose reads a sibling ".env" for ${REGISTRY}/${IMAGE_TAG} interpolation
echo ">> Writing remote .env (REGISTRY/IMAGE_TAG for compose interpolation)"
$SSH "printf 'REGISTRY=%s\nIMAGE_TAG=%s\n' '$REGISTRY' '$IMAGE_TAG' > $REMOTE_DIR/.env"

echo ">> Logging remote Docker into CR + pulling + restarting"
$SSH "echo '$CR_PASSWORD' | docker login --username '$CR_USER' --password-stdin '$CR_REGISTRY' \
  && cd $REMOTE_DIR \
  && docker compose pull \
  && docker compose up -d \
  && docker compose ps"

echo ">> Waiting for health endpoint..."
$SSH "for i in \$(seq 1 20); do \
  curl -fsS http://localhost:3000/api/health && echo ' OK' && exit 0; \
  sleep 3; done; echo 'health check timed out'; docker compose -f $REMOTE_DIR/docker-compose.yml logs --tail=40 app; exit 1"

echo ">> Deploy complete."
