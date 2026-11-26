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

fs.writeFileSync(productPath, JSON.stringify(product, null, '\t') + '\n', 'utf8');
console.log('Applied SANA product identity to official Code - OSS product.json.');
console.log('No upstream engine source files were replaced by this branding step.');
