# SANA IDE architecture

## Non-negotiable engine choice

SANA is a branded distribution of the official Microsoft Code - OSS / VS Code source. It is not a Tauri, React, Monaco-only, or independently implemented editor. Upstream engine source: https://github.com/microsoft/vscode.

Every build pins:
- Upstream repository: `https://github.com/microsoft/vscode`
- Exact upstream commit SHA (required; never build from floating `main`)
- Upstream product version
- SANA customization commit

## Separation of concerns

- Upstream engine: cloned at build time into a temporary workspace.
- SANA customizations: this repository's `branding/`, `assets/`, and `build/`.
- License platform: documented API contract and client integration; secrets remain in protected infrastructure.
- Release/update service: GitHub Releases for public update artifacts and signed metadata.

## Removal policy

Remove Copilot/AI Agents-specific product features, extension packaging, dedicated onboarding/sign-in flows, and their direct registrations. Do not delete shared authentication, networking, policy, IPC, or account infrastructure without dependency analysis and tests.

## Reproducibility and provenance

Each release must publish an SBOM or dependency inventory, upstream commit SHA, build workflow run, package SHA-256, and signed update metadata.
