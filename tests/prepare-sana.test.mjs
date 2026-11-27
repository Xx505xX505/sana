import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prepareScript = path.join(root, 'build', 'prepare-sana.mjs');

test('SANA product preparation removes Copilot defaults and preserves unrelated built-in extensions', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sana-product-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const fixture = {
    nameShort: 'Code - OSS',
    nameLong: 'Code - OSS',
    applicationName: 'code-oss',
    dataFolderName: '.vscode-oss',
    defaultChatAgent: { extensionId: 'GitHub.copilot', chatExtensionId: 'GitHub.copilot-chat' },
    agentsTelemetryAppName: 'agents',
    trustedExtensionAuthAccess: { github: ['GitHub.copilot-chat'] },
    builtInExtensionsEnabledWithAutoUpdates: [
      'GitHub.copilot',
      'GitHub.copilot-chat',
      'ms-vscode.js-debug'
    ]
  };
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify(fixture));

  const result = spawnSync(process.execPath, [prepareScript], {
    encoding: 'utf8',
    env: { ...process.env, VSCODE_SOURCE_DIR: dir }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const product = JSON.parse(fs.readFileSync(path.join(dir, 'product.json'), 'utf8'));
  assert.equal(product.nameShort, 'SANA');
  assert.equal(product.nameLong, 'SANA IDE');
  assert.equal(product.applicationName, 'sana');
  assert.equal(product.dataFolderName, '.sana');
  assert.equal('defaultChatAgent' in product, false);
  assert.equal('agentsTelemetryAppName' in product, false);
  assert.equal('trustedExtensionAuthAccess' in product, false);
  assert.deepEqual(product.builtInExtensionsEnabledWithAutoUpdates, ['ms-vscode.js-debug']);
});
