# Release Plan

## 0.3.0 scope

Consolidate the September 12 modernization and its follow-up fixes in PR #58:

- MSAL Browser authorization-code/PKCE sign-in and delegated read-only Graph access.
- Optional MSAL Node device-code service, local QR generation, bounded in-memory
  sessions, exact-origin CORS, and an allowlisted read-only Graph proxy.
- Fix the frontend/backend attachment query contract and late authentication responses.
- Isolate untrusted mail/event HTML in sandboxed, network-blocked frames.
- Replace unavailable React/Vite/type pins with published stable versions and refresh
  the lockfile. Retain the modern MSAL and TypeScript stack.
- Add production configuration validation and desktop/mobile browser regression tests.

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
   ID must be real, not a placeholder. Prefer an approved tenant GUID. These are public
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

At the September 13 setup checkpoint, the Office Dashboard registration was verified
in Entra. Both documented SPA redirects and all three delegated Graph permissions
were saved and read back. Implicit grants and public client flows were disabled.
GitHub's public client and tenant variables were configured and read back. The
registration remains single-tenant; no tenant-wide consent was granted. Real-mailbox
acceptance and production deployment remain unverified. The QR service URL is unset.

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

Remaining gates: confirm the intended mailbox audience, complete real sign-in and
consent, verify mail/calendar access and logout, review/merge the PR, and run the
first version-tag deployment. QR hosting and its separate registration are still
unprovisioned; the static-only release can proceed independently once its gates pass.

Local acceptance reached Microsoft's Office Dashboard consent screen using the
configured client, tenant, and `http://localhost:8000/` callback. It requested the
three delegated read scopes plus standard identity/offline-access scopes. Consent
was not accepted and the organization-wide consent checkbox was left unchecked.
This verifies the authorization request, not token exchange or mailbox availability.
The owner must complete personal consent directly and verify the intended mailbox;
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

This supersedes the earlier single-tenant configuration checkpoint. Personal
consent and successful mail/calendar responses still need verification; reaching
the right consent screen is not proof the HTTP 401 is resolved. No production
release has been issued. Treat `VITE_TENANT_ID` as the authority selector, not
necessarily the app's owning directory ID, when supporting multiple account types.

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

Pages cannot host the Node service. Before enabling `VITE_DEVICE_LOGIN_URL`:

- Select a trusted HTTPS host and a separate approved Entra public-client registration;
  enable public client flows. Do not weaken Conditional Access to permit device flow.
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
available independently and may offer Microsoft's own cross-device passkey QR.