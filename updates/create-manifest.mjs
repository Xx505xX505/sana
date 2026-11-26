import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [assetFile, version, channel = 'stable', architecture = 'x64'] = process.argv.slice(2);
if (!assetFile || !version) {
  console.error('Usage: node create-manifest.mjs <release-asset> <version> [stable|preview] [x64|arm64]');
  process.exit(2);
}
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid semantic version.');
if (!['stable', 'preview'].includes(channel)) throw new Error('Invalid release channel.');
if (!['x64', 'arm64'].includes(architecture)) throw new Error('Invalid architecture.');

const privateKeyPem = process.env.SANA_UPDATE_PRIVATE_KEY;
if (!privateKeyPem) throw new Error('SANA_UPDATE_PRIVATE_KEY is required; never store it in the repository.');
const assetPath = path.resolve(assetFile);
const bytes = fs.readFileSync(assetPath);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const tag = `v${version}`;
const manifest = {
  schemaVersion: 1,
  product: 'SANA',
  channel,
  version,
  platform: 'windows',
  architecture,
  publishedAt: new Date().toISOString(),
  minimumUpdaterVersion: '1.0.0',
  releaseNotes: `https://github.com/Xx505xX505/sana/releases/tag/${tag}`,
  asset: {
    name: path.basename(assetPath),
    url: `https://github.com/Xx505xX505/sana/releases/download/${tag}/${path.basename(assetPath)}`,
    sizeBytes: bytes.length,
    sha256
  }
};
const raw = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
const key = crypto.createPrivateKey(privateKeyPem);
if (key.asymmetricKeyType !== 'ed25519') throw new Error('SANA update signing key must be Ed25519.');
const signature = crypto.sign(null, raw, key);
fs.writeFileSync('update-manifest.json', raw);
fs.writeFileSync('update-manifest.sig', signature);
console.log(`Created signed manifest for SANA ${version} (${channel}/${architecture}).`);
