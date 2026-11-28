import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  createDeviceIdHash,
  SanaLicenseClient,
  SanaLicenseError,
  validateActivationToken
} from '../license/client.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
const deviceId = 'a'.repeat(64);
const deviceHash = createDeviceIdHash(deviceId);
const now = 1_800_000_000_000;

function token(overrides = {}, key = privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: 'sana-license-service',
    aud: 'sana',
    product: 'SANA',
    v: 1,
    sub: 'license-test-id',
    dh: deviceHash,
    iat: Math.floor(now / 1000) - 10,
    exp: Math.floor(now / 1000) + 3600,
    ...overrides
  })).toString('base64url');
  const input = `${header}.${claims}`;
  return `${input}.${sign(null, Buffer.from(input), key).toString('base64url')}`;
}

function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    get: async key => values.get(key),
    set: async (key, value) => values.set(key, value),
    delete: async key => values.delete(key),
    values
  };
}

test('valid EdDSA activation token is accepted and expiry is returned', () => {
  const result = validateActivationToken(token(), { publicKey: publicPem, deviceIdHash: deviceHash, now });
  assert.equal(result.subject, 'license-test-id');
  assert.equal(result.expiresAt, now + 3_600_000);
});

test('rejects a token signed by an untrusted key', () => {
  const other = generateKeyPairSync('ed25519');
  assert.throws(() => validateActivationToken(token({}, other.privateKey), {
    publicKey: publicPem, deviceIdHash: deviceHash, now
  }), error => error.code === 'INVALID_SIGNATURE');
});

test('rejects altered payloads', () => {
  const valid = token().split('.');
  const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(valid[1], 'base64url')), product: 'OTHER' })).toString('base64url');
  assert.throws(() => validateActivationToken(`${valid[0]}.${altered}.${valid[2]}`, {
    publicKey: publicPem, deviceIdHash: deviceHash, now
  }), error => error.code === 'INVALID_SIGNATURE');
});

for (const [label, claim, value] of [
  ['issuer', 'iss', 'other'],
  ['audience', 'aud', 'other'],
  ['product', 'product', 'OTHER'],
  ['version', 'v', 2]
]) {
  test(`rejects wrong ${label}`, () => {
    assert.throws(() => validateActivationToken(token({ [claim]: value }), {
      publicKey: publicPem, deviceIdHash: deviceHash, now
    }), error => error.code === 'INVALID_CLAIMS');
  });
}

test('rejects expired tokens', () => {
  assert.throws(() => validateActivationToken(token({ exp: Math.floor(now / 1000) - 1 }), {
    publicKey: publicPem, deviceIdHash: deviceHash, now
  }), error => error.code === 'TOKEN_EXPIRED');
});

test('rejects device mismatch', () => {
  assert.throws(() => validateActivationToken(token(), {
    publicKey: publicPem, deviceIdHash: 'b'.repeat(64), now
  }), error => error.code === 'DEVICE_MISMATCH');
});

test('rejects algorithm substitution', () => {
  const parts = token().split('.');
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  assert.throws(() => validateActivationToken(`${header}.${parts[1]}.${parts[2]}`, {
    publicKey: publicPem, deviceIdHash: deviceHash, now
  }), error => error.code === 'UNSUPPORTED_ALGORITHM');
});

test('creates and persists a stable random device identifier', async () => {
  const secureStorage = storage();
  const client = new SanaLicenseClient({
    apiBaseUrl: 'https://license.example.test',
    publicKey: publicPem,
    secureStorage,
    now: () => now,
    fetchImpl: async () => { throw new Error('unexpected network request'); }
  });
  const first = await client.getDeviceId();
  const second = await client.getDeviceId();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
});

