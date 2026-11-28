# SANA License Client Integration Contract

Status: implementation specification; this file does not claim that the VS Code desktop client is integrated.

## Authority and trust boundaries

- The license API is the authority for activation, revocation, and device binding.
- The desktop application must embed only the Ed25519 public activation key. The private signing key and administrator API key must never enter the desktop repository, build environment, installer, or client.
- The API base URL is configuration, not a secret.
- The desktop client must not treat an HTTP response, local preference, or editable file as proof of entitlement.
- The seven-day activation token is an offline cache only. Online verification must be attempted when connectivity is available; expiry or an explicit revocation response must gate licensed features according to product policy.

## Existing service contract

The existing service implementation is in the separate `sana-v2` repository. Its documented endpoints are:

| Operation | Request | Successful response |
|---|---|---|
| Fetch verification key | `GET /v1/keys/activation` | `{ algorithm: "EdDSA", publicKey: PEM }` |
| Activate | `POST /v1/licenses/activate` with `licenseKey` and 64-character lowercase hex `deviceId` | `activationToken`, `activatedAt`, `tokenExpiresAt` |
| Verify online | `POST /v1/licenses/verify` with `activationToken` and `deviceId` | `{ ok: true, expiresAt }` |

Activation tokens are EdDSA JWTs. Required claims include `iss=sana-license-service`, `aud=sana`, `product=SANA`, `v=1`, `sub` (license ObjectId), `dh` (SHA-256 device binding), `iat`, and `exp`.

## Required desktop implementation

1. Add a dedicated SANA License workbench contribution and an application-scoped license service. Do not reuse GitHub authentication or Microsoft account sign-in.
2. Generate a stable random device identifier once, store it using the platform secure-storage facility, and send only its SHA-256 hex digest as `deviceId`. Never use raw hardware serials or personally identifying machine attributes.
3. Provide explicit Activate, Verify, and Deactivate/Sign out UI states. Never log the license key or activation token.
4. Verify the JWT signature locally using the pinned Ed25519 public key and validate all required claims, token expiry, product, audience, issuer, version, and device hash. Reject algorithm substitution and malformed/oversized tokens.
5. Persist the activation token using the platform secure-storage facility (Windows DPAPI-backed safe storage where available); do not describe this as hardware-backed protection.
6. Online verification must also check the server's current license status. A revoked, transferred, expired, or device-mismatched license must not be accepted.
7. Do not silently grant entitlement when the service is unreachable. Apply the explicit offline policy: a previously verified, correctly signed token may remain usable only until its signed expiry; after expiry, require online verification.
8. Keep the editor usable for opening files and exporting user data when unlicensed. Gate only SANA-distributed licensed capabilities, and provide a clear activation screen.
9. Add tests for valid activation, invalid signature, altered payload, expired token, wrong product/audience/issuer/version, device mismatch, revoked license, server unavailable, corrupted secure storage, and secret-free logging.

## Release gates

- The end-user client implementation and automated tests must exist in the VS Code source patch.
- The pinned public key must match the live service key; verify this through a controlled CI secret/public configuration, never by committing the private key.
- Test activation and revocation against a staging API and transaction-capable test database.
- Confirm the production API and Atlas deployment are operational before claiming end-to-end integration.
- Do not create paid hosting or database resources without explicit approval.

Until those gates pass, SANA License is **not integrated into the IDE**, even if the separate API is available.
