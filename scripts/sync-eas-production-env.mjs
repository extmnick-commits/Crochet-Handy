/**
 * Push selected .env keys to EAS "production" environment.
 * Usage: node scripts/sync-eas-production-env.mjs
 * Requires: eas-cli logged in (`npx eas-cli login`).
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');

const KEYS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_YOUTUBE_API_KEY',
  'YOUTUBE_API_KEY',
];

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    map.set(key, value);
  }
  return map;
}

const env = parseEnv(readFileSync(envPath, 'utf8'));
const missing = KEYS.filter((key) => !env.get(key)?.length);
if (missing.length) {
  console.error('Missing or empty in .env:', missing.join(', '));
  process.exit(1);
}

for (const name of KEYS) {
  const value = env.get(name);
  const visibility = name.startsWith('EXPO_PUBLIC_') ? 'plaintext' : 'secret';
  console.log(`Syncing ${name} (${visibility})…`);
  const result = spawnSync(
    'npx',
    [
      'eas-cli@latest',
      'env:create',
      '--name',
      name,
      '--value',
      value,
      '--environment',
      'production',
      '--visibility',
      visibility,
      '--force',
      '--non-interactive',
    ],
    { cwd: root, stdio: 'inherit', shell: true },
  );
  if (result.status !== 0) {
    console.error(`Failed to set ${name}`);
    process.exit(result.status ?? 1);
  }
}

console.log('EAS production environment variables synced.');
