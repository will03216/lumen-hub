#!/usr/bin/env bash
#
# Run ON the ECS box (via BytePlus Remote Connect web console) to deploy the
# latest image already pushed to CR. Replaces the SSH-based deploy.sh for the
# no-SSH setup.
#
# First-time install on the box (paste once):
#   mkdir -p /opt/lumen-hub && cat > /opt/lumen-hub/onbox-update.sh <<'EOF'
#   ...contents of this file...
#   EOF
#   chmod +x /opt/lumen-hub/onbox-update.sh
#
# Then every deploy:  cd /opt/lumen-hub && ./onbox-update.sh
#
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env.production ] || { echo "ERROR: .env.production missing in $(pwd)"; exit 1; }
[ -f docker-compose.yml ] || { echo "ERROR: docker-compose.yml missing in $(pwd)"; exit 1; }

echo ">> Pulling latest image from CR"
docker compose pull

echo ">> Recreating container"
docker compose up -d
docker compose ps

echo ">> Waiting for health endpoint (host port 80)"
for i in $(seq 1 20); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' http://localhost/api/health || true)
  if [ "$code" = "200" ]; then echo ">> HEALTHY (200)"; exit 0; fi
  sleep 3
done
echo ">> Health check did not return 200 in time — recent logs:"
docker compose logs app --tail=40
exit 1
