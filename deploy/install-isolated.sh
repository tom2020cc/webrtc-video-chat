#!/usr/bin/env bash
set -euo pipefail
ROOT=/www/wwwroot/webrtc-video-chat
NODE=/www/server/nvm/versions/node/v22.23.2/bin/node
cd "$ROOT"
test "$(realpath "$ROOT")" = "$ROOT"
test -x "$NODE"
test ! -e /etc/systemd/system/webrtc-video.service
test ! -e /etc/webrtc-video.env
test ! -e /www/server/panel/vhost/nginx/webrtc-video.conf
if ss -lnt | grep -qE ':3100[[:space:]]'; then echo 'Port 3100 is occupied'; exit 1; fi
if id webrtc-video >/dev/null 2>&1; then echo 'User already exists; inspect before reuse'; exit 1; fi
"$NODE" --check server/app.js
"$NODE" -e 'require("express");require("socket.io");require("peer")'
useradd --system --no-create-home --home-dir /var/lib/webrtc-video --shell /sbin/nologin webrtc-video
"$NODE" <<'NODE'
const fs=require('fs'), crypto=require('crypto');
fs.writeFileSync('/etc/webrtc-video.env', [
  'NODE_ENV=production', 'HOST=127.0.0.1', 'PORT=3100',
  'DATA_DIR=/var/lib/webrtc-video', 'ADMIN_ALLOWED_IPS=127.0.0.1,::1',
  'ADMIN_PASSWORD='+crypto.randomBytes(24).toString('hex'),
  'ADMIN_SECRET='+crypto.randomBytes(32).toString('hex'), ''
].join('\n'), {mode:0o600,flag:'wx'});
NODE
install -m 644 deploy/webrtc-video.service /etc/systemd/system/webrtc-video.service
systemctl daemon-reload
systemctl enable --now webrtc-video
for attempt in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3100/ -o /dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3100/ -o /dev/null
curl -fsS http://127.0.0.1:3100/peerjs/peerjs/id
echo
echo VIDEO_SERVICE_READY
systemctl is-active webrtc-video
systemctl is-enabled webrtc-video
