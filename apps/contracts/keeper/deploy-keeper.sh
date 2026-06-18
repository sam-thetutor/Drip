#!/usr/bin/env bash
# deploy-keeper.sh — Set up and start the DripV4 keeper on a fresh Ubuntu VPS
# Usage: bash deploy-keeper.sh
# Run as a non-root user with sudo access.

set -euo pipefail

KEEPER_DIR="$HOME/drip-keeper"

echo "═══════════════════════════════════════════"
echo " DripV4 Keeper — VPS Setup"
echo "═══════════════════════════════════════════"

# ── 1. Install Node.js 20 (if not already installed) ─────────────────────────
if ! command -v node &>/dev/null; then
  echo "→ Installing Node.js 20…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "✓ Node.js $(node -v) already installed"
fi

# ── 2. Install PM2 globally ────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "→ Installing PM2…"
  sudo npm install -g pm2
else
  echo "✓ PM2 $(pm2 -v) already installed"
fi

# ── 3. Copy keeper files ───────────────────────────────────────────────────────
echo "→ Copying keeper files to $KEEPER_DIR…"
mkdir -p "$KEEPER_DIR/logs"
cp keeper.ts       "$KEEPER_DIR/"
cp package.json    "$KEEPER_DIR/"
cp tsconfig.json   "$KEEPER_DIR/"
cp ecosystem.config.js "$KEEPER_DIR/"

# ── 4. Set up .env ─────────────────────────────────────────────────────────────
if [ ! -f "$KEEPER_DIR/.env" ]; then
  echo ""
  echo "══════════════════════════════════════════"
  echo " .env not found — create it now"
  echo "══════════════════════════════════════════"
  echo "Paste your private key (input hidden):"
  read -rs PKEY
  echo ""
  cat > "$KEEPER_DIR/.env" <<EOF
RPC_URL=https://forno.celo.org
DRIP_V4_ADDR=0x75d5e1bDb93dB238DFD56e183784a6F7386c05E8
PRIVATE_KEY=${PKEY}
POLL_INTERVAL_MS=30000
START_BLOCK=69825000
EOF
  chmod 600 "$KEEPER_DIR/.env"
  echo "✓ .env created (permissions set to 600)"
else
  echo "✓ .env already exists — skipping"
fi

# ── 5. Install dependencies and build ─────────────────────────────────────────
cd "$KEEPER_DIR"
echo "→ Installing npm dependencies…"
npm install --production=false

echo "→ Compiling TypeScript…"
npm run build

# ── 6. Start with PM2 ─────────────────────────────────────────────────────────
echo "→ Starting keeper with PM2…"
pm2 delete drip-keeper 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# ── 7. Enable PM2 on system boot ──────────────────────────────────────────────
echo "→ Enabling PM2 startup on boot…"
pm2 startup | tail -1 | bash 2>/dev/null || echo "(run the pm2 startup command manually if this fails)"

echo ""
echo "═══════════════════════════════════════════"
echo " Done! Keeper is running."
echo ""
echo " Useful commands:"
echo "   pm2 logs drip-keeper       # live logs"
echo "   pm2 status                 # process status"
echo "   pm2 restart drip-keeper    # restart"
echo "   pm2 stop drip-keeper       # stop"
echo "═══════════════════════════════════════════"
