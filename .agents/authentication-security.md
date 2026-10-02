# Authentication and security

## Existing browser sign-in

Preserve MSAL authorization code with PKCE, exact registered redirect URIs and
MSAL-managed session storage. Keep ordinary reload restoration distinct from
explicit Login and account selection. Do not create a custom persistent browser
token cache, restore implicit authentication or introduce a redirect loop.

Match the authority to the registration's account audience. An organizational
guest profile does not prove access to a personal mailbox. An optional URL email
is only a sign-in hint, never proof of ownership or an authorization decision.
Do not log the hint or retain it unnecessarily.

## Phone sign-in alternatives

The owner reports no Tesla-browser Bluetooth support for cross-device passkeys.
Do not propose Microsoft's browser-generated passkey QR as the Tesla solution.

- Node device-code QR asks the phone to enter Microsoft's short user code.
  The existing optional service uses a public-client registration. Its MSAL
  caches and tokens are in server memory; the dashboard credential is in memory.
- Phone Link is the separate authorization-code pairing alternative. Phone
  authentication alone must not sign the car in: require explicit approval of
  the waiting session with an account and matching pairing label.
- A copy-and-continue device-code helper cannot automatically fill Microsoft's
  cross-origin form. Do not invent `verification_uri_complete` support.

Follow the current implementation and [rollout requirements](../RELEASE.md#qr-service-rollout);
do not treat a proposed design as enabled production behavior.
Keep phone and dashboard capabilities distinct, bounded and short-lived.
Validate OAuth state, PKCE, callback binding and authenticated identity.
Reject replay, cancellation, expiry, duplicate approval and session substitution
atomically. Protect phone approval against CSRF, referrer leakage and framing.

For a confidential web service, application credentials belong only in protected
server configuration such as Worker secrets. Tokens persisted server-side need
protected storage and a key-management/cleanup design. Never put Microsoft
tokens, a Tesla session credential or a passkey private key in a QR, URL,
clipboard or public frontend configuration.

## Graph and untrusted content

Preserve delegated, read-only scopes and the service's endpoint/query allowlist.
Validate pagination origins, prevent arbitrary proxy requests, suppress
credentials/referrers where appropriate and do not follow untrusted redirects
with an authorization header. Inbox retains its bounded collection behavior.

Keep email/event HTML in the sandbox with restrictive CSP. Scripts, forms,
links and embeds must remain blocked. Image consent is per-message HTTPS-only,
resets on selection/refresh/reload and is not persisted. No-referrer does not
prevent IP, timing or sender-specific URL tracking. Do not bypass image-host
restrictions by adding a proxy or weakening isolation.

Tests and diagnostics must use synthetic accounts, messages and credentials.
Do not automate a user's password, passkey, consent or administrative approval.
