# Release Plan

## Current status

September 13, 2026, 10:26 PDT. This section supersedes the historical setup
checkpoints below. PRs #58 and #59 merged into the default branch, `gh-pages`.
[Version 0.3.0](https://github.com/johnshew/office-dashboard/releases/tag/v0.3.0)
was published at 10:25 PDT from `7b3d8a7a53059496e950cd1925d87033c8808ac0`.
The live HTTPS `release.json` matches that version and commit.

The first tagged run deployed successfully, but release publication failed because
Pages returned an HTTP URL and the verification response was not the JSON metadata.
PR #60 passed CI and merged an HTTPS-only verifier. A default-branch dispatch of
the unchanged `v0.3.0` tag then passed every job in
[run 34771421455](https://github.com/johnshew/office-dashboard/actions/runs/34771421455).
The release retains `office-dashboard.tar.gz` and `SHA256SUMS` for rollback.

- The saved SPA audience supports organizational and personal Microsoft accounts;
  GitHub and local sign-in use `VITE_TENANT_ID=common`. Client ID and owning directory
  are unchanged. The custom-domain HTTPS root was added as a third SPA callback,
  preserving localhost and github.io. The three delegated read scopes are unchanged.
  Implicit grants and public client flows are off; no secret or tenant-wide consent
  was added. Production Microsoft sign-in succeeded using the existing personal
  session. Inbox and calendar requests returned HTTP 200 with no app alert;
  refresh and reload preserved access. Logout reached Microsoft's signed-out
  confirmation; reopening the site showed the signed-out welcome screen.
  Automatic return from Microsoft's logout page was not observed.
- Mail now reads `/me/mailFolders/inbox/messages` with the existing attachment
  expansion and 40-message limit. The service permits this exact collection, not
  arbitrary folders. Inbox can still contain spam; no mailbox cleanup was performed.
- Mail has readable dates, keyboard-selectable rows, a subject-led wrapping header,
  independent list/body scrolling and mobile list/detail navigation. Calendar keeps
  its scrolling setting. Blocked images no longer show broken-image icons; responsive
  body styles preserve sandbox isolation and supported inline images. List body
  previews are removed. Show Images explicitly enables HTTPS images only for the
  current selection, resets on selection/refresh/reload, and is never persisted.
  Referrers are suppressed, but IP/time and per-message URL tracking remain possible.
  Scripts, forms, links, insecure images and embeds remain blocked after consent.
- Latest local validation: 35 Node tests, 12 desktop/mobile Chromium tests, and the
  TypeScript/Vite build pass. Synthetic screenshots were inspected. Tests cover wide
  tables, long text, CID images, plain text, focus restoration, scroll boundaries,
  hostile email, Inbox routing, per-message HTTPS image consent and its reset,
  no-referrer image requests, preview removal and QR success/failure/cancellation. No private message
  body or token was saved. These tests do not prove real device or production acceptance.
- Pages uses Actions and permits `gh-pages` plus `v*` tags. The custom domain is
  configured in Pages, and its Cloudflare CNAME now targets `johnshew.github.io`,
  retaining proxying and Full (strict) TLS. The live HTTPS site works and desktop
  1440px/mobile 390px welcome screens have no horizontal overflow. GitHub still
  reports that its custom-domain certificate does not exist, so its own
  `https_enforced` setting remains false. Exact account and DNS records are private.
- The chosen deployment is static-only with `@azure/msal-browser`. Microsoft may
  offer phone/passkey QR on compatible browsers, but it is not the selected Tesla
  path; see the October 2 constraint in [QR rollout](#qr-service-rollout).
  `VITE_DEVICE_LOGIN_URL` remains unset. No Node host or
  separate device registration is needed for this rollout. Optional device-service
  code remains available but is not deployed, and its setup warning is hidden.

### Remaining acceptance and hardening

Development update, October 2, 2026: the **0.4.0 candidate** implements Phone Link,
optional URL email hints, explicit Microsoft account selection, Settings
Apply/Cancel and known Chromium 88 compatibility fixes. Production remains
the published 0.3.0 release. Neither merging this candidate nor installing
Wrangler deploys a Worker or changes the live Pages site.
Local candidate validation passed: 59 Node tests, 30 desktop/mobile Chromium
tests, the TypeScript/Vite build, Worker dry-run bundle and dependency audit.
An independent code review's configuration-forwarding and near-expiry approval
findings were fixed with regression coverage. This is not live Microsoft,
phone-passkey, Worker deployment or Tesla acceptance.

Cloudflare inventory, October 2, 2026: the existing
`office-dashboard-pairing` Worker at
`https://office-dashboard-pairing.vanamonde.workers.dev` is live and its HTTPS
health endpoint reports version 2, D1 storage and ten slots. Its database,
`office-dashboard-relay`, contains the legacy `relay_slots` schema. Inspecting
the deployed source confirmed the relay API, not the new phone OAuth service.
Its bindings are origins, D1 and rate limiting, with no Worker secrets.
The legacy allowed-origin list includes the dashboard HTTPS origin and
`http://localhost:8000`. No session rows, pairing capabilities or account data
were read, and that service/configuration was not changed.

The proposed `office-dashboard-phone-link` service needs its own D1 database,
an Entra Web callback and protected server credentials. These prerequisites
were not established at the inventory checkpoint. GitHub then had the browser client/tenant
variables but no Phone Link URL or Cloudflare deployment secrets. Wrangler
OAuth authenticates this development host; it is not an unattended CI credential.
The existing `cloudflare-production` GitHub environment has no approval rules;
its existence is not evidence of protected backend deployment. Real phone sign-in
remains blocked on registration, deployment and user-operated Microsoft consent.
Do not publish the candidate with a placeholder Phone Link URL to bypass those gates.

The owner subsequently directed reuse of the existing Office Dashboard app
registration. Add a Web-platform callback and Worker-only client secret while
preserving the SPA platform, its redirects, PKCE and `common` account audience.
No new registration or frontend secret is required. The registration choice is
settled; saving/verifying that Web callback and securely entering the credential
still require the owner's authenticated Entra session.

The source now includes an independent manual **Phone Link release** workflow:
accepted default-branch source/CI, required human environment review, locked
Wrangler, immutable no-bundle deployment, explicit additive schema initialization,
sanitized version/readiness receipts and compatible existing-version rollback.
Its protected environment, scoped Cloudflare API credential and dedicated
Worker/D1 onboarding are not configured merely by committing the workflow. Existing
QR resources and production Pages remain unchanged. Follow
[Worker CI/CD](.agents/worker.md#independent-worker-cicd) before enabling it.

Subsequent authorized bootstrap, October 2, 2026: the dedicated
`office-dashboard-phone-link` D1 database was created and its `phone_slots`
table and `phone_expiry` index were initialized and read back. The legacy relay
database was not changed. The new GitHub `cloudflare-phone-link` environment
now requires explicit owner approval and restricts deployments to `gh-pages`;
its seven public Worker configuration variables were saved and read back.
The application ID is reused from the existing dashboard configuration, with
the accepted `common` audience. No Worker runtime, server secrets, Cloudflare
CI API token, frontend Phone Link URL, version tag or workflow dispatch has been
published/configured. Web callback/credential setup and actual phone acceptance
remain outstanding.

Registration and delivery checkpoint, October 2, 2026, 18:40 UTC:
tenant-scoped exact lookup through Azure CLI found the existing registration.
Its Phone Link **Web** callback is now saved and read back; the three SPA
callbacks, account audience, delegated/API/public-client settings and disabled
implicit grants were preserved. A bounded Worker-only client credential
expires March 31, 2027. Its value and a stable, separately generated encryption
key were transferred directly to the new draft Worker's protected secrets;
both binding names were verified without publishing any values.

Release tooling was simplified and merged in PR #65; Azure setup guidance
was merged in PR #66. Accepted source
`cb12c894e603ce83c26cd2891251aacd765fd7dc` passed exact default-branch
[CI 37048531888](https://github.com/johnshew/office-dashboard/actions/runs/37048531888).
The exact Worker bundle and public configuration were prepared and sealed
without a live deployment or SQL execution. Normal deploy and additive D1
initialization are separate operations; this database is already initialized.
[Phone Link release 37048930018](https://github.com/johnshew/office-dashboard/actions/runs/37048930018)
passed source/CI/reviewer preflight and is waiting for required human approval.
Configure the scoped `CLOUDFLARE_API_TOKEN` environment secret before approving
that run. Developer Wrangler OAuth is not a CI credential and lacks account
API-token creation permission. No runtime or Pages release has bypassed the
approval gate. The frontend Phone Link URL remains unset; actual phone/Tesla
acceptance and the overall live goal remain open.

1. Verify Pages certificate provisioning and HTTPS enforcement for the configured
  custom domain. DNS was changed before publication at the user's request.
  Preserve strict origin TLS at Cloudflare; never use HTTP authentication.
2. Complete target phone/vehicle and fresh-interactive-sign-in acceptance.
  Production Inbox, calendar, refresh, reload and logout checks passed on desktop;
  Microsoft phone/passkey availability and long-lived token renewal are untested.
3. Require `Validate` and PR review on `gh-pages` and restrict `v*` tags to maintainers.
  PRs #58, #59 and #60 merged after successful CI without an admin bypass.
  Ruleset enforcement has not been established by these successful runs.
4. For the next release, tag a new accepted default-branch commit with a matching
  package version. Do not move `v0.3.0`; its provenance and release assets are fixed.
5. Dashboard-owned QR is a separate rollout: select/approve a trusted HTTPS Node
   host, configure the matching public-client audience and exact allowed origin,
   deploy/test the service, then set `VITE_DEVICE_LOGIN_URL` in a new version. Static
   sign-in does not require that service. See [QR rollout](#qr-service-rollout).

## Hosting investigation

Historical observation, September 13, 2026, 09:34 PDT, before the cutover above.
The existing custom-domain CNAME was proxied by
Cloudflare to an Azure App Service hostname. Cloudflare uses Full (strict) TLS.
The public HTTPS request validates TLS but returns HTTP 530 / error 1016
(Origin DNS error); the Azure hostname returns NXDOMAIN. No DNS, TLS, redirect,
resource or billing setting was changed during this investigation.

Fresh tenant MFA exposed three Enabled personal Azure subscriptions. The legacy
Office Dashboard App Service was absent from their current resource lists, but
this does not establish global deletion or a move destination. Other applications
and identity resources remain in the older hosting subscription. Preserve their
intentional placements; do not cancel a populated subscription as dashboard cleanup.
Exact accounts, subscription IDs and resource inventory are maintained privately.

The March 2016 deployment server (`0c821bc`, `d3b17c6`) served static files from
`public` through Restify and redirected `/` to `./public/index.html`. The modern
`server.js` is the optional device-login service, not that static deployment server.
Reusing the old Azure startup configuration is not a verified deployment strategy.

When adopting any custom hostname, register its exact SPA root URL, validate
the frontend base path, host configuration, edge/origin TLS and release provenance,
then test real sign-in/logout there. The custom-domain callback is now saved
alongside github.io and localhost. The MSDN Azure credit benefit is limited to development
and testing; it is not automatically an eligible production hosting destination.

### Reproduce validation

Use Node 24, `npm ci`, `npm test`, `npx playwright install chromium`, and
`npm run test:browser`. Browser tests build with mocked identity settings on port 8002.
Before previewing or publishing `dist/`, run `npm run build` again with real public
configuration: the test build is deliberately not a production-authentication build.
For real local sign-in, populate `.env` from `.env.example` and run `npm start` on
`http://localhost:8000/`. Use the registered client ID and `VITE_TENANT_ID=common` for
this candidate. Never put a secret or token in any `VITE_` variable.

## 0.3.0 scope

Consolidate the September 12 modernization and its follow-up fixes in PR #58:

- MSAL Browser authorization-code/PKCE sign-in and delegated read-only Graph access.
- Optional MSAL Node device-code service, local QR generation, bounded in-memory
  sessions, exact-origin CORS, and an allowlisted read-only Graph proxy.
- Fix the frontend/backend attachment query contract and late authentication responses.
- Isolate untrusted mail/event HTML in sandboxed frames with default-blocked network
  access and an explicit per-selection HTTPS image opt-in for Mail.
- Replace unavailable React/Vite/type pins with published stable versions and refresh
  the lockfile. Retain the modern MSAL and TypeScript stack.
- Add production configuration validation and desktop/mobile browser regression tests.
- Scope Mail to Inbox and replace clipped legacy mail rows, dates and nested scrolling.

This is a modernization release, not a claim of compatibility with old vehicle
browsers. Authentication requires current Web Crypto and browser APIs.

## Release gates

Every branch push and PR runs the `CI and release` workflow. The `Validate` job uses
Node 24, `npm ci`, unit/security tests, a high-severity dependency audit, Chromium
desktop/mobile smoke tests, and a production typecheck/build. Browser tests use
mocked device and Graph responses; they do not prove real tenant authentication.
Failed browser runs retain diagnostics for seven days. Build archives and checksums
are retained for 30 days; published releases retain their assets independently.

Require `Validate` in the default branch ruleset and require PR review. Do not bypass
failed checks. Limit creation/deletion/update of `v*` tags to release maintainers.
The workflow rejects tags that do not match the package version or are not ancestors
of the default branch. PRs and ordinary branch pushes never deploy.

## Initial launch checklist

1. Review and merge PR #58 after all checks pass. No production tag until the
   remaining setup and tenant acceptance checks below are complete.
2. Register a production Entra SPA with the exact redirect URI
   `https://johnshew.github.io/office-dashboard/`. Grant delegated `User.Read`,
   `Mail.Read`, and `Calendars.Read` and arrange tenant consent. Do not create a secret.
3. Set repository Actions variables `VITE_CLIENT_ID` and `VITE_TENANT_ID`. The client
  ID must be real, not a placeholder. Match the audience (`common` for this app). These are public
   build settings, not secrets. Leave `VITE_DEVICE_LOGIN_URL` unset for the first
   static-only release unless the separately hosted service has passed acceptance.
4. Switch Settings > Pages > Source to GitHub Actions before merging; merging must
   not publish raw source through the legacy branch-based publisher. Configure the
   `github-pages` environment to permit version tags and the default branch (for
   manual release/rollback). Add an environment reviewer where operationally useful.
5. Test real Microsoft sign-in, consent, mail, calendar, refresh, session renewal,
   logout, and blocked external mail content locally with the production registration's
   approved localhost redirect or with a separate staging registration/deployment.
6. On the validated default-branch commit, push an annotated `v0.3.0` tag. The Actions
   run validates configuration, rebuilds after the mocked browser tests, stamps
   `release.json`, and uploads only `dist/` to Pages. A serialized environment deployment
   publishes the site. The final job verifies the live provenance before creating the
   GitHub release with generated notes, a site archive, and SHA-256 checksums.
7. Visit the published site and perform tenant acceptance again. A green deployment
   proves artifact publication, not Microsoft login or mailbox correctness. Announce
   availability only after those checks pass.

Production URL: https://johnshew.github.io/office-dashboard/

## Entra setup lessons

Verified during setup on September 13, 2026:

- A personal Microsoft account can administer an app when it has access to an
  Entra directory. The portal's account menu identifies the active directory;
  verify that directory before registering the app. An email domain alone does
  not establish a valid Entra sign-in name or administrative access.
- Opening App registrations and seeing New registration confirms portal access,
  not successful app creation or permission to grant tenant-wide consent. Record
  the Application (client) ID only after registration succeeds. The Directory
  (tenant) ID is not interchangeable with the client ID or application Object ID.
- Choose the app's intended mailbox audience separately from its administrator.
  Single-tenant registration restricts sign-in to that directory; it does not
  automatically enable the administrator's personal Outlook.com mailbox. Personal
  Microsoft accounts require a matching supported account type and authority
  (`common` for organizational and personal accounts, or `consumers` for personal
  accounts only). Prove access with an actual mailbox before release.
- Use the Single-page application platform, exact redirect URLs including trailing
  slashes, delegated Graph permissions, and authorization code with PKCE. Do not
  create a client secret, enable implicit grants, or enable public client flows
  on the SPA merely to fix sign-in. The optional device service has separate setup.
- Configure public IDs under GitHub Actions Variables, not Secrets. The release
  validator checks ID/URL syntax, not registration existence, consent, supported
  accounts, or mailbox access. A syntactically valid client ID alone is not acceptance.
- Complete passwords, MFA, and any required administrator approval directly in
  Microsoft's UI. Never store credentials, session tokens, or recovery codes in
  documentation. Personal administrator/account details belong in the owner's
  private account notes, not this public repository.

At the early September 13 setup checkpoint, the Office Dashboard registration was verified
in Entra. Both documented SPA redirects and all three delegated Graph permissions
were saved and read back. Implicit grants and public client flows were disabled.
GitHub's public client and tenant variables were configured and read back. The
registration was then single-tenant; no tenant-wide consent was granted. Real-mailbox
acceptance was then unverified. Later personal-account setup and acceptance below
supersede that state. Production deployment and QR hosting remain pending.

Local validation passed: 34 Node tests, six mocked Chromium desktop/mobile tests,
the TypeScript/Vite production build, and actionlint on both workflows. Dependency
installation reported zero known vulnerabilities at this checkpoint. These checks
do not establish live authentication or future dependency safety.

Build recovery lesson: verify that dependency pins are published before choosing
versions. The initial React/Vite/type pins and a transitive Rolldown lock entry were
unavailable. Published stable versions plus a lockfile refresh restored clean
installation. On Microsoft-managed hosts use the configured approved package proxy;
do not disable TLS validation to work around public-registry connectivity failures.
Keep registry-specific credentials and local proxy settings out of the repository.

If GitHub rejects a push with GH007, preserve email privacy protection. Use the
account's GitHub-provided noreply identity and amend only your own unpublished
commit's author and committer. Do not disable the protection or rewrite shared
history to publish a checkpoint.

## Verified rollout checkpoint

September 13, 2026: commit `143325a` was pushed to PR #58, which is ready for review.
[GitHub Actions run 34765484324](https://github.com/johnshew/office-dashboard/actions/runs/34765484324)
passed clean Linux installation, all Node/browser tests, the dependency audit,
production build, provenance stamping, and artifact packaging. Deployment and release
jobs were correctly skipped for the branch push. The artifact is a testable candidate,
not a production release.

Pages Source is now GitHub Actions. The `github-pages` environment permits the
`gh-pages` branch and `v*` tags. No PR merge, production tag, or new site deployment
has been performed. Required branch review/status rules remain an initial-launch
check; environment source restrictions are not a replacement for review.

GitHub rejected enabling Enforce HTTPS with "The certificate does not exist yet".
The source switch succeeded separately, but HTTPS enforcement remains off. Resolve
the site's certificate provisioning in Settings > Pages, then enable and verify
HTTPS enforcement before production acceptance. Keep the registered HTTPS callback;
do not work around this by registering the HTTP Pages URL. If the API continues to
report no certificate after provisioning, investigate with GitHub support.

At that checkpoint, audience, personal consent and mailbox acceptance were still
pending; they were subsequently verified below. The current remaining gates are
listed at the top of this guide. QR hosting remains independent of static publication.

The initial local acceptance attempt reached Microsoft's Office Dashboard consent screen using the
configured client, tenant, and `http://localhost:8000/` callback. It requested the
three delegated read scopes plus standard identity/offline-access scopes. Consent
was not accepted and the organization-wide consent checkbox was left unchecked.
This verifies the authorization request, not token exchange or mailbox availability.
Personal consent and mailbox acceptance were completed later, as recorded below;
do not grant consent for the entire organization as a shortcut.

### Personal mailbox sign-in

Later on September 13, real sign-in with a personal Microsoft account loaded the
profile but mail/calendar requests returned HTTP 401. The inspected mail response
had no JSON error body or authentication diagnostic headers. This is consistent
with the single-tenant guest identity being unsuitable for the personal mailbox;
it is not evidence that a generic retry or broader Graph permissions are needed.

The registration's supported accounts were changed to organizational directories
plus personal Microsoft accounts. `VITE_TENANT_ID` is now `common` in GitHub and
the local preview; the owning directory and client ID did not change. A fresh tab
avoids cached tenant tokens. The corrected authorization request reached the
personal-account consent page on `account.live.com`, rather than tenant consent.
All three read-only delegated scopes and the SPA security settings are unchanged.

This supersedes the earlier single-tenant configuration checkpoint. Treat
`VITE_TENANT_ID` as the authority selector, not necessarily the app's owning
directory ID, when supporting multiple account types.

### Verified personal mailbox recovery

At 08:38 PDT on September 13, a fresh local sign-in and subsequent page reload
returned HTTP 200 for `/me`, `/me/messages`, and `/me/calendarView`. This confirms
real personal-account profile, mail, and calendar access, not just a mocked test
or successful consent screen. Response bodies and tokens were not recorded.

The preceding authorization transaction had returned `AADSTS50194`, claiming the
app was not multi-tenant despite the changed form. A freshly loaded Microsoft Graph
app manifest confirmed `signInAudience: AzureADandPersonalMicrosoftAccount` was
persisted. Starting a new sign-in in a fresh tab then succeeded without another
configuration change. Propagation or the earlier in-progress transaction is a
possible explanation; the exact server-side cause was not established.

For this error, verify the saved manifest and matching authority first. A disabled
Save button or the dropdown's displayed value alone is insufficient evidence.
After an audience change, discard an already-started authorization transaction and
start fresh. Do not keep broadening permissions, switch back to the guest tenant,
or create a secret to work around it. If a new request still fails after checking
the persisted settings, retain its correlation ID/timestamp for Microsoft support.

Production publication, HTTPS enforcement, logout/session-renewal acceptance, and
the separately hosted QR service remain separate gates. The successful local test
does not mean a modern production release has been published.

## Image-host diagnosis, September 13, 2026, 09:04 PDT

Moved Show Images to the lower-right of the address block without a new help-text
line. The enabled label now says Images Enabled rather than implying every image
loaded. The tracking warning remains a tooltip. Six focused desktop/mobile reader
tests and the typecheck/build pass; screenshots verify alignment without overlap.

Live diagnostics distinguished a successfully loaded remote tracking pixel from
other images rejected with `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`. An anonymous
CORS image retry was also rejected for a missing `Access-Control-Allow-Origin`
header. This is an upstream cross-site embedding restriction, not evidence that the
dashboard needs weaker sandbox or script permissions. No email link was followed.

Tests cover permitted HTTPS loading and a simulated blocked-response image, plus
consent reset and header geometry. Intercepted test responses did not reproduce
the actual host-policy enforcement, so the blocked response is explicitly mocked;
the host-policy diagnosis comes from the live browser, not that mock.

Restricted images remain unavailable in the static app. A trusted image proxy is a
separate hosting/security decision requiring approval, restricted fetch targets,
redirect and private-network protection, size/time limits, no credential forwarding,
and monitoring without logging message-specific URLs. Do not use a public third-party
proxy or weaken the email sandbox as a shortcut. No proxy has been added.

## Subsequent updates

Use a PR, update `package.json` and the lockfile together, and pass all CI gates.
After merge and acceptance, tag the merge commit `vMAJOR.MINOR.PATCH` and push the tag.
Do not move or reuse version tags. Patch versions are for compatible fixes; new
features use a minor version. Record user-visible/security changes in the PR so
generated release notes are useful.

For a failed initial deployment, fix configuration and dispatch `CI and release`
from the default branch with the existing `release_tag`. This rebuilds and retests
the tagged source using current public configuration. If a GitHub release already
exists, its original assets are retained. Use a new version for deliberate
configuration changes so the published release asset remains the source of truth.

## Rollback

Dispatch `Roll back Pages` from the default branch with a previously published tag.
It downloads the original release archive, verifies its checksum, deploys those exact
bytes through the same `production-pages` concurrency group, and checks the restored
provenance. It does not rebuild or use current identity variables. The target must
be a release created by this process with both assets. Coordinate releases and
rollbacks: an already queued newer deployment can still run afterward.

Do not roll back to the legacy implicit-authentication app or a release with known
security defects. If no safe previous release exists, disable access and ship a
forward fix. The first modern release has no modern rollback target.

## QR service rollout

### Tesla phone-login constraint, October 2, 2026

The owner reports that the target Tesla browser has no Bluetooth support for
cross-device passkeys. Do not revisit Microsoft's browser-provided passkey QR
as the solution for this target. The historical development baseline already
recorded on `copilot/account-chooser-031` is Intel MCU2 (Intel Atom E8000-series),
Linux x86_64, Chromium **88.0.4324.150**, from
[TeslaTap's MCU2 reference](https://teslatap.com/mcu/). This is not a measured
version for the current car. Record the actual model, infotainment hardware,
firmware version and browser user agent during vehicle acceptance.

The 0.4.0 candidate targets Chrome 88 and replaces direct `AbortSignal.timeout()`
usage with a compatible request helper. Build/runtime changes address those
known gaps, but do not establish real vehicle acceptance.
Do not infer compatibility from desktop Chromium tests or the car's audio Bluetooth.

The requirement is phone-based authentication with no Tesla text entry beyond
an optional email address, optionally supplied in the app URL. The 0.4.0 candidate
supports an optional `#email=...` hint and removes it before authentication.
The existing device-code service requires no email
on the Tesla: the phone enters the displayed short code and authenticates to
Microsoft. A passkey stored on the phone can be used if Microsoft offers it for
that account and policy, without Tesla Bluetooth. This phone-side passkey flow
has not been accepted with a live account. Microsoft does not support
`verification_uri_complete`, so device flow still requires phone code entry;
it does not meet a stricter scan-and-approve-only requirement.

### Phone sign-in alternatives

| Flow | Implementation and publication status | Phone code entry |
| --- | --- | --- |
| Node device-code QR | `server.js` and dashboard integration exist; service is not enabled in production | Required |
| Device-code copy-and-continue helper | Proposed phone landing page; no implementation | Paste still required |
| Phone Link | Implemented in 0.4.0 candidate with Cloudflare Worker/D1; not deployed or accepted with a live account/vehicle | No manual device-code entry |

For all flows, phone-local passkey availability depends on the Microsoft account,
phone/passkey provider and policy. Work/school accounts need tenant acceptance;
personal accounts need an appropriately configured account audience. Authentication
and consent happen in Microsoft's UI, not on a service page that collects credentials.

The optional email hint uses a fragment such as `#email=you%40example.com`, not a
query parameter, to keep it out of the initial hosting request. It is removed
from the current URL before authentication but a saved bookmark or prior browser
history can still contain it. Preserve the exact registered callback, and treat
it only as an optional `login_hint`, never an identity assertion
or authorization constraint. Account confirmation must use the authenticated identity.

### Node device-code QR rollout

Pages cannot host the Node service. Before enabling `VITE_DEVICE_LOGIN_URL`:

- Select a trusted HTTPS host and a separate approved Entra public-client registration;
  enable public client flows. Do not weaken Conditional Access to permit device flow.
  Match the intended mailbox audience: personal mailboxes need personal-account support
  and `common`/`consumers`, not the personal administrator's organizational guest tenant.
- Deploy this release's `server.js`, `package.json`, and lockfile with Node 24 and
  `npm ci --omit=dev`; start with `npm run start-device-server`.
- Inject `DEVICE_CLIENT_ID`, `DEVICE_TENANT_ID`, `DEVICE_ALLOWED_ORIGINS`, `HOST`, and
  `PORT`. Use the exact Pages origin without a path. Prefer a dedicated custom origin
  because all sibling GitHub Pages sites under one username share an origin.
- Use one process or sticky routing; sessions are not replicated. Restarting or
  deploying the service signs out device sessions. Tokens must not reach logs.
- Add TLS termination, monitoring and edge rate limits. The built-in limiter uses
  socket IPs and does not trust forwarding headers: behind a shared reverse proxy,
  users may share its ten-starts-per-ten-minutes limit. Do not assume per-user limits.
- Test phone approval, consent, denial, expiry, cancel, retry, refresh, logout, restart,
  unapproved origins, and mailbox access with your tenant. Verify no credentials in
  browser storage, QR contents, URLs, or logs.
- Set the frontend service URL and publish a new version. The service deployment
  pipeline must be tailored to the chosen host, ideally with GitHub Actions OIDC,
  staging, approval and rollback. No cloud resource or paid host is provisioned by
  the Pages workflow.

The QR contains only Microsoft's verification-page URL. The user still enters the
short code on their phone. Microsoft tokens stay in service memory; the dashboard
holds only a random service-session credential in memory. Pending codes expire within
15 minutes; active service sessions expire after at most eight hours. Browser reload,
logout, or service restart requires a new device login. Browser PKCE sign-in remains
available independently; its cross-device passkey QR is not the Tesla solution.

The proposed copy-and-continue enhancement would encode a service-hosted phone
landing URL in the QR. That page would show the short `user_code` and offer a
user-initiated clipboard copy followed by navigation to Microsoft's verification
page. It cannot automatically fill or submit a cross-origin Microsoft form.
Handle clipboard denial explicitly with manual-copy instructions. Keep the
server-only `device_code`, tokens and passkey private keys out of the QR, URLs,
clipboard and logs; only the short user code is copied. Any landing capability
must expire and disclose no server credential.

### Phone Link rollout

**Existing Cloudflare source:** [PR #62](https://github.com/johnshew/office-dashboard/pull/62),
branch `copilot/account-chooser-031`, contains `workers/pairing/index.js`,
`workers/pairing/schema.sql`, `workers/pairing/wrangler.jsonc` and
`test/pairing-worker.test.js`. The Worker has ten D1 relay slots, separate hashed
phone/Tesla capabilities, ten-minute pending expiry, a one-minute completion
window, single-use code delivery, scheduled cleanup and an IP rate limiter.
Its origin allowlist is configured for `https://office-dashboard.shew.net`.
The original relay source was not merged as-is; the 0.4.0 candidate adapts it.
A live Worker deployment has not been established in this review. Do not describe the relay
as a deployed device-code service or completed Phone Link authentication flow.

The 0.4.0 implementation replaces that relay API with the following sequence:

1. The Tesla starts a bounded pairing session and retains its polling credential
   only in memory. The QR contains a separate, short-lived phone pairing capability,
   not a Tesla polling credential or Microsoft token.
2. The phone opens the service and starts Microsoft authorization-code sign-in
   using PKCE and a callback-bound, one-time state value. Authentication may use
   a passkey local to the phone; the Tesla needs neither passkeys nor Bluetooth.
3. Microsoft redirects to an exact, registered service HTTPS callback. The service
   validates state and redeems the code server-side, verifying the signed-in identity.
4. Before attaching that identity to the car, the phone user explicitly approves
   the waiting Tesla session. Display the account and matching pairing label;
   scanning or authenticating alone must not grant the car access.
5. The service atomically consumes the pairing approval. The Tesla detects completion
   through authenticated polling and reads allowlisted Graph endpoints through the
   service, with Microsoft access/refresh tokens kept server-side.

Implementation and operational gates:

- The candidate includes the Microsoft callback, phone pages, explicit approval,
  server-side token/session lifecycle and dashboard integration. The original
  relay API is not preserved. Follow [Worker setup](.agents/worker.md) for the
  D1 schema and separate service configuration. `VITE_PHONE_LINK_URL` enables
  Phone Link; `VITE_DEVICE_LOGIN_URL` remains the Node alternative.
- Configure the existing Office Dashboard registration's Web platform, as selected
  by the owner, preserving SPA callbacks and the accepted audience. Request only
  delegated `User.Read`, `Mail.Read` and `Calendars.Read`. Store application credentials as
  Worker secrets, never in source or public build variables. The Node device-code
  public-client registration and its configuration are a different alternative.
- The Worker encrypts persisted tokens with AES-GCM using a server-only key.
  Its `phone_slots` table bounds pending/active sessions to ten slots; pairing
  expires after ten minutes, approved sessions after at most eight hours.
  Approval transitions and refresh leases use D1. Keep the encryption key stable
  across Worker instances; clear affected sessions before a controlled rotation.
  The dashboard credential stays in memory, so reload requires a new Phone Link
  sign-in. Logout removes the server session; a restart is not an in-memory reset.
- Bind OAuth state, PKCE and approval to the correct pairing and phone session.
  Expire and consume capabilities atomically; reject replay, cross-session substitution,
  duplicate callback/approval, cancellation and late completion. Protect approval
  against CSRF and clickjacking. Redact callback codes and pairing URLs from telemetry;
  use restrictive caching and referrer policies.
- Show which account and Tesla session will be linked. Warn users to initiate and
  approve only their own parked-car session: a QR login can still be used for phishing.
  Do not weaken Conditional Access or promise that passkeys bypass tenant restrictions.
- Preserve the read-only Graph allowlist, exact dashboard CORS origin, token renewal,
  logout and revocation behavior. Define reload/restart behavior explicitly; do not
  inherit the Node service's in-memory session assumptions without a decision.
- Local coverage includes phone/desktop browsers and negative pairing tests:
  replay, wrong state/credential, expiry, cancellation, denial, double approval,
  full capacity, storage/network failure, account mismatch and token renewal.
  Complete real phone and parked-Tesla acceptance on the recorded browser version
  before enabling production.
- Use Node 24 and Cloudflare Wrangler for local Worker/D1 development and deployment.
  Follow [the setup guide](.agents/setup.md) for the verified user-local Windows
  Node installation and project-local Wrangler approach. Installing tooling is
  separate from Cloudflare authentication, provisioning resources or deploying.
  Document service configuration, secret setup and a rollback path before publishing
  a new dashboard version. The Pages workflow does not deploy the Worker.

## Branch consolidation decisions, October 2, 2026

The repository's default branch is `gh-pages`, not `main`. Reviewed branch
snapshots are recorded below so retiring a branch does not erase the rationale.
Consolidation means adapting useful ideas to the current MSAL/Graph/Vite app,
not merging obsolete APIs and generated bundles back into production.

| Reviewed source | Decision |
| --- | --- |
| [PR #62 / account-chooser-031](https://github.com/johnshew/office-dashboard/pull/62) | Retain explicit Microsoft account selection, shared routed guides, the Intel MCU2 browser baseline and Cloudflare D1 relay foundation. Omit generated PR-review tracking artifacts. |
| [newgraph](https://github.com/johnshew/office-dashboard/commit/d8bd0a00d648d14f2ead1f487882d4a91ab299d2) | Retired Kurve attachment/query experiments are superseded by native Graph requests and safe inline attachment handling. Do not import permissive attachment checks or legacy generated bundles. |
| [profilePhoto](https://github.com/johnshew/office-dashboard/commit/4854bf8e007fee50886191189b427f0547208401) | Do not import the incomplete Kurve sender-photo experiment, sender-address logging or additional user-photo requests without a modern permission/privacy design. |
| [react-modal](https://github.com/johnshew/office-dashboard/commit/1145c72ba98ac78503fc7facfe6508b961eea757) | Adapt draft Settings with Apply/Cancel to the existing Bootstrap 5 modal. Do not add the obsolete ReactModal dependency or generated bundle. |
| [requestbuilder](https://github.com/johnshew/office-dashboard/commit/a8b7a261981814f4ffae162d4624aaaafefa3b64) | The useful exclusion of Sent/Junk/Deleted folders is already achieved by the modern Inbox endpoint. Do not restore localized folder-name filtering or retired request-builder code. |
| [vNext](https://github.com/johnshew/office-dashboard/commit/5334092d614d267589797028699033e0c6faa845) | Dependency-managed bundling, Inbox filtering and removal of user telemetry are already covered by the modern app. Do not restore Kurve, custom token storage or historical release claims. |
| [PR #56 / southworks:testable](https://github.com/johnshew/office-dashboard/pull/56) | Legacy Kurve npm/type-import modernization is superseded by the current locked MSAL/Vite/Graph type dependencies. Its external fork is not an origin branch owned by this repository. |

Already-merged rollout/release branches can be retired without re-merging their
changes. Unmerged branches are retired only after retained ideas are included
and rejected ideas have an explicit rationale. Preserve active worktrees and
unrelated dirty work; an active app-managed session is not stale merely because
its PR has merged. Cleanup does not authorize a new Pages release, a Worker
deployment, deletion of another owner's fork, or edits to the main checkout.

Settings edits now remain drafts until **Apply**. **Cancel**, closing the modal
and Escape discard unapplied edits. Applied values retain the existing storage
and refresh behavior. Rollback provenance verification uses the same HTTPS-only
normalization and redirect restrictions as the release verifier.