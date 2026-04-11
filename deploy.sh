#!/bin/bash
set -e

REPO_URL="https://github.com/phani05353/MyRouterHub"
APP_DIR="$HOME/MyRouterHub"
IMAGE_NAME="myrouterhub"
CONTAINER_NAME="myrouterhub"
DATA_DIR="$HOME/myrouterhub-data"

# ── 1. Install dependencies (git + docker) if missing ──────────────────────────
echo "==> Checking dependencies..."

if ! command -v git &>/dev/null; then
  echo "    Installing git..."
  sudo apt-get update -qq
  sudo apt-get install -y git
fi

if ! command -v docker &>/dev/null; then
  echo "    Installing Docker..."
  sudo apt-get update -qq
  sudo apt-get install -y ca-certificates curl gnupg lsb-release

  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  sudo apt-get update -qq
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
  sudo systemctl enable --now docker
  echo "    Docker installed."
fi

# ── 2. Clone or update repo ────────────────────────────────────────────────────
echo "==> Cloning / updating repo..."
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull
else
  git clone "$REPO_URL" "$APP_DIR"
fi

# ── 3. Check .env exists ───────────────────────────────────────────────────────
echo "==> Checking .env..."
if [ ! -f "$APP_DIR/.env" ]; then
  echo ""
  echo "ERROR: No .env file found in $APP_DIR"
  echo "  Run: cp $APP_DIR/.env.example $APP_DIR/.env"
  echo "  Then edit $APP_DIR/.env with your router credentials and re-run this script."
  exit 1
fi

# ── 4. Stop & remove old container ────────────────────────────────────────────
echo "==> Stopping old container (if running)..."
sudo docker stop "$CONTAINER_NAME" 2>/dev/null || true

echo "==> Removing old container (if exists)..."
sudo docker rm "$CONTAINER_NAME" 2>/dev/null || true

# ── 5. Build new image ─────────────────────────────────────────────────────────
echo "==> Building Docker image..."
sudo docker build -t "$IMAGE_NAME" "$APP_DIR"

# ── 6. Ensure persistent data directory ───────────────────────────────────────
echo "==> Ensuring data directory exists..."
sudo mkdir -p "$DATA_DIR"

# ── 7. Run new container ───────────────────────────────────────────────────────
echo "==> Starting new container..."
sudo docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network host \
  --env-file "$APP_DIR/.env" \
  -v "$DATA_DIR:/app/data" \
  "$IMAGE_NAME"

echo ""
echo "================================================="
echo " RouterHub is running at http://$(hostname -I | awk '{print $1}'):3011"
echo "================================================="
echo " Logs : sudo docker logs -f $CONTAINER_NAME"
echo " Stop : sudo docker stop $CONTAINER_NAME"
