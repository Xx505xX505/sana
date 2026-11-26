import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const [manifestFile, signatureFile, publicKeyFile, assetFile] = process.argv.slice(2);
if (!manifestFile || !signatureFile || !publicKeyFile || !assetFile) {
  console.error('Usage: node verify-update.mjs <manifest.json> <manifest.sig> <public-key.pem> <asset-file>');
  process.exit(2);
}

try {
  const rawManifest = fs.readFileSync(manifestFile);
  const manifest = JSON.parse(rawManifest.toString('utf8'));
  const signature = fs.readFileSync(signatureFile);
  const publicKey = fs.readFileSync(publicKeyFile, 'utf8');

  if (manifest.schemaVersion !== 1 || manifest.product !== 'SANA') throw new Error('Unsupported update manifest.');
  if (!['stable', 'preview'].includes(manifest.channel)) throw new Error('Invalid update channel.');
  if (manifest.platform !== 'windows' || !['x64', 'arm64'].includes(manifest.architecture)) throw new Error('Unsupported update target.');
  if (!manifest.asset || !/^[a-f0-9]{64}$/i.test(manifest.asset.sha256)) throw new Error('Invalid asset digest.');

  const key = crypto.createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Update verification key must be Ed25519.');
  if (!crypto.verify(null, rawManifest, key, signature)) throw new Error('Manifest signature verification failed.');

  const assetPath = path.resolve(assetFile);
  const stat = fs.statSync(assetPath);
  if (stat.size !== manifest.asset.sizeBytes) throw new Error('Downloaded asset size mismatch.');
  const digest = crypto.createHash('sha256').update(fs.readFileSync(assetPath)).digest('hex');
  if (digest.toLowerCase() !== manifest.asset.sha256.toLowerCase()) throw new Error('Downloaded asset SHA-256 mismatch.');

  console.log('SANA update manifest signature and package digest verified.');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
