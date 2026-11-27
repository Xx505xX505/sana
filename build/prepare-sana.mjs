import fs from 'node:fs';
import path from 'node:path';

const root = process.env.VSCODE_SOURCE_DIR || path.resolve('upstream-vscode');
const productPath = path.join(root, 'product.json');
if (!fs.existsSync(productPath)) throw new Error('Official VS Code product.json was not found.');

const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
const overrides = {
  nameShort: 'SANA',
  nameLong: 'SANA IDE',
  applicationName: 'sana',
  dataFolderName: '.sana',
  win32AppUserModelId: 'SANA.IDE',
  win32MutexName: 'sana',
  win32DirName: 'SANA',
  win32NameVersion: 'SANA',
  win32RegValueName: 'SANA',
  win32ShellNameShort: 'SANA'
};

for (const [key, value] of Object.entries(overrides)) product[key] = value;

// Remove Microsoft Copilot defaults and trusted extension authentication grants.
// Keep the generic GitHub authentication provider available to unrelated extensions.
delete product.defaultChatAgent;
delete product.agentsTelemetryAppName;
delete product.trustedExtensionAuthAccess;
if (Array.isArray(product.builtInExtensionsEnabledWithAutoUpdates)) {
  product.builtInExtensionsEnabledWithAutoUpdates = product.builtInExtensionsEnabledWithAutoUpdates
    .filter(id => !/^github\\.copilot(?:-chat)?$/i.test(id));
  if (product.builtInExtensionsEnabledWithAutoUpdates.length === 0) {
    delete product.builtInExtensionsEnabledWithAutoUpdates;
  }
}

fs.writeFileSync(productPath, JSON.stringify(product, null, '\t') + '\n', 'utf8');
console.log('Applied SANA product identity to official Code - OSS product.json.');
console.log('Removed Copilot product defaults and trusted extension grants while preserving generic authentication.');
console.log('No upstream engine source files were replaced by this branding step.');
