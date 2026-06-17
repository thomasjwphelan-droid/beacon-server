'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  path.join(root, 'server.js'),
  ...fs.readdirSync(path.join(root, 'sources'))
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(root, 'sources', file))
];

let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`Checked ${files.length} JavaScript files.`);
