import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createScript = path.join(root, 'updates/create-manifest.mjs');
const verifyScript = path.join(root, 'updates/verify-update.mjs');

function run(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    ...options
  });
}

test('signed update manifest verifies against the exact package bytes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sana-update-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const asset = path.join(dir, 'SANA-test.zip');
  const publicKeyPath = path.join(dir, 'update-public.pem');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(asset, Buffer.from('SANA update fixture\n'));
  fs.writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));

  const created = run(createScript, [asset, '1.2.3', 'stable', 'x64'], {
    cwd: dir,
    env: { ...process.env, SANA_UPDATE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }) }
  });
  assert.equal(created.status, 0, created.stderr || created.stdout);

  const verified = run(verifyScript, [
    path.join(dir, 'update-manifest.json'),
    path.join(dir, 'update-manifest.sig'),
    publicKeyPath,
    asset
  ]);
  assert.equal(verified.status, 0, verified.stderr || verified.stdout);
  assert.match(verified.stdout, /verified/i);
});

test('update verifier rejects a package modified after signing', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sana-update-tamper-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const asset = path.join(dir, 'SANA-test.zip');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPath = path.join(dir, 'update-public.pem');
  fs.writeFileSync(asset, 'original package');
  fs.writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));

  const created = run(createScript, [asset, '1.2.3', 'stable', 'x64'], {
    cwd: dir,
    env: { ...process.env, SANA_UPDATE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }) }
  });
  assert.equal(created.status, 0, created.stderr || created.stdout);

  fs.writeFileSync(asset, 'modified package');
  const verified = run(verifyScript, [
    path.join(dir, 'update-manifest.json'),
    path.join(dir, 'update-manifest.sig'),
    publicKeyPath,
    asset
  ]);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /size mismatch|SHA-256 mismatch/i);
});
