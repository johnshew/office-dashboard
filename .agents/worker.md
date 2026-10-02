# Phone Link Worker development and rollout

Phone Link is an optional Cloudflare Worker, not a Node device-code endpoint
and not a GitHub Pages function. The 0.4.0 candidate implements it; live account,
phone and parked-Tesla acceptance are still required before production enablement.

## Reproducible local tools

Follow [setup](setup.md) for Node 24 and PowerShell PATH repair.
Wrangler **4.147.0** is a pinned development dependency in the npm lockfile.
Restore with `npm.cmd ci`, not a global Wrangler installation.

These existing npm scripts select `workers\pairing\wrangler.jsonc`:

| Command | Effect |
| --- | --- |
| `npm.cmd run build:worker` | Bundle with `wrangler deploy --dry-run`; no live deployment |
| `npm.cmd run schema:worker:local` | Apply the schema to local D1 only |
| `npm.cmd run dev:worker` | Start local HTTPS Worker development |
| `npm.cmd run deploy:worker` | Deploy remotely; requires separate rollout authorization |

Use `npm.cmd exec --no -- wrangler --version` to inspect the declared CLI.
Do not use a missing global command or an undeclared `npx wrangler` download
as evidence of the project's installed version.

Local development still needs explicit service configuration. Missing identity,
origin, database or secret settings fail closed; a build is not a configured
authentication service. Never disable TLS checks to accept a local certificate.
Keep any `.dev.vars` file beside the Worker configuration untracked and out of
logs. Use synthetic fixtures for automated tests, not real account credentials.

## Configuration contract

| Setting | Location and meaning |
| --- | --- |
| `APP_ORIGIN` | Worker variable: exact dashboard origin, no path/trailing slash |
| `PHONE_SERVICE_ORIGIN` | Worker variable: exact HTTPS Worker origin |
| `PHONE_CLIENT_ID` | Worker variable: separate Entra web application's public client ID |
| `PHONE_TENANT_ID` | Worker variable: approved tenant UUID or matching `organizations`/`common`/`consumers` audience |
| `PHONE_CLIENT_SECRET` | Worker secret: confidential web application's credential |
| `PHONE_ENCRYPTION_KEY` | Worker secret: base64url-encoded 32 random bytes for persisted-token encryption |
| `PAIRING_DB` | D1 binding: database selected in `wrangler.jsonc` |
| `PAIRING_RATE_LIMITER` | Cloudflare rate-limit binding configured in `wrangler.jsonc` |
| `VITE_PHONE_LINK_URL` | Public frontend build variable: exact HTTPS service origin; unset means disabled |

The checked-in service origin/client/database fields are placeholders, not a
claim that resources or credentials exist. The public frontend must never
contain Worker secrets. `VITE_DEVICE_LOGIN_URL` remains the independently hosted
Node device-code alternative; it is not interchangeable with Phone Link.

## Database and session lifecycle

Apply `workers\pairing\schema.sql` to the chosen D1 database before enabling.
It creates the `phone_slots` table for the new implementation. An existing
PR #62 `relay_slots` table is not converted or used, and the old code-relay API
is replaced. Prefer a dedicated Phone Link database; if migrating an existing
service, plan old-session cleanup and rollback explicitly. Do not operate old
and new service versions concurrently against assumed compatible APIs.

There are ten pending/active slots. Pending pairings expire after ten minutes;
approved sessions expire after at most eight hours. Tokens are AES-GCM encrypted
at rest, and refresh leases/state transitions use D1. Scheduled cleanup removes
expired rows. Keep the encryption key stable across deployments and instances;
changing it without clearing the affected sessions makes existing ciphertext
unreadable. Rotation is an authorized maintenance operation, not a silent fallback.

The dashboard holds only its service credential in memory. Reload requires a
new Phone Link login; logout deletes the corresponding server session. Worker
restart alone does not clear persistent sessions. Phone and dashboard capabilities
are distinct; possession of a QR cannot directly authorize a dashboard session.

## Authorized production setup

After a separate backend rollout approval:

1. Register an Entra **web** application with the intended account audience and
   exact callback `https://<worker-origin>/oauth/callback`. Request only delegated
   `User.Read`, `Mail.Read` and `Calendars.Read`, and obtain required consent.
   Do not reuse the Node public-client registration's assumptions or weaken policy.
2. Provision/select D1, set the actual database ID and Worker variables, and apply
   the schema to that database. The local schema npm script does not do this remotely.
3. Set the two server secrets through protected Cloudflare secret configuration.
   Keep values out of source, command arguments, screenshots and agent transcripts.
   Protect access to D1 and encryption keys and define controlled key rotation.
4. Run source/browser tests and both builds, then deploy the accepted Worker
   revision separately from Pages. Verify meaningful service readiness and the
   exact callback, approval, expiry, cancellation, capacity and logout boundaries.
5. Complete real Microsoft/phone acceptance, including whether a local passkey is
   offered. A passkey is an account/provider capability, not a guaranteed UI choice.
   Confirm that the account and matching pairing label are shown before approval.
6. Configure `VITE_PHONE_LINK_URL` in the dashboard's public build settings and
   publish a new accepted version through the existing tag-gated Pages workflow.
   Test the parked car on its recorded firmware/browser version.

Pairing requires explicit approval after phone authentication. Do not auto-link
on callback, log callback codes, expose Microsoft tokens to the browser, or proxy
arbitrary Graph URLs. Follow [authentication and security](authentication-security.md)
and [release gates](../RELEASE.md#qr-service-rollout).

## Rollback boundary

Keep the tested Worker revision, configuration contract and compatible schema
available for rollback. Restore a compatible service revision and retire/revoke
affected sessions where needed; do not downgrade encrypted storage or bypass
configuration errors. Dashboard release-archive rollback restores Pages only,
not D1, Worker code or secrets.
