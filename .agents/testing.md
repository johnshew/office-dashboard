# Testing and acceptance

Use the existing runners; do not add a parallel testing toolchain.

| Change | Smallest applicable validation |
| --- | --- |
| Browser identity | `node --test test\browser-identity.test.js` |
| Optional Node service | `node --test test\device-server.test.js` |
| Phone Link service and identity | `node --test test\pairing-worker.test.js test\phone-identity.test.js` |
| Worker bundle/runtime imports | `npm run build:worker` (dry-run, no deployment) |
| Release configuration | `node --test test\release-config.test.js` |
| TypeScript, React or build compatibility | `npm run build` |
| Dashboard interaction and phone UI | `npm run test:browser` |
| Documentation only | Review commands, relative links and status claims; `git diff --check` |

`npm test` runs all existing Node tests. New tests for a Worker or shared helper
should use the same Node runner and synthetic fixtures. Select related test files
in a single invocation; run the full suite when a shared boundary warrants it.
Install dependencies only after an intentional manifest change or a missing-tool
failure, following [setup](setup.md).

Browser tests use Playwright with mocked Microsoft/service responses and two
Chromium projects (desktop and mobile). Install the browser with
`npx playwright install chromium` only when needed. CI installs its Linux system
dependencies too. The Playwright configuration builds and starts its own preview
server; do not reuse an unrelated service or terminate processes by name.

Pairing coverage must include wrong state/capability, replay, cancellation,
expiry, denial, duplicate approval, capacity, backend failures and account/session
substitution. Validate the absence of token leakage and allowlist bypasses.
Include renewal/logout and auth-mode switching where the implementation supports them.

Mocked Chromium coverage does not establish Microsoft account acceptance, phone
passkey availability, Cloudflare deployment, or Chromium 88/Tesla compatibility.
Record the actual phone software/account audience and parked-car model, hardware,
firmware and browser user agent for live acceptance. Keep private mailbox content
and credentials out of traces, screenshots and logs.
