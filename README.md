# Office Dashboard for the Tesla

A simple web application that shows your email and other information from Office 365.

The application is optimized for the Tesla dashboard screen but it works well on desktop and larger mobile devices. 

The static deployment uses GitHub Pages with a custom domain managed through
Cloudflare. Version 0.3.0 is published and verified over HTTPS. GitHub's own
custom-domain certificate enforcement is still pending; Cloudflare retains
Full (strict) TLS. See [current release status](RELEASE.md#current-status).

Normal Microsoft sign-in uses `@azure/msal-browser` and calls Microsoft Graph
directly. No Azure website, Kurve library or Node service is required. Microsoft
may offer cross-device passkey sign-in on compatible browsers, but this is not
the selected Tesla phone-login path: the owner reports that the target Tesla
browser lacks Bluetooth support for passkeys. The optional dashboard device-code
service remains disabled for this deployment. The optional **Phone Link** flow
authenticates on the phone without manual device-code entry. It is implemented
in the 0.4.0 development candidate but is not enabled in the published site.
See [phone sign-in alternatives](#sign-in-on-an-iphone-with-a-qr-code).

## Current release

[Version 0.3.0](https://github.com/johnshew/office-dashboard/releases/tag/v0.3.0)
was published on September 13, 2026 from the merged default-branch commit.
Production Microsoft sign-in, Inbox and calendar requests, refresh, session
restoration after reload, and logout have been verified. Target phone/vehicle
acceptance remains incomplete. See [current release status](RELEASE.md#current-status).

The **0.4.0 development candidate** adds Phone Link, optional URL email hints,
explicit Microsoft account selection and Settings Apply/Cancel. Merging source
does not publish a release or deploy the optional backends.

Mail now opens **Inbox**, newest first, instead of combining every mailbox folder.
Junk, Deleted Items and Sent Items are excluded from this view. This does not filter
spam already in Inbox or move/delete any messages. The existing fetch limit is 40
messages; this is not a complete-mailbox browser.

The Inbox list and message body scroll independently on desktop. On phones, selecting
a message opens a full-width reader; Back to Inbox returns to the list. Rows show the
sender, date and subject without body previews. Subjects wrap,
metadata includes the full local received date, and keyboard selection is supported.
Exceptionally long headers have their own bounded scroll area so the body stays usable.
The Settings scrolling option now applies only to Calendar.

Blocked decorative images are omitted; images with alternative text become small
"Image blocked" placeholders. Supported inline attachments still render. Email tables
and images are constrained to the available width where possible; unusually rigid
email layouts can still scroll horizontally inside the isolated body. **Show Images**
in the message header enables external HTTPS images, including CSS background images,
only for that selection. Switching messages, refreshing the mailbox or reloading
resets the choice; nothing is remembered in browser storage. Loading images may
disclose your IP address and viewing time, and a unique URL can identify the message
you opened. No referrer is sent, but that does not prevent tracking. HTTP images remain
blocked. Visual differences from Outlook are intentional.

The button sits at the lower-right of the address block; its tracking warning is
available as a tooltip. **Images Enabled** means requests are permitted, not that
every image loaded. A sender's image host may forbid cross-site embedding through
Cross-Origin-Resource-Policy or reject requests without CORS permission. The browser
must honor those restrictions. A separately hosted, trusted image proxy would be
needed for such images; Pages alone cannot provide one. No proxy is currently used.

## Identity and security

Sign-in uses the current Microsoft Authentication Library (`@azure/msal-browser`),
authorization code with PKCE, and Microsoft Graph v1.0 over HTTPS. Only delegated
`User.Read`, `Mail.Read`, and `Calendars.Read` are requested. There are no application
permissions or client secrets in the browser sign-in. The optional Phone Link
backend uses a confidential Web platform and server-only secrets. The owner
selected the existing Office Dashboard registration for both platforms; this
does not make a secret part of the browser flow.
The retired Kurve library, implicit-flow callback,
custom token store, jQuery, browser debug evaluator, and CDN scripts have been removed.
Microsoft Graph's maintained TypeScript definitions describe the data; native `fetch`
handles the small set of read-only endpoints instead of another API wrapper.

MSAL manages browser tokens in **session storage**, not persistent local storage.
The old Kurve token entry is deleted at startup. Log out before leaving a shared
display. Email and event HTML is rendered in a sandboxed frame so it cannot access
the dashboard or its tokens. Network access is blocked by default. Mail's per-message
Show Images control allows HTTPS image requests; it does not enable links, forms,
scripts or embedded content. Calendar images remain default-blocked. Inline
PNG/JPEG/GIF/WebP attachments remain supported without opting in.
This is not a guarantee of risk-free access to a mailbox.

### Register Microsoft sign-in

1. Create an app registration in Microsoft Entra ID. Choose the account types you
   intend to support; a single-tenant registration with its tenant ID is the most
   restrictive option.
2. Add **Single-page application** redirect URIs matching your deployment exactly:
   `https://johnshew.github.io/office-dashboard/` and, for development,
   `http://localhost:8000/`. For forks or custom domains, substitute the actual site
   URL. Keep the trailing slash. No `login.html` callback or popup is used.
3. Add Microsoft Graph **delegated** permissions `User.Read`, `Mail.Read`,
   `Calendars.Read`; obtain consent as required by your tenant.
4. Set `VITE_CLIENT_ID` to the Application (client) ID and `VITE_TENANT_ID` to the
   tenant GUID (`organizations` by default). `common` or `consumers` requires matching
   account-type support in the registration. Do not enable implicit grants or create
   a secret. MSAL supplies the standard OpenID/offline-access scopes.

All `VITE_` values are **public build-time configuration**. Never put credentials
in them. Configure different registrations for development and production if appropriate.

For Outlook.com/Hotmail mailboxes, enable personal Microsoft accounts in the
registration and use `common` (work/school plus personal) or `consumers` (personal
only), matching the registration's audience. Signing into an organizational tenant
as a personal-account guest can load the profile while mailbox requests fail.
After changing the audience or authority, start a fresh sign-in in a new tab to
avoid reusing the previous tenant's session. See [the observed setup issue](RELEASE.md#personal-mailbox-sign-in).

### Sign in on an iPhone with a QR code

**Tesla constraint, recorded October 2, 2026:** the owner reports that the target
Tesla browser lacks Bluetooth support for cross-device passkeys. Do not pursue
Microsoft's browser-provided passkey QR as the solution for this target. No exact
version for the actual target car has been recorded; the historical Intel MCU2
reference is Chromium **88.0.4324.150** on Linux x86_64. See
[the browser baseline](#working-with-the-tesla-browser). The Bluetooth limitation
is an owner-reported constraint, not a compatibility claim about every Tesla version.

The business requirement is phone-based authentication with no Tesla text entry
beyond an optional email address, optionally supplied in the app URL. Neither
alternative below needs email entry on the Tesla; account selection can happen
on the phone. The 0.4.0 candidate supports an optional hint URL:
`https://office-dashboard.shew.net/#email=you%40example.com`. The app reads and
removes the hint before authentication, keeps the registered callback unchanged,
and passes it as Microsoft's `login_hint` where supported. A fragment avoids
including the email in the initial Pages/Cloudflare HTTP request, but it still
appears in bookmarks/history and is not proof of account ownership.

| Alternative | Phone interaction | Tesla interaction | Status |
| --- | --- | --- | --- |
| Node device-code QR | Scan, enter the short code, sign in and consent | Select phone login and wait | Implemented in `server.js`; disabled in production |
| Device-code copy-and-continue helper | Scan, tap to copy, paste the short code at Microsoft, sign in | Select phone login and wait | Proposed enhancement; not implemented |
| Phone Link | Scan, sign in at Microsoft, explicitly approve the waiting Tesla session | Select Phone Link and wait | Implemented in 0.4.0 candidate; requires separate Worker deployment |

#### Node device-code QR

**Existing path for Tesla phone login:** configure the optional
Node service below. Select **Login with iPhone / device QR code**, scan the QR, enter
the displayed short code **on the phone**, and complete Microsoft's sign-in/consent.
The dashboard polls and continues automatically without typing in the dashboard
browser. Cancel, denial, expiry, and retry are supported. QR images are generated
locally, not sent to an external QR provider.

The phone can use a passkey stored on that phone when Microsoft's verification
page offers it for the account and policy. This does not require Tesla Bluetooth:
the phone authenticates directly to Microsoft, and the service polls over HTTPS.
Phone-side passkey acceptance for this flow still needs a live account test.

Microsoft does **not** support `verification_uri_complete`; the QR opens its
verification page, not an undocumented auto-submit URL. Phone code entry is still
required. See the [device authorization response](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code#device-authorization-response).

**Proposed copy-and-continue helper:** the QR could open a service-hosted phone
page that displays the short user code. A user tap on **Copy code and continue**
would copy that code and open Microsoft's verification page; the user would
still paste it there. Our page cannot fill Microsoft's cross-origin form or
force clipboard access. If clipboard access fails, the page must show the code
and instructions rather than claim it was copied. Do not include the server-only
`device_code`, Microsoft tokens or a passkey private key in the QR.

#### Phone Link (optional)

Phone Link uses Microsoft's normal **authorization-code flow**, not the
device authorization grant and not a cross-device passkey connection:

1. The Tesla requests a short-lived pairing session and displays its phone QR.
2. The phone opens the service page and starts Microsoft sign-in with state and PKCE.
3. Microsoft authenticates on the phone, using a phone-local passkey if available,
   and returns to the service's registered HTTPS callback.
4. The service verifies the callback and asks the phone user to explicitly approve
   the waiting Tesla session, showing a matching pairing label on both screens.
5. The Tesla polls with its separate session credential and becomes signed in
   only after approval. Microsoft tokens stay server-side; only allowlisted
   read-only Graph requests are proxied.

No short code is manually entered or pasted in this flow. Microsoft can still
require account selection, consent or additional authentication on the phone;
Phone Link does not bypass those prompts or guarantee passkey availability.
It needs no passkey Bluetooth support in the Tesla browser.

**Cloudflare starting point:** [PR #62](https://github.com/johnshew/office-dashboard/pull/62)
on `copilot/account-chooser-031` contains `workers/pairing/index.js`,
`schema.sql`, `wrangler.jsonc` and pairing tests. That Worker is a ten-slot D1
code relay with capability checks, expiry, rate limiting and one-time delivery.
That older relay is not the Node device-code service and is not itself an
end-to-end Phone Link implementation. The 0.4.0 candidate adapts its bounded
pairing design into `workers/pairing/`; it replaces the relay API with phone
OAuth, explicit approval, encrypted server-side token storage and dashboard
integration. On October 2, 2026 the existing relay Worker was confirmed healthy
at `https://office-dashboard-pairing.vanamonde.workers.dev`, using the
`office-dashboard-relay` database and legacy `relay_slots` table. It was
preserved unchanged. The new Phone Link Worker has not been deployed; a
healthy legacy relay does not establish phone OAuth or account acceptance.

The Worker-backed Phone Link service needs an Entra **Web** platform and exact
callback, protected server-side token storage, and
server-only application credentials managed as Worker secrets. Never put those
credentials in `VITE_` variables, URLs or QR contents. The existing
`VITE_DEVICE_LOGIN_URL` enables only the Node device-code path, not Phone Link.
Set `VITE_PHONE_LINK_URL` to the exact HTTPS Worker origin only after its rollout
is accepted. See [Worker setup](.agents/worker.md) and
[the rollout requirements](RELEASE.md#qr-service-rollout) before deployment.

The owner selected the existing Office Dashboard app registration for Phone Link.
Add its Web callback without removing or changing the existing SPA callbacks.
Both flows can share the application ID and accepted audience; only the Worker
uses the new server credential. Browser sign-in remains authorization code with
PKCE and never receives that credential.

#### Optional device-code service

GitHub Pages is static hosting. **It cannot run MSAL Node or the polling service.**
Device flow is not an MSAL Browser API. To enable the dashboard-owned QR:

1. Deploy `server.js` and its production npm dependencies to a trusted Node 22.12+
   host (Node 24 LTS recommended), separately from Pages. Terminate HTTPS there;
   set `HOST` appropriately behind your HTTPS reverse proxy.
2. Set `DEVICE_CLIENT_ID`, `DEVICE_TENANT_ID`, and `DEVICE_ALLOWED_ORIGINS`
   (comma-separated exact origins, e.g. `https://johnshew.github.io` — **no path or
   trailing slash**). Set `PORT` if needed (default 8001).
3. In the service's app registration, enable **Allow public client flows** and grant
   the same delegated permissions. No client secret is needed. Use a separate
   registration with the intended audience: a tenant GUID for approved organizational
   mailboxes, or matching personal-account support and `common`/`consumers` for personal
   mailboxes. Apply tenant policy where applicable; a guest identity does not grant
   access to the guest's personal mailbox.
4. Set the static build's `VITE_DEVICE_LOGIN_URL` to the service's HTTPS base URL,
   then rebuild/redeploy Pages. For development only, `http://localhost:8001` is
   allowed when the dashboard also runs on `localhost`.

For local development, copy `.env.example` to `.env`, fill in the IDs, and run
`node --env-file=.env server.js` alongside `npm start`. In production, inject the
service environment and use `npm run start-device-server`.

The service keeps per-session MSAL caches and Graph tokens **only in server memory**.
The browser holds a random service-session credential **only in memory**, never in
URLs, QR images, or web storage. CORS is exact-origin, no cross-site cookies are
needed, and only allowlisted read-only Graph paths are proxied. Sessions are bounded,
expire, and are removed on logout; reloading the dashboard or restarting the service
requires device sign-in again. The service operator is trusted with mailbox access.
Use one process or sticky routing; there is no shared/persistent session store.
Add hosting-level rate limits, monitoring without token logging, and a dedicated
trusted Pages origin for sensitive deployments (origins cannot isolate sibling sites
under the same `github.io` host).

Device-code flow is phishing-prone and may be blocked by Conditional Access.
Enable it only after tenant approval, never by weakening an existing policy.
Users must only approve codes they initiated on their own dashboard.
[Microsoft's device-flow policy guidance](https://learn.microsoft.com/en-us/entra/identity/conditional-access/policy-block-authentication-flows).

## Development and GitHub Pages deployment

Start with [the development tool setup guide](.agents/setup.md) for Windows Node
installation, existing-tool discovery, PowerShell/PATH troubleshooting and
project-local Wrangler. [AGENTS.md](AGENTS.md) routes shared development, security,
testing and release instructions; [CLAUDE.md](CLAUDE.md) is a thin adapter.
[Repository workflow](.agents/workflow.md) adapts CDL/GLP-style freshness and
learning-consolidation practices without introducing undocumented command aliases.

Use Node 24 LTS (minimum 22.12). Run `npm ci`, copy `.env.example` to `.env` and
configure it, then `npm start` at `http://localhost:8000/`.
`npm run build` type-checks and writes the static site to `dist/`;
`npm run preview` serves that build. `npm test` runs the focused Node tests.
The old HTML experiments in `test/` are historical manual fixtures and are not deployed.

In GitHub:

1. Set **Settings → Pages → Source → GitHub Actions** (not deploy from branch).
2. Under **Settings → Secrets and variables → Actions → Variables**, set
   `VITE_CLIENT_ID`, optionally `VITE_TENANT_ID`, and optionally
   `VITE_DEVICE_LOGIN_URL` or `VITE_PHONE_LINK_URL` only after the selected
   backend passes its separate rollout gates. These are non-secret settings.
3. Merge into the default branch (currently `gh-pages`) after CI passes, then push
   a version tag matching `package.json` (initial release: `v0.3.0`). PRs and ordinary
   branch pushes build/test but **do not deploy**. Releases require valid production
   identity configuration. Dispatch the workflow from the default branch with an
   existing release tag to retry a failed deployment.
4. Confirm the `github-pages` deployment URL and register that exact URL in Entra.
   Test sign-in, mail, calendar, refresh, logout, and iPhone sign-in with your tenant.

The workflow uses pinned GitHub Actions, `npm ci`, unit/security tests, desktop/mobile
Chromium login smoke tests, dependency auditing, and the official Pages deployment
actions. It also dry-run bundles the optional Worker; this is not a Worker
deployment. Only `dist/` is uploaded; relative
asset paths support repository subpaths and custom domains. The optional Node
service is **not deployed by this workflow**. Repository settings, app registration,
consent, and a live authenticated deployment must be completed by the owner.

Cloudflare Phone Link has its own manual **Phone Link release** workflow,
separate from Pages. It requires an accepted source revision, protected human
approval, scoped Cloudflare CI credentials and configured Worker secrets.
Normal deploys reuse the preserved bundle; schema initialization and an
existing-version rollback are explicit choices. See
[Worker CI/CD](.agents/worker.md#independent-worker-cicd). Adding this workflow
does not enable phone login or change the existing legacy relay.

See [the release plan](RELEASE.md) for launch gates, versioning, GitHub release assets,
exact-artifact rollback, and the separate QR service rollout. Run browser tests locally
with `npx playwright install chromium` followed by `npm run test:browser`; these use
mocked Microsoft/service responses and do not require an account.

## Historical release notes (legacy implementation)

### Release 0.2 – Public Alpha 2
 
This app provides a Tesla-friendly way to access your Office information.
 
The original release was a client app with read-only access to Microsoft APIs.
 
New in this release:

* Embedded pictures (in either email or calendar) are now supported
* Calendar events display location
* Once you click "login" you shouldn't have to do so again until you log out

There are still a number of significant limitations and issues in this release:

* The email view shows all messages from every folder in your mailbox – including sent mail
* Attachments sometimes show up as separate messages
* Calendar meeting times are shown in military time
* Loading the messages takes a little while on Tesla and there is no message indicating it is loading
* The settings options are too small to be easily used is the Tesla

Please use this link to report bugs or provide suggestions: https://github.com/johnshew/office-dashboard/issues

The all-folder behavior above describes 0.2 only; the current 0.3.0 candidate opens Inbox.

## Original implementation background

This app was developed to: 
* Demonstrate how to display information from http://graph.microsoft.io
* Test https://github.com/MicrosoftDx/KurveJS
* Learn more about React and how to use React with Typescript 
* Make it easy to catch up on mail and other Office information using the browser in Tesla http://tesla.com. 

The source is available at https://github.com/johnshew/office-dashboard

### Implementation Notes

The dashboard entry point remains `samples/tesla/App.tsx`. Identity and Graph access
now live in `samples/tesla/Identity.ts`; the optional device service is `server.js`.

Once the information is acquired from Office and placed into app state it gets rendered by set of user interface components.
    
Mail uses a viewport-sized responsive list/reader. Calendar retains its optional
pane-scrolling setting; it no longer controls Mail. The isolated HTML body cannot be
auto-sized by reading its document from the dashboard without weakening its sandbox.

The React display components in `src/` use Microsoft's Graph type definitions and
do not acquire data themselves.

These Office React components may potentially be useful to build other applications. If there is interest in this we will factor them out into a seperate Office React library that this application will use.

Bootstrap 5 supplies the navbar, dialogs, and grid styling without jQuery.

Bootstrap supplies shared controls. Mail-specific classes in `samples/tesla/dashboard.css`
provide the responsive reading layout without changing Calendar's legacy grid.

### Working with the Tesla browser

Use [TeslaTap's MCU2 reference](https://teslatap.com/mcu/) as the historical
development baseline: **Intel Atom E8000-series, Linux x86_64, Chromium
88.0.4324.150**. This reference was already recorded on the unmerged
`copilot/account-chooser-031` branch. It is not the verified current version of
the owner's car or every Intel Tesla; the actual model, infotainment hardware,
firmware version and full browser user agent still need recording during acceptance.

The 0.4.0 build targets Chrome 88 and uses a shared request timeout helper instead
of `AbortSignal.timeout()`, which that version lacks. This addresses known build
and request API gaps, not every possible runtime difference; actual Tesla
acceptance is still required. Retain HTTPS,
Web Crypto, modules, working session storage and secure authentication.
Do not restore legacy implicit authentication or weaken isolation.

For this target, treat browser-provided cross-device passkey QR as unavailable
because of the owner-reported lack of browser Bluetooth support. Car audio
pairing and desktop Chromium tests do not prove browser passkey support.
Phone-local passkeys in the optional phone flows are a separate capability.

Test touch scrolling, text size, sign-in and logout on the actual target vehicle
browser while parked before release. Include Inbox/Calendar loading, pairing
approval, cancellation, expiry, reload and session renewal for any enabled phone
flow. Desktop/mobile Chromium automation is not vehicle acceptance.

Use browser developer tools for debugging; avoid logging tokens or mailbox content.
