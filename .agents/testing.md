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
| Documentation only | Review commands, relative links and status claims; `git diff --check` |

`npm test` runs all existing Node tests. New tests for a Worker or shared helper
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
