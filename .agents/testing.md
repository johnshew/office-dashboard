# Testing and acceptance

Use the existing runners; do not add a parallel testing toolchain.

| Change | Smallest applicable validation |
| --- | --- |
| Browser identity | `node --test test\browser-identity.test.js` |
| Optional Node service | `node --test test\device-server.test.js` |
| Phone Link service and identity | `node --test test\pairing-worker.test.js test\phone-identity.test.js` |
| Worker bundle/runtime imports | `npm run build:worker` (dry-run, no deployment) |
| Worker outbound-fetch/runtime behavior | `node --test test\pairing-runtime.test.js` (installed Wrangler's Miniflare/workerd; synthetic D1/provider) |
| Release configuration and artifact promotion | `node --test test\release-config.test.js test\site-release.test.js` |
| Worker release configuration and safeguards | `node --test test\worker-release.test.js` |
| TypeScript, React or build compatibility | `npm run build` |
| Dashboard interaction and phone UI | `npm run test:browser` |
| Mainstream browser golden thread used by CI | `npm run test:browser:golden` |
| Real local Worker/D1 boundary | `npm run test:worker:runtime` |
| Final site artifact | `npm run stamp:site`, then `npm run test:artifact` on the existing `dist/` |
| Documentation only | Review commands, relative links and status claims; `git diff --check` |

`npm test` runs the portable Node tests in `test/`; the local workerd suite runs
separately with `npm run test:worker:runtime`. New tests for a Worker or shared helper
should use the same Node runner and synthetic fixtures. Select related test files
in a single invocation; run the full suite when a shared boundary warrants it.
The Worker runtime regression uses the Miniflare/workerd already installed by
locked Wrangler, not a second toolchain or a real Microsoft account. Keep the
runtime/API compatibility check when changing that pinned dependency.
Install dependencies only after an intentional manifest change or a missing-tool
failure, following [setup](setup.md).

Browser tests use Playwright with mocked Microsoft/service responses and two
Chromium projects (desktop and mobile). Install the browser with
`npx playwright install chromium` only when needed. CI installs its Linux system
dependencies too. The Playwright configuration builds and starts its own preview
server; do not reuse an unrelated service or terminate processes by name.

CI's Playwright scope is the mainstream golden thread only: personal-account
routing, the actual native phone approval form, then dashboard sign-in, Inbox
message reading, mail/calendar refresh, navigation and logout on desktop/mobile.
It uses `PLAYWRIGHT_LOGIN_OPTIONS=browser,phone`; set that environment variable
before the golden command to reproduce CI locally. No elapsed-time thresholds,
virtual-clock expiry scenarios or separate login-option build matrix run in
browser CI. Broader existing UI tests remain available through `test:browser`;
expiry, replay, capability, renewal and other security boundaries stay covered
by Node/workerd checks rather than timing-sensitive browser tests.

Pairing coverage must include wrong state/capability, replay, cancellation,
expiry, denial, duplicate approval, capacity, backend failures and account/session
substitution. Validate the absence of token leakage and allowlist bypasses.
Include renewal/logout and auth-mode switching where the implementation supports them.

Mocked Chromium coverage does not establish Microsoft account acceptance, phone
passkey availability, Cloudflare deployment, or Chromium 88/Tesla compatibility.
Record the actual phone software/account audience and parked-car model, hardware,
firmware and browser user agent for live acceptance. Keep private mailbox content
and credentials out of traces, screenshots and logs.

## Behavioral coverage

Preserve decisions through refactors, not private function signatures. Deleting
a test requires identifying replacement coverage or an intentionally removed
behavior. Do not make green tests by deleting failing behavioral assertions.
Code and regression tests may change together when the behavioral contract is
clear; an artificial separate-commit rule is not required.

Demonstrate that a regression fails without its fix when safely feasible, using
a synthetic fixture or a task-owned mutation that is restored afterward. Never
discard unrelated edits to reproduce an old version. If reproduction is blocked,
record that limit instead of claiming a demonstrated regression.

At translation boundaries, assert observable decisions and side effects as well
as response shapes: allowed actions, cancellation, persistence, expiry and
credential isolation. Keep stubs deliberate; a mock of the decision under test
does not prove the real decision.

## Artifact and runtime boundaries

Playwright's interaction suite rebuilds with synthetic identity/service settings.
It does not test the subsequent production-configured build. CI therefore builds
again with its public configuration, stamps `release.json`, and runs the separate
artifact smoke against that exact `dist/` without rebuilding. The smoke blocks
external requests, performs no sign-in and checks startup/assets, base-path
loading, provenance and enabled/disabled sign-in buttons. Do not mutate `dist/`
between this check and packaging/deployment.

`npm run test:worker:runtime` executes the real Worker modules in local workerd
with Miniflare's D1 and rate-limit bindings, isolated temporary persistent storage
and denied external access. It checks creation, restart persistence,
wrong-credential rejection, cancellation/deletion and expiry. Miniflare is pinned
to Wrangler's existing runtime version, not a second Worker toolchain. It does
not prove cloud rate-limit behavior, Microsoft acceptance or production D1 state.

## Evidence and reuse

Record the exact command, result, source revision and dirty-source fingerprint
where applicable, dependency lock digest, tool/platform versions and relevant
public build configuration digest. Artifact evidence additionally identifies the
tested artifact digest. Use the session ledger for local evidence; CI retains
the artifact smoke's JSON report with its attached identity and the site archive
checksum. Neither a matching commit alone nor a report from the mocked build
establishes final-artifact acceptance.

Reuse passing local evidence only when the tested source, artifact, configuration,
environment and command remain unchanged. Edits during validation invalidate its
success claim. External service changes can require new checks even if a local
fingerprint is unchanged. Missing/failed evidence requires a fresh check;
handoffs alone do not. Required CI and real phone/vehicle acceptance remain
separate gates. Never hash or record credentials as evidence.
