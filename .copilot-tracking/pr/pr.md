---
title: "fix(tesla): request account selection for explicit login"
description: Pull request description for the static SPA account chooser patch release.
---

Explicit Microsoft Login now requests account selection instead of allowing an
existing Microsoft session to silently choose the account.

## Changes

* Added `prompt: 'select_account'` to explicit MSAL login requests.
* Added regression coverage for the request and device-session cleanup.
* Bumped package and lockfile versions to 0.3.1 without changing dependencies.
* Updated the README for MSAL/Graph and static hosting, removing stale library references.
* Added the shared agent guide, Claude adapter and focused development, security,
  testing and release guides referenced by the README.
* Documented the historical Intel MCU2/Chromium 88 development baseline, existing
    compatibility gaps, and the assumption that Tesla passkeys are unavailable.

Reload restoration, silent token renewal, read-only Graph scopes and static Pages
hosting were preserved. No backend or dashboard-owned device login was enabled.

## Validation

* [x] 36 Node tests passed locally.
* [x] 12 desktop/mobile browser cases passed locally using installed Edge.
* [x] TypeScript/Vite compilation passed and npm audit reported zero vulnerabilities.
* [x] Initial code-only candidate CI passed, including managed Chromium validation.
* [x] Seven documentation files passed frontmatter and relative-path checks.
* [x] Combined code and documentation CI passed at 9a2bd2a.
* [x] Final commit-range review found no introduced blockers at 69ad3db.
* [ ] Final README revision CI passed at 69ad3db.
* [ ] PR CI and required review are complete.
* [ ] Tag-only production validation and live version provenance are verified.
* [ ] The user confirmed Microsoft account choice on the deployed app.

## Related Issues

None.

## Notes

The README and its linked agent guides are included at the user's request.
Tesla passkeys and cross-device passkey QR are assumed unavailable. Chromium 88
compatibility is not claimed: build targeting and AbortSignal.timeout remain known
gaps. This release enables account selection, not a new device authentication flow.
Preserve the v0.3.0 tag.