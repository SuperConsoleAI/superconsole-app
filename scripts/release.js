#!/usr/bin/env node
/**
 * SuperConsole Release & Version Bump Automation
 *
 * Usage:
 *   node scripts/release.js <new-version> [versionCode] [--push] [--skip-build]
 *
 * Examples:
 *   npm run release 0.0.5
 *   npm run release 0.0.5 5
 *   npm run release 0.0.5 5 --push
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--')));

const shouldPush = flags.has('--push');
const skipBuild = flags.has('--skip-build');

if (args.length === 0) {
  console.error(`\x1b[31mError: Missing new version argument.\x1b[0m`);
  console.log(`\nUsage:`);
  console.log(`  npm run release <new-version> [versionCode] [--push] [--skip-build]`);
  console.log(`\nExample:`);
  console.log(`  npm run release 0.0.5 5 --push\n`);
  process.exit(1);
}

const rawVersion = args[0].trim();
const newVersion = rawVersion.startsWith('v') ? rawVersion.slice(1) : rawVersion;
const newTag = `v${newVersion}`;

// Derive versionCode if not explicitly supplied
let versionCode = args[1] ? parseInt(args[1], 10) : null;
if (!versionCode || Number.isNaN(versionCode)) {
  const parts = newVersion.split('.');
  const lastNum = parseInt(parts[parts.length - 1], 10);
  versionCode = !Number.isNaN(lastNum) ? lastNum : 1;
}

console.log(`\x1b[34m==============================================\x1b[0m`);
console.log(`\x1b[1;36m SuperConsole Version Bump: ${newTag} (versionCode: ${versionCode})\x1b[0m`);
console.log(`\x1b[34m==============================================\x1b[0m\n`);

// 1. package.json
const pkgPath = path.join(ROOT_DIR, 'package.json');
let pkgContent = fs.readFileSync(pkgPath, 'utf8');
pkgContent = pkgContent.replace(/"version":\s*"[^"]+"/, `"version": "${newVersion}"`);
fs.writeFileSync(pkgPath, pkgContent, 'utf8');
console.log(`\x1b[32m✓\x1b[0m package.json (${newVersion})`);

// 2. package-lock.json
const pkgLockPath = path.join(ROOT_DIR, 'package-lock.json');
if (fs.existsSync(pkgLockPath)) {
  let pkgLockContent = fs.readFileSync(pkgLockPath, 'utf8');
  let replacedCount = 0;
  pkgLockContent = pkgLockContent.replace(/"version":\s*"[^"]+"/g, (match) => {
    if (replacedCount < 2) {
      replacedCount++;
      return `"version": "${newVersion}"`;
    }
    return match;
  });
  fs.writeFileSync(pkgLockPath, pkgLockContent, 'utf8');
  console.log(`\x1b[32m✓\x1b[0m package-lock.json (${newVersion})`);
}

// 3. src-tauri/Cargo.toml
const cargoPath = path.join(ROOT_DIR, 'src-tauri', 'Cargo.toml');
let cargoContent = fs.readFileSync(cargoPath, 'utf8');
cargoContent = cargoContent.replace(/^version\s*=\s*"[^"]+"/m, `version = "${newVersion}"`);
fs.writeFileSync(cargoPath, cargoContent, 'utf8');
console.log(`\x1b[32m✓\x1b[0m src-tauri/Cargo.toml (${newVersion})`);

// 4. src-tauri/tauri.conf.json
const tauriConfPath = path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json');
let tauriConfContent = fs.readFileSync(tauriConfPath, 'utf8');
tauriConfContent = tauriConfContent.replace(/"version":\s*"[^"]+"/, `"version": "${newVersion}"`);
fs.writeFileSync(tauriConfPath, tauriConfContent, 'utf8');
console.log(`\x1b[32m✓\x1b[0m src-tauri/tauri.conf.json (${newVersion})`);

// 5. src-tauri/gen/android/app/build.gradle.kts
const gradlePath = path.join(ROOT_DIR, 'src-tauri', 'gen', 'android', 'app', 'build.gradle.kts');
if (fs.existsSync(gradlePath)) {
  let gradleContent = fs.readFileSync(gradlePath, 'utf8');
  gradleContent = gradleContent.replace(
    /versionCode\s*=\s*tauriProperties\.getProperty\("tauri\.android\.versionCode",\s*"\d+"\)\.toInt\(\)\.coerceAtLeast\(\d+\)/,
    `versionCode = tauriProperties.getProperty("tauri.android.versionCode", "${versionCode}").toInt().coerceAtLeast(${versionCode})`
  );
  gradleContent = gradleContent.replace(
    /versionName\s*=\s*tauriProperties\.getProperty\("tauri\.android\.versionName",\s*"[^"]+"\)/,
    `versionName = tauriProperties.getProperty("tauri.android.versionName", "${newVersion}")`
  );
  fs.writeFileSync(gradlePath, gradleContent, 'utf8');
  console.log(`\x1b[32m✓\x1b[0m src-tauri/gen/android/app/build.gradle.kts (versionCode: ${versionCode}, versionName: ${newVersion})`);
}

if (!skipBuild) {
  console.log(`\n\x1b[33mRunning verification (cargo check & npm run build)...\x1b[0m`);
  try {
    console.log(`  > cargo check (updates src-tauri/Cargo.lock)`);
    execSync('cargo check', { cwd: path.join(ROOT_DIR, 'src-tauri'), stdio: 'inherit' });
    console.log(`  > npm run build`);
    execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log(`\x1b[32m✓\x1b[0m Verification passed successfully.\n`);
  } catch (err) {
    console.error(`\x1b[31mVerification failed! Please fix the errors before committing.\x1b[0m`);
    process.exit(1);
  }
} else {
  console.log(`\x1b[33mSkipping verification builds (--skip-build specified).\x1b[0m\n`);
}

if (shouldPush) {
  console.log(`\x1b[33mExecuting Git commit, tag, and push...\x1b[0m`);
  execSync('git add .', { cwd: ROOT_DIR, stdio: 'inherit' });
  const commitMsg = `release: ${newTag} (versionCode ${versionCode})`;
  execSync(`git commit -m "${commitMsg}"`, { cwd: ROOT_DIR, stdio: 'inherit' });
  execSync(`git tag ${newTag}`, { cwd: ROOT_DIR, stdio: 'inherit' });
  execSync('git push origin main', { cwd: ROOT_DIR, stdio: 'inherit' });
  execSync(`git push origin ${newTag}`, { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log(`\n\x1b[1;32m🎉 Successfully released and pushed ${newTag} to origin!\x1b[0m\n`);
} else {
  console.log(`\x1b[1;32m✓ All files updated successfully to ${newTag}.\x1b[0m`);
  console.log(`\nNext steps to commit and push:\n`);
  console.log(`  git add .`);
  console.log(`  git commit -m "release: ${newTag} (versionCode ${versionCode})"`);
  console.log(`  git tag ${newTag}`);
  console.log(`  git push origin main`);
  console.log(`  git push origin ${newTag}`);
  console.log(`\n(Or run with --push next time to automate this step)\n`);
}
