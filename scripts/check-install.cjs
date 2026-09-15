const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'webrtc-install-check-'));
const env = { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: process.env.CHECK_PORT || '3101', DATA_DIR: data, ADMIN_PASSWORD: 'installation-test-only' };
const server = spawn(process.execPath, ['server/app.js'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
let result = 1;
const timer = setTimeout(() => { console.error('Install verification timed out'); server.kill(); process.exitCode = 1; }, 30000);
server.stdout.once('data', () => {
  const smoke = spawn(process.execPath, ['scripts/smoke-test.js'], { env: {...env, TEST_URL: `http://127.0.0.1:${env.PORT}`}, stdio: 'inherit' });
  smoke.on('exit', code => { result = code ?? 1; server.kill(); });
});
server.on('exit', () => { clearTimeout(timer); fs.rmSync(data, {recursive:true,force:true}); process.exitCode = result; });
