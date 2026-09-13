# Office Dashboard for the Tesla

A simple web application that shows your email and other information from Office 365.

The application is optimized for the Tesla dashboard screen but it works well on desktop and larger mobile devices. 

The static site is intended for https://johnshew.github.io/office-dashboard/.

## Identity and security

Sign-in uses the current Microsoft Authentication Library (`@azure/msal-browser`),
authorization code with PKCE, and Microsoft Graph v1.0 over HTTPS. Only delegated
`User.Read`, `Mail.Read`, and `Calendars.Read` are requested. There are no application
permissions or client secrets. The retired Kurve library, implicit-flow callback,
custom token store, jQuery, browser debug evaluator, and CDN scripts have been removed.
Microsoft Graph's maintained TypeScript definitions describe the data; native `fetch`
handles the small set of read-only endpoints instead of another API wrapper.

MSAL manages browser tokens in **session storage**, not persistent local storage.
The old Kurve token entry is deleted at startup. Log out before leaving a shared
display. Email and event HTML is rendered in a sandboxed, network-blocked frame so
it cannot access the dashboard or its tokens. External images, links, forms, scripts,
and embedded content are disabled; inline PNG/JPEG/GIF/WebP images remain supported.
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

### Sign in on an iPhone with a QR code

**Pages-only, preferred:** choose Login with Microsoft → Sign-in options → Face,
fingerprint, PIN or security key → another device. Microsoft/the browser can display
a cross-device passkey QR code. Scan with the iPhone Camera and authenticate there.
This requires an enrolled, tenant-approved passkey, compatible browsers/devices,
Bluetooth and internet; it is not available on every vehicle browser.
[Microsoft's passkey instructions](https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-sign-in-passkey-authenticator).

**Device-code alternative for input-constrained displays:** configure the optional
Node service below. Select **Login with iPhone / device QR code**, scan the QR, enter
the displayed short code **on the phone**, and complete Microsoft's sign-in/consent.
The dashboard polls and continues automatically without typing in the dashboard
browser. Cancel, denial, expiry, and retry are supported. QR images are generated
locally, not sent to an external QR provider.

Microsoft does **not** support `verification_uri_complete`; the QR opens its
verification page, not an undocumented auto-submit URL. Phone code entry is still
required. See the [device authorization response](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code#device-authorization-response).

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
   the same delegated permissions. No client secret is needed. Prefer a separate
   single-tenant registration and restrict access with tenant policy.
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

Use Node 24 LTS (minimum 22.12). Run `npm ci`, copy `.env.example` to `.env` and
configure it, then `npm start` at `http://localhost:8000/`.
`npm run build` type-checks and writes the static site to `dist/`;
`npm run preview` serves that build. `npm test` runs the focused Node tests.
The old HTML experiments in `test/` are historical manual fixtures and are not deployed.

In GitHub:

1. Set **Settings → Pages → Source → GitHub Actions** (not deploy from branch).
2. Under **Settings → Secrets and variables → Actions → Variables**, set
   `VITE_CLIENT_ID`, optionally `VITE_TENANT_ID`, and optionally
   `VITE_DEVICE_LOGIN_URL`. These are non-secret settings.
3. Merge into the default branch (currently `gh-pages`) after CI passes, then push
   a version tag matching `package.json` (initial release: `v0.3.0`). PRs and ordinary
   branch pushes build/test but **do not deploy**. Releases require valid production
   identity configuration. Dispatch the workflow from the default branch with an
   existing release tag to retry a failed deployment.
4. Confirm the `github-pages` deployment URL and register that exact URL in Entra.
   Test sign-in, mail, calendar, refresh, logout, and iPhone sign-in with your tenant.

The workflow uses pinned GitHub Actions, `npm ci`, unit/security tests, desktop/mobile
Chromium login smoke tests, dependency auditing, and the official Pages deployment
actions. Only `dist/` is uploaded; relative
asset paths support repository subpaths and custom domains. The optional Node
service is **not deployed by this workflow**. Repository settings, app registration,
consent, and a live authenticated deployment must be completed by the owner.

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

## Original implementation background

This app was developed to: 
* Demonstrate how to display information from http://graph.microsoft.io
* Test http://github.com/MicrosoftDx/KurveJS
* Learn more about React and how to use React with Typescript 
* Make it easy to catch up on mail and other Office information using the browser in Tesla http://tesla.com. 

The source is available at https://github.com/johnshew/office-dashboard/

### Implementation Notes

The dashboard entry point remains `samples/tesla/App.tsx`. Identity and Graph access
now live in `samples/tesla/Identity.ts`; the optional device service is `server.js`.

Once the information is acquired from Office and placed into app state it gets rendered by set of user interface components.
    
The user interface is designed to work with both modern browsers and as well as more limited browsers as found on TVs and the Tesla. For these more limited browsers the application provides a layout option (in Settings) that is flat without any scrolling regions other than the page itself. 

The React display components in `src/` use Microsoft's Graph type definitions and
do not acquire data themselves.

These Office React components may potentially be useful to build other applications. If there is interest in this we will factor them out into a seperate Office React library that this application will use.

Bootstrap 5 supplies the navbar, dialogs, and grid styling without jQuery.

Consistent with the recommended approach to React, the React components do not use any global CSS classes other than the grid system. As noted above, we use the Bootstrap grid system.  Bootstrap is used to provide responsive layout. 

### Working with the Tesla browser

The updated app requires a modern browser with Web Crypto, modules, and current
web APIs. Obsolete vehicle browsers may no longer work; do not restore legacy
implicit authentication or insecure polyfills to accommodate them.

That said it is important to recognize that the Browser is pretty slow at rendering so don't make your user interface too complicated. In particular note that the Tesla browser is faster at scrolling an entire page relative to scrolling the contents of a div.  You can see this in the app by enabling scrolling in the settings dialog. 

Use browser developer tools for debugging; avoid logging tokens or mailbox content.
