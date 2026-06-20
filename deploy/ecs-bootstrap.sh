#!/usr/bin/env bash
#
# One-time setup on a fresh Ubuntu 22.04 ECS instance: installs Docker + compose.
# Copy this to the ECS box and run as a sudo-capable user:
#   scp deploy/ecs-bootstrap.sh user@ECS_IP:~  &&  ssh user@ECS_IP 'bash ecs-bootstrap.sh'
#
set -euo pipefail

if command -v docker >/dev/null 2>&1; then
  echo ">> Docker already installed: $(docker --version)"
else
  echo ">> Installing Docker Engine + compose plugin"
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

sudo usermod -aG docker "$USER" || true
sudo mkdir -p /opt/lumen-hub
sudo chown "$USER":"$USER" /opt/lumen-hub
echo ">> Bootstrap complete. Log out/in once so the 'docker' group applies, then run deploy.sh from your laptop."
