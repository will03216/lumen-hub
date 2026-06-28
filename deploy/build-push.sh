#!/usr/bin/env bash
#
# Build the amd64 image and push it to BytePlus Container Registry.
# Run from the repo root:  ./deploy/build-push.sh
#
# Required env (or sourced from deploy/.env.deploy):
#   REGISTRY                          e.g. your-region.cr.bytepluses.com/your-namespace
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY pk_live_... (or pk_test_...)
#   NEXT_PUBLIC_APP_URL              https://app.yourdomain.com
# Optional:
#   IMAGE_TAG                         default: latest
#   NEXT_PUBLIC_CDN_BASE             default: empty (same-origin media until CDN exists)
#
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f deploy/.env.deploy ] && set -a && . deploy/.env.deploy && set +a

: "${REGISTRY:?set REGISTRY, e.g. your-region.cr.bytepluses.com/your-namespace}"
: "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:?set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}"
: "${NEXT_PUBLIC_APP_URL:?set NEXT_PUBLIC_APP_URL}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
NEXT_PUBLIC_CDN_BASE="${NEXT_PUBLIC_CDN_BASE:-}"

IMAGE="$REGISTRY/lumen-hub:$IMAGE_TAG"
echo ">> Building (linux/amd64) and pushing: $IMAGE"

docker buildx build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" \
  --build-arg NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL" \
  --build-arg NEXT_PUBLIC_CDN_BASE="$NEXT_PUBLIC_CDN_BASE" \
  -t "$IMAGE" \
  --push .

echo ">> Done. Verify with: docker manifest inspect $IMAGE"
