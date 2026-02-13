#!/usr/bin/env bash
set -euo pipefail

npm install
cp config/development.yaml config/local.yaml 2>/dev/null || true
echo "Setup complete. Configure environment variables before running npm run dev."