test('activation stores only a locally verified token', async () => {
  const secureStorage = storage({ 'sana.license.device-id': deviceId });
  let request;
  const client = new SanaLicenseClient({
    apiBaseUrl: 'https://license.example.test/',
    publicKey: publicPem,
    secureStorage,
    now: () => now,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ activationToken: token(), tokenExpiresAt: '2030-01-01T00:00:00.000Z' }) };
    }
  });
  const result = await client.activate('  SANA-TEST-KEY  ');
  assert.equal(result.activated, true);
  assert.equal(request.url, 'https://license.example.test/v1/licenses/activate');
  assert.equal(JSON.parse(request.options.body).deviceId, deviceHash);
  assert.equal(secureStorage.values.get('sana.license.activation-token'), token());
});

test('online verification checks server status after local signature validation', async () => {
  const secureStorage = storage({
    'sana.license.device-id': deviceId,
    'sana.license.activation-token': token()
  });
  let requested = false;
  const client = new SanaLicenseClient({
    apiBaseUrl: 'https://license.example.test',
    publicKey: publicPem,
    secureStorage,
    now: () => now,
    fetchImpl: async (url, options) => {
      requested = true;
      assert.equal(url.endsWith('/v1/licenses/verify'), true);
      assert.equal(JSON.parse(options.body).activationToken, token());
      return { ok: true, json: async () => ({ ok: true, expiresAt: new Date(now + 3_600_000).toISOString() }) };
    }
  });
  const result = await client.verifyOnline();
  assert.equal(requested, true);
  assert.equal(result.valid, true);
});

test('server revocation is not accepted as a valid license', async () => {
  const secureStorage = storage({
    'sana.license.device-id': deviceId,
    'sana.license.activation-token': token()
  });
  const client = new SanaLicenseClient({
    apiBaseUrl: 'https://license.example.test',
    publicKey: publicPem,
    secureStorage,
    now: () => now,
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: 'revoked' }) })
  });
  await assert.rejects(client.verifyOnline(), error => error.code === 'LICENSE_REJECTED');
});

test('offline entitlement accepts a valid unexpired signed token only', async () => {
  const secureStorage = storage({
    'sana.license.device-id': deviceId,
    'sana.license.activation-token': token()
  });
  const client = new SanaLicenseClient({
    apiBaseUrl: 'https://license.example.test',
    publicKey: publicPem,
    secureStorage,
    now: () => now
  });
  assert.equal((await client.getOfflineEntitlement()).valid, true);
  await secureStorage.set('sana.license.activation-token', token({ exp: Math.floor(now / 1000) - 1 }));
  assert.deepEqual(await client.getOfflineEntitlement(), { valid: false, reason: 'TOKEN_EXPIRED' });
});

test('deactivation deletes the activation token', async () => {
  const secureStorage = storage({ 'sana.license.activation-token': token() });
  const client = new SanaLicenseClient({
    apiBaseUrl: 'https://license.example.test',
    publicKey: publicPem,
    secureStorage
  });
  await client.deactivate();
  assert.equal(secureStorage.values.has('sana.license.activation-token'), false);
});

test('rejects insecure API URLs and invalid secure storage adapters', () => {
  assert.throws(() => new SanaLicenseClient({
    apiBaseUrl: 'http://license.example.test', publicKey: publicPem, secureStorage: storage()
  }), error => error.code === 'INVALID_CONFIGURATION');
  assert.throws(() => new SanaLicenseClient({
    apiBaseUrl: 'https://license.example.test', publicKey: publicPem, secureStorage: {}
  }), error => error.code === 'INVALID_CONFIGURATION');
});

test('does not include supplied license keys in validation errors', async () => {
  const secretLikeKey = 'SANA-PRIVATE-TEST-KEY';
  const client = new SanaLicenseClient({
    apiBaseUrl: 'https://license.example.test',
    publicKey: publicPem,
    secureStorage: storage(),
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: 'denied' }) })
  });
  await assert.rejects(client.activate(secretLikeKey), error => !error.message.includes(secretLikeKey));
});

test('validates device identifier input before hashing', () => {
  assert.throws(() => createDeviceIdHash('not-a-device-id'), error => error instanceof SanaLicenseError);
});
