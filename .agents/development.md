---
title: TypeScript and React Development
description: Use for application code, layout, dependencies and local tooling changes in Office Dashboard.
---

## Architecture and ownership

| Surface | Owner |
| --- | --- |
| HTML shell and navigation elements | [index.html](../index.html) |
| App state, authentication actions and Graph query selection | [App.tsx](../samples/tesla/App.tsx) |
| MSAL, browser token acquisition and Graph transport | [Identity.ts](../samples/tesla/Identity.ts) |
| Mail/calendar presentation | [src](../src) |
| Untrusted HTML and content policy | [ItemViewHtmlBody.tsx](../src/ItemViewHtmlBody.tsx) |
| Mail layout and responsive reader | [dashboard.css](../samples/tesla/dashboard.css) |
| Legacy optional device-code service, not deployed | [server.js](../server.js) |

Keep Graph acquisition out of presentation components. Use the existing identity
boundary, Graph TypeScript definitions and native `fetch`; do not reintroduce a
legacy authentication wrapper or add an SDK for endpoints already handled here.

## TypeScript and React

* Follow the touched file's four-space TypeScript indentation and naming patterns.
  Most components are classes; do not convert them wholesale to hooks as incidental
  cleanup. New designs should fit existing ownership and lifecycle boundaries.
* The [compiler configuration](../tsconfig.json) uses ES2022, ES modules, bundler
  resolution and `react-jsx`; `strict` is currently false. Add explicit types and
  narrow `unknown` at new boundaries. Do not claim strict checking or enable it
  project-wide without a separately scoped migration.
* Use functional `setState` when updates depend on previous state. Preserve mounted,
  generation and attempt guards so late async responses cannot restore stale data
  after logout, cancellation, refresh or a newer selection.
* Preserve bounded pagination, timeout and retry behavior. Do not add unbounded
  polling, automatic authentication redirects or background request storms.
* Reuse [shared display utilities](../src/Utilities.ts) and
  [sample utilities](../samples/tesla/Utilities.ts) before introducing abstractions.
  Settings may use local storage; authentication tokens and image consent must not.

## Interface changes

Use the existing Bootstrap 5 controls and CSS conventions. Preserve keyboard
selection, focus restoration, touch targets, visible loading/error states and
mobile list/detail navigation. Mail list and body scroll independently; the
Settings scrolling option belongs to Calendar. Check long subjects, addresses,
tables and inline images at desktop and mobile sizes. Never weaken the iframe
sandbox to resize or restyle message content from the parent page.

## Dependencies and tooling

Use Node 24 to match CI and npm with the committed lockfile. On Windows, prefer
nvm-windows installed through WinGet when Node version management is needed;
check the installed version before proposing another installation.

Use `npm ci` for a reproducible checkout. For requested dependency updates, verify
that versions exist, preserve exact pins in [package.json](../package.json), and
update [package-lock.json](../package-lock.json) through npm. Keep React/React DOM
and their type packages compatible. Separate unrelated upgrades from bug fixes.

Run `npm audit --json` and `npm outdated --json` for freshness/security questions.
An outdated result can exit 1 without a broken install. Distinguish published
patches, newer minor/major versions and actual advisories. A zero-advisory result
is time-bound evidence, not a guarantee. Include transitive and build dependencies.

Use the environment's approved registry with TLS validation enabled. Missing cache
entries, missing browser executables, permission denials and dependency conflicts
are different failures. Do not clear a shared cache, change registry configuration
or delete the lockfile as a generic repair. Obtain approval for destructive cleanup.

Use the [testing guide](testing.md) for verification and report any install-induced
lockfile changes. Do not commit generated output or temporary local test overrides.