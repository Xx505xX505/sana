# SANA IDE

SANA IDE is a Windows-focused distribution built on the official Microsoft Visual Studio Code (Code - OSS) source.

## Project rules

- The editor engine is the official `microsoft/vscode` repository, pinned to an explicit commit for every release.
- SANA branding (icons, product metadata, themes and assets) lives in this repository and is applied by reproducible build scripts.
- Do not commit the full VS Code source tree, compiled application directories, dependency caches, license secrets, signing private keys, or user data.
- Copilot, AI Agents and their dedicated sign-in/onboarding surfaces are excluded from the SANA distribution. Shared platform authentication, networking and policy infrastructure must not be removed blindly.
- SANA License is the product licensing authority. The IDE client must use the documented, versioned license API contract and fail safely when license validation cannot be established.
- Automatic updates are a release requirement, not an optional enhancement.

## Repository layout

```text
assets/                 SANA branding assets
branding/               Product branding metadata
build/                  Reproducible Code - OSS build and customization scripts
docs/                   Architecture, licensing, updates and release procedures
updates/                Update manifest schema and public verification material
.github/workflows/      CI and Windows build/release workflows
```

## Engine source

The engine source is maintained upstream at https://github.com/microsoft/vscode. Each SANA release must record the exact upstream commit and version in its release metadata.

## Updates

SANA releases are published as GitHub Releases in this repository. The IDE checks the stable release feed, validates a signed update manifest and the downloaded package digest, then stages the update for restart. An update must never bypass SANA License validation.

## Security

Never commit signing private keys, MongoDB connection strings, administrator API keys, license signing secrets, access tokens, or personal information. Store build and release secrets in GitHub Actions Secrets.
