---
title: Authentication and Graph Security
description: Use for MSAL account selection, token renewal, Graph requests, mailbox rendering and optional device-flow changes.
---

## Browser authentication

[Identity.ts](../samples/tesla/Identity.ts) owns MSAL Browser initialization,
redirect handling, active-account selection, token acquisition and Graph transport.

* Preserve authorization code with PKCE and session-storage token caching managed
  by MSAL. Do not add custom token persistence, implicit grants or client secrets.
* Explicit Login must request account selection with `prompt: 'select_account'`.
  Preserve ordinary reload/session restoration without forcing a chooser on every
  page load. Test the outgoing request, not an assumed Microsoft UI outcome.
* Keep the exact registered SPA redirect URI, including path and trailing slash.
  Match authority to the saved app audience: `common` or `consumers` requires
  personal-account support; a tenant guest profile is not proof of mailbox access.
* Silent token acquisition uses the existing access-token/refresh-token policy.
  Interaction-required errors should lead to a user-initiated login, not a redirect
  loop or attempts to weaken tenant policy.
* `VITE_` values are public build-time configuration. Client/tenant identifiers are
  not credentials, but tokens, secrets and mailbox data must never enter the bundle.
  Keep local configuration untracked; use the example environment as the template.

When investigating a wrong account, distinguish restored application state from
Microsoft SSO cookies and the authorization request. Verify account/audience and
the actual failing endpoint before suggesting consent or permission changes.
Passwords, MFA, passkeys and administrator approvals belong in Microsoft's UI,
completed by the user. Do not capture them through agent tools.

## Read-only Graph contract

Only delegated `User.Read`, `Mail.Read` and `Calendars.Read` are in scope. Use
Microsoft Graph v1.0 over HTTPS. Browser requests and pagination URLs must remain
on the validated Graph origin and `/v1.0/` path with no embedded credentials or
fragments. Preserve `credentials: 'omit'`, `cache: 'no-store'`, redirect rejection,
timeouts and UTC preference. Never attach tokens to arbitrary next-link URLs.

[App.tsx](../samples/tesla/App.tsx) selects Inbox using
`/me/mailFolders/inbox/messages` with attachment metadata expansion. Keep the
40-item limit, cycle detection and ten-page ceiling unless the task explicitly
changes that behavior. Fetch supported inline attachment content on demand.
Calendar uses its bounded date window. Do not add mailbox writes or arbitrary
folder browsing while fixing presentation.

The dormant service has a separate, stricter endpoint/query allowlist. Do not
mistake browser origin validation for that service allowlist. If its contract is
explicitly changed, update both callers and service tests without broadening access.

## Untrusted mail and event content

[ItemViewHtmlBody.tsx](../src/ItemViewHtmlBody.tsx) is a security boundary, not just
a rendering helper. Retain the empty iframe sandbox, restrictive CSP, URL/type
validation, removal of active content and `no-referrer` policy. Do not move message
HTML into the application DOM or add script/same-origin sandbox permissions.

Network content is blocked by default. Supported inline PNG/JPEG/GIF/WebP images
may render. Mail's explicit Show Images action allows HTTPS image requests only
for the current selection; consent resets on selection, refresh and reload and
is never persisted. Calendar stays default-blocked. Links, forms, scripts, embeds
and insecure images remain disabled after consent.

Image hosts can enforce CORS or cross-origin resource policies. Do not bypass
them, add a proxy or weaken isolation. No-referrer does not hide IP address,
request timing or a unique tracking URL. Use synthetic hostile fixtures for tests
and diagnostics rather than a user's mailbox content.

## Device and passkey boundary

The deployed SPA has no dashboard-owned device-code endpoint. Keep the optional
service disabled. Microsoft may offer cross-device passkeys, but an account chooser
does not force a QR option or establish phone/vehicle compatibility. Do not invent
Microsoft query parameters or promise `verification_uri_complete` support.

Any backend/device-service rollout needs explicit architecture approval and the
separate acceptance process in [RELEASE.md](../RELEASE.md#qr-service-rollout).