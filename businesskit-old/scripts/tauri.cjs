const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// Ensure ~/.cargo/bin is always in PATH across macOS, Linux, and Windows
const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
const delimiter = path.delimiter;
if (!process.env.PATH || !process.env.PATH.includes(cargoBin)) {
  process.env.PATH = `${cargoBin}${delimiter}${process.env.PATH || ''}`;
}

const tauriBin = path.join(__dirname, '..', 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [tauriBin, ...args], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 0);
