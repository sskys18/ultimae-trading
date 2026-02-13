#!/usr/bin/env bash
set -euo pipefail

npm run build
rsync -av dist/ user@server:/opt/kimp/dist
ssh user@server 'pm2 reload kimp-bot'
