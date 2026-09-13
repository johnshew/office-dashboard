---
title: Validation and Acceptance
description: Use when choosing tests, diagnosing validation failures or describing build, browser and production acceptance.
---

## Choose the smallest useful check

| Change | Start with |
| --- | --- |
| MSAL, account selection or Graph transport | `node --test test/browser-identity.test.js` |
| Optional device-service contract | `node --test test/device-server.test.js` |
| Public release configuration validation | `node --test test/release-config.test.js` |
| Reader, navigation, layout or image isolation | Focused tests in [dashboard.spec.js](../test/browser/dashboard.spec.js), both projects |
| TypeScript or component API | `npm run build` |
| Documentation or instructions only | Relative links, headings, frontmatter, paths and command accuracy |

Use existing `node:test`, `node:assert/strict` and `t.mock` helpers. Identity tests
load TypeScript through Vite. Extend neighboring tests rather than introducing
another framework or duplicate fixtures. A missing runner dependency is not a
failing assertion about application behavior.

## Release validation

Use Node 24 and the committed lockfile. Run these from the repository root:

```powershell
npm ci
npm test
npm audit --audit-level=high
npx playwright install chromium
npm run test:browser
npm run validate-release-config
npm run build
```

The final two commands require the approved production public configuration for a
release. Never substitute dummy IDs to make a release gate green. No secrets belong
in `VITE_` values. CI installs Chromium with operating-system dependencies on Linux.

[Playwright](../playwright.config.js) tests desktop and mobile Chromium, serving a
mock-configured build on port 8002 under `/office-dashboard/`. Do not run another
build or browser suite concurrently against the same `dist/` or port. That build
is intentionally not suitable for production authentication. Rebuild with real
public configuration before previewing live sign-in or publishing any artifact.

If the managed browser cannot be installed, an already-installed compatible browser
may provide additional local evidence through a temporary configuration. Report the
browser used, remove the override afterward and retain the required CI Chromium
gate. Do not relabel skipped tests as passes or bypass a denied download.

## Evidence boundaries

* Unit tests verify local logic and mocked MSAL/Graph contracts.
* Browser tests verify synthetic interactions, layout and browser enforcement in
  the tested engine. Device-code mocks do not establish a deployed QR service.
* A typecheck/build proves compilation and bundling, not valid registration,
  supported accounts, consent, login, logout or production token renewal.
* Successful CI and Pages deployment prove completed jobs and artifact publication.
  Live HTTPS `release.json` must also match the intended version and commit.
* Real acceptance requires user-authorized Microsoft sign-in and read-only mailbox
  checks. Include account choice, Inbox, calendar, refresh/reload, logout and renewal.
  Target phone/vehicle testing is separate from a mobile viewport simulation.

For UI work, inspect synthetic desktop/mobile screenshots, overflow, scroll bounds,
focus restoration and long content. For authentication/content changes, cover stale
responses, cancellation, untrusted URLs, hostile HTML and image-consent resets.

Do not put private mailbox data, tokens, codes from real sessions or account details
in traces/screenshots. Synthetic failure artifacts are ignored by Git. The manual
historical `test*.html` fixtures are not the automated acceptance suite.

State what ran, what passed, what failed and what was not tested. Diagnose a failed
check before retrying it; never use successful unrelated tests to conceal a failure.