// بناء الواجهة: يستخدم npm ci عند وجود package-lock.json (إصدارات ثابتة ومضمونة)، وإلا npm install.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const client = path.join(__dirname, '..', 'client');
const run = (cmd) => { const r = spawnSync(cmd, { cwd: client, stdio: 'inherit', shell: true }); if (r.status !== 0) process.exit(r.status || 1); };

if (!fs.existsSync(path.join(client, 'package-lock.json'))) console.warn('⚠️ لا يوجد client/package-lock.json، سيُستخدم npm install (غير مثبّت الإصدارات)');
run(fs.existsSync(path.join(client, 'package-lock.json')) ? 'npm ci --include=dev' : 'npm install --include=dev');
run('npm run build');
