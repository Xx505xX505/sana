import {
  createHash,
  randomBytes,
  verify as verifySignature
} from 'node:crypto';

const STORAGE_KEY = 'sana.license.device-id';
const TOKEN_STORAGE_KEY = 'sana.license.activation-token';
const MAX_TOKEN_LENGTH = 8192;
const REQUIRED_CLAIMS = Object.freeze({
  iss: 'sana-license-service',
  aud: 'sana',
  product: 'SANA',
  v: 1
});

export class SanaLicenseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SanaLicenseError';
    this.code = code;
  }
}

function decodeBase64Url(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new SanaLicenseError('MALFORMED_TOKEN', `Invalid ${label} encoding.`);
  }
  return Buffer.from(value, 'base64url');
}

function parseToken(token) {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    throw new SanaLicenseError('MALFORMED_TOKEN', 'Activation token is missing or too large.');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new SanaLicenseError('MALFORMED_TOKEN', 'Activation token must be a compact JWT.');
  }

  let header;
  let claims;
  try {
    header = JSON.parse(decodeBase64Url(parts[0], 'header').toString('utf8'));
    claims = JSON.parse(decodeBase64Url(parts[1], 'payload').toString('utf8'));
  } catch (error) {
    if (error instanceof SanaLicenseError) throw error;
    throw new SanaLicenseError('MALFORMED_TOKEN', 'Activation token contains invalid JSON.');
  }

  if (!header || header.alg !== 'EdDSA' || (header.typ !== undefined && header.typ !== 'JWT')) {
    throw new SanaLicenseError('UNSUPPORTED_ALGORITHM', 'Only EdDSA JWT activation tokens are accepted.');
  }
  const signature = decodeBase64Url(parts[2], 'signature');
  if (signature.length !== 64) {
    throw new SanaLicenseError('INVALID_SIGNATURE', 'Activation token signature has an invalid length.');
  }
  return { header, claims, signature, signingInput: Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii') };
}

export function createDeviceIdHash(deviceId) {
  if (typeof deviceId !== 'string' || !/^[a-f0-9]{64}$/.test(deviceId)) {
    throw new SanaLicenseError('INVALID_DEVICE_ID', 'Device identifier must be 32 random bytes encoded as lowercase hex.');
  }
  return createHash('sha256').update(deviceId, 'utf8').digest('hex');
}

export function validateActivationToken(token, {
  publicKey,
  deviceIdHash,
  now = Date.now()
}) {
  if (!publicKey) throw new SanaLicenseError('MISSING_PUBLIC_KEY', 'Pinned SANA License public key is not configured.');
  if (!/^[a-f0-9]{64}$/.test(deviceIdHash || '')) {
    throw new SanaLicenseError('INVALID_DEVICE_ID', 'A valid device identifier hash is required.');
  }

  const parsed = parseToken(token);
  let signatureValid = false;
  try {
    signatureValid = verifySignature(null, parsed.signingInput, publicKey, parsed.signature);
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) throw new SanaLicenseError('INVALID_SIGNATURE', 'Activation token signature verification failed.');

  const { claims } = parsed;
  for (const [claim, expected] of Object.entries(REQUIRED_CLAIMS)) {
    if (claims[claim] !== expected) {
      throw new SanaLicenseError('INVALID_CLAIMS', `Activation token has an invalid ${claim} claim.`);
    }
  }
  if (typeof claims.sub !== 'string' || claims.sub.length === 0
    || typeof claims.dh !== 'string' || !/^[a-f0-9]{64}$/.test(claims.dh)
    || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
    || claims.exp <= claims.iat) {
    throw new SanaLicenseError('INVALID_CLAIMS', 'Activation token is missing required claims.');
  }
  if (claims.dh !== deviceIdHash) {
    throw new SanaLicenseError('DEVICE_MISMATCH', 'Activation token belongs to a different device.');
  }
  const nowSeconds = Math.floor(now / 1000);
  if (claims.iat > nowSeconds + 60) {
    throw new SanaLicenseError('INVALID_CLAIMS', 'Activation token issue time is in the future.');
  }
  if (claims.exp <= nowSeconds) {
    throw new SanaLicenseError('TOKEN_EXPIRED', 'Activation token has expired.');
  }
  return Object.freeze({ subject: claims.sub, expiresAt: claims.exp * 1000, claims });
}

async function readJsonResponse(response, operation) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new SanaLicenseError('INVALID_SERVER_RESPONSE', `License service returned invalid JSON during ${operation}.`);
  }
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? 'LICENSE_REJECTED' : 'SERVICE_ERROR';
    throw new SanaLicenseError(code, `License service rejected ${operation} (HTTP ${response.status}).`);
  }
  return body;
}

