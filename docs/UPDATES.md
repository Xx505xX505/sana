# SANA updates

GitHub Releases in `Xx505xX505/sana` are the public distribution channel.

## Client behavior

1. Query the latest stable release feed over HTTPS.
2. Ignore prereleases unless the user explicitly selects a preview channel.
3. Read the release's `update-manifest.json` and detached signature.
4. Verify the signature using a public verification key embedded in the application.
5. Confirm product, platform, architecture, version and minimum supported version.
6. Download the asset to a staging directory.
7. Verify its SHA-256 against the signed manifest.
8. Stage the update using the supported Windows updater/install mechanism; never overwrite a running executable.
9. Prompt for restart and apply the staged update.
10. On failure, preserve the current installation and report a useful error.

## Manifest contract (v1)

Required fields: `schemaVersion` (1), `product` (`SANA`), `channel` (`stable` or `preview`), semantic `version`, `platform` (`windows`), `architecture` (`x64` or `arm64`), ISO-8601 `publishedAt`, `minimumUpdaterVersion`, HTTPS `releaseNotes`, and an `asset` containing `name`, HTTPS `url`, `sizeBytes`, and `sha256`.

The manifest bytes are signed as-is. The detached signature must use a documented algorithm and a key dedicated to release signing. Keep the private key in GitHub Actions Secrets or an HSM; never commit it. Embed only the public key in the updater.

## GitHub feed

Stable latest release: `https://api.github.com/repos/Xx505xX505/sana/releases/latest`

Assets are downloaded from the matching release, not from an arbitrary URL supplied by an unsigned response. Rate limits and network failures must not corrupt the installed application.

## License interaction

An update does not grant a license or extend one. After update/restart, the application performs the normal SANA License validation flow. The updater must not contain license bypasses or license secrets.