export class SanaLicenseClient {
  constructor({
    apiBaseUrl,
    publicKey,
    secureStorage,
    fetchImpl = globalThis.fetch,
    now = () => Date.now()
  }) {
    if (typeof apiBaseUrl !== 'string' || !/^https:\/\//.test(apiBaseUrl)) {
      throw new SanaLicenseError('INVALID_CONFIGURATION', 'License API URL must use HTTPS.');
    }
    if (!secureStorage || typeof secureStorage.get !== 'function'
      || typeof secureStorage.set !== 'function' || typeof secureStorage.delete !== 'function') {
      throw new SanaLicenseError('INVALID_CONFIGURATION', 'A platform secure-storage adapter is required.');
    }
    if (typeof fetchImpl !== 'function') {
      throw new SanaLicenseError('INVALID_CONFIGURATION', 'A fetch implementation is required.');
    }
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
    this.publicKey = publicKey;
    this.secureStorage = secureStorage;
    this.fetch = fetchImpl;
    this.now = now;
  }

  async getDeviceId() {
    let deviceId = await this.secureStorage.get(STORAGE_KEY);
    if (deviceId !== undefined && deviceId !== null) {
      if (typeof deviceId !== 'string' || !/^[a-f0-9]{64}$/.test(deviceId)) {
        throw new SanaLicenseError('CORRUPT_SECURE_STORAGE', 'Stored device identifier is invalid.');
      }
      return deviceId;
    }
    deviceId = randomBytes(32).toString('hex');
    await this.secureStorage.set(STORAGE_KEY, deviceId);
    return deviceId;
  }

  async activate(licenseKey) {
    if (typeof licenseKey !== 'string' || licenseKey.trim().length === 0 || licenseKey.length > 512) {
      throw new SanaLicenseError('INVALID_LICENSE_KEY', 'Enter a valid SANA license key.');
    }
    const deviceId = await this.getDeviceId();
    const response = await this.fetch(`${this.apiBaseUrl}/v1/licenses/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ licenseKey: licenseKey.trim(), deviceId: createDeviceIdHash(deviceId) })
    });
    const body = await readJsonResponse(response, 'activation');
    if (typeof body.activationToken !== 'string') {
      throw new SanaLicenseError('INVALID_SERVER_RESPONSE', 'Activation response did not contain a token.');
    }
    validateActivationToken(body.activationToken, {
      publicKey: this.publicKey,
      deviceIdHash: createDeviceIdHash(deviceId),
      now: this.now()
    });
    await this.secureStorage.set(TOKEN_STORAGE_KEY, body.activationToken);
    return { activated: true, tokenExpiresAt: body.tokenExpiresAt ?? null };
  }

  async verifyOnline() {
    const token = await this.secureStorage.get(TOKEN_STORAGE_KEY);
    if (!token) throw new SanaLicenseError('NOT_ACTIVATED', 'No SANA activation is stored.');
    const deviceId = await this.getDeviceId();
    const deviceIdHash = createDeviceIdHash(deviceId);
    const local = validateActivationToken(token, {
      publicKey: this.publicKey,
      deviceIdHash,
      now: this.now()
    });
    const response = await this.fetch(`${this.apiBaseUrl}/v1/licenses/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activationToken: token, deviceId: deviceIdHash })
    });
    const body = await readJsonResponse(response, 'verification');
    if (body.ok !== true || typeof body.expiresAt !== 'string') {
      throw new SanaLicenseError('LICENSE_REJECTED', 'License service did not confirm an active license.');
    }
    const serverExpiry = Date.parse(body.expiresAt);
    if (!Number.isFinite(serverExpiry) || serverExpiry > local.expiresAt + 60_000) {
      throw new SanaLicenseError('INVALID_SERVER_RESPONSE', 'License service returned an invalid expiry.');
    }
    return { valid: true, expiresAt: Math.min(local.expiresAt, serverExpiry) };
  }

  async getOfflineEntitlement() {
    const token = await this.secureStorage.get(TOKEN_STORAGE_KEY);
    if (!token) return { valid: false, reason: 'NOT_ACTIVATED' };
    try {
      const deviceId = await this.getDeviceId();
      const result = validateActivationToken(token, {
        publicKey: this.publicKey,
        deviceIdHash: createDeviceIdHash(deviceId),
        now: this.now()
      });
      return { valid: true, expiresAt: result.expiresAt, offline: true };
    } catch (error) {
      return { valid: false, reason: error.code || 'INVALID_TOKEN' };
    }
  }

  async deactivate() {
    await this.secureStorage.delete(TOKEN_STORAGE_KEY);
    return { deactivated: true };
  }
}
