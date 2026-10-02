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

The direct deploy script is for explicitly authorized bootstrap or recovery,
not the normal production release path. After onboarding, use the independent
**Phone Link release** workflow described below. Neither Pages releases nor
ordinary pushes automatically deploy a Worker.

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
| `PHONE_CLIENT_ID` | Worker variable: Entra application's public client ID with the Phone Link Web platform configured |
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

1. Configure an Entra **Web** platform with the intended account audience and
   exact callback `https://<worker-origin>/oauth/callback`. Request only delegated
   `User.Read`, `Mail.Read` and `Calendars.Read`, and obtain required consent.
   The owner selected the existing Office Dashboard registration for both SPA
   and Web platforms. Preserve its SPA callbacks, PKCE and supported account
   types. A separate registration is also possible for independent lifecycle
   management, but is not required. Do not reuse the Node public-client flow's
   assumptions or weaken policy.
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

### Entra registration and credential handoff

Use Entra **App registrations > Office Dashboard > Authentication > Add a
platform > Web** on the existing registration, as directed by the owner on
October 2, 2026. Keep its existing Single-page application platform and all SPA
callbacks unchanged. Its organizational-and-personal-account audience already
matches the dashboard's `common` authority; use that same accepted audience for
Phone Link rather than widening it or changing the browser flow.
Register the **Web** platform with the exact planned service callback. For the
currently inspected Cloudflare account, the proposed new callback is
`https://office-dashboard-phone-link.vanamonde.workers.dev/oauth/callback`.
This is a planned origin, not evidence that the new Worker has been deployed.
Do not add this callback to the SPA platform or enable implicit/public-client
flows as a shortcut.

Reuse the existing Application (client) ID as `PHONE_CLIENT_ID`, not the Object ID.
Add only the three delegated Microsoft Graph permissions in the configuration
contract above and obtain any policy-required consent in Microsoft's UI.
Create a server credential under **Certificates & secrets** with a bounded
expiration and a documented owner/renewal date. Enter its **value**, not its
secret ID, directly into the new Worker's protected `PHONE_CLIENT_SECRET`
configuration or an interactive Wrangler secret prompt. Never paste it into
chat, a GitHub variable, a shell command argument or this guide.

Generate a separate cryptographically random 32-byte base64url encryption key
and write it directly to `PHONE_ENCRYPTION_KEY` through protected secret input.
Do not regenerate it in CI or on each deployment. Neither server secret belongs
in GitHub's public build variables; the workflow's Cloudflare deploy credential
is a different secret with different permissions. Test credential expiration
and plan rotation before relying on the service for a shared screen.

Pairing requires explicit approval after phone authentication. Do not auto-link
on callback, log callback codes, expose Microsoft tokens to the browser, or proxy
arbitrary Graph URLs. Follow [authentication and security](authentication-security.md)
and [release gates](../RELEASE.md#qr-service-rollout).

## Independent Worker CI/CD

`.github/workflows/phone-link.yml` releases only
`office-dashboard-phone-link`. It does not deploy the existing
`office-dashboard-pairing` relay, publish Pages, create D1 databases, register
Entra applications or generate/rotate authentication secrets.

Before the first automated release, provision the dedicated D1 database and
configure both Worker secrets through protected operator input. Bootstrap
onboarding is an explicit operation, not an implicit fallback when release
preflight fails. Configure the production GitHub environment
**`cloudflare-phone-link`** with required human reviewers and restrict deployment
branches to `gh-pages`. Do not automatically approve that environment from an
agent. Optional self-review prevention requires a second authorized maintainer
who can approve the dispatcher's deployment.

Pinned Wrangler can create an empty draft Worker when the first
`secret put` targets a missing Worker. Use the explicit new name, never the
legacy relay name:

```powershell
npm.cmd exec --no -- wrangler secret put PHONE_CLIENT_SECRET --name office-dashboard-phone-link
npm.cmd exec --no -- wrangler secret put PHONE_ENCRYPTION_KEY --name office-dashboard-phone-link
```

Enter values only at the protected prompts; no command-line value is required.
This draft is a bootstrap side effect, not a deployed/accepted Phone Link
runtime. It does not create/bind D1 or apply the schema. Once both secrets and
the dedicated database exist, the reviewed release workflow supplies the full
configuration and accepted Worker artifact. If bootstrap initialized the schema
already, do not dispatch the separate `initialize` operation again.

| Environment configuration | Value or requirement |
| --- | --- |
| Variable `PHONE_WORKER_NAME` | Exactly `office-dashboard-phone-link` |
| Variable `APP_ORIGIN` | Exact accepted HTTPS dashboard origin |
| Variable `PHONE_SERVICE_ORIGIN` | Exact accepted HTTPS Phone Link origin |
| Variable `PHONE_CLIENT_ID` | Existing Office Dashboard Application (client) ID |
| Variable `PHONE_TENANT_ID` | `common` for the existing accepted organizational/personal audience |
| Variable `PHONE_ACCOUNT_AUDIENCE` | `AzureADandPersonalMicrosoftAccount` for that registration; verify the saved manifest |
| Variable `D1_DATABASE_ID` | UUID of the dedicated `office-dashboard-phone-link` database |
| Secret `CLOUDFLARE_ACCOUNT_ID` | Intended Cloudflare account ID |
| Secret `CLOUDFLARE_API_TOKEN` | Dedicated, account-scoped unattended deployment credential |

Use a least-privilege Cloudflare API token restricted to the intended account:
Workers Scripts edit, D1 edit for explicitly approved schema initialization,
and the account/Workers metadata permissions required by Wrangler and release
preflight. Do not grant DNS, zone administration or unrelated service access.
Verify the token's required operations privately before release; Wrangler OAuth
on a developer machine is not a GitHub Actions credential. The deployed Worker's
`PHONE_CLIENT_SECRET` and `PHONE_ENCRYPTION_KEY` stay Cloudflare-managed, are
checked by binding name only, and are not replaced by each release.

Dispatch **Phone Link release** from `gh-pages`:

1. Choose `deploy` and supply a full accepted default-branch commit SHA or existing
   stable version tag. The selected source must have a successful default-branch
   CI run. The dispatch's default-branch helper runs against that exact source;
   historical sources need not have byte-identical workflow/helper files.
   Application dependencies come from the selected source's lockfile.
2. Normal `deploy` never applies SQL. For separately reviewed additive
   initialization, dispatch `initialize` with the accepted source and
   `schema_confirmation=apply-reviewed-phone-link-schema`. Review the exact
   `workers\pairing\schema.sql` first: this is only the idempotent creation of
   `phone_slots` and `phone_expiry`, not a general migration mechanism. Existing
   relay tables/data must remain untouched. Initialization does not build or
   deploy Worker code; future migrations require a separate reviewed change.
3. Review source/configuration and approve the protected environment. The workflow
   builds without cloud credentials, preserves the exact bundle/configuration
   with SHA-256 provenance, then deploys those bytes with `--no-bundle`.
   The schema artifact exists only for `initialize`, not normal deployment.
4. Verify the deployment receipt's Worker version, exact source and readiness.
   Health checks require valid Worker configuration and a functioning D1 schema;
   active-deployment readback must identify the intended 100% Worker version.
   These checks do not establish Microsoft consent or actual phone acceptance.

Deploy and rollback share `production-cloudflare-phone-link` concurrency with
initialization and no cancellation of an in-flight operation. Artifacts record
application SHA, dispatch tooling SHA, package version and file digests.
Artifacts and sanitized receipts are retained for 90 days; retain accepted
release evidence independently if needed
longer. Failed readiness is reported, not hidden by an automatic schema/secret
rollback. A preflight receipt does not confirm a cloud change. A pending
post-operation receipt means cloud state changed but acceptance did not pass.

For rollback, dispatch the same workflow with `operation=rollback`, an accepted
source for the public configuration contract, the exact existing
`rollback_version_id`, and
`rollback_confirmation=compatible-schema-and-secrets`. No SQL is applied as part
of rollback. The workflow validates public bindings, secret binding names and
the dedicated database before switching to that existing version without a
rebuild. Confirm actual secret/key and data compatibility operationally: matching
names alone cannot prove old encrypted sessions remain readable.

The release workflow installs dependencies once and relies on the selected
commit's successful full CI instead of rerunning a parallel validation job.
It builds the accepted source once, using locked Wrangler to parse the existing
JSONC configuration and emit a public JSON deployment configuration. Wrangler
owns its configuration syntax/validation; there is no custom JSONC parser,
configuration-key allowlist or SQL parser. Changing the pinned Wrangler version
must include checking its `experimental_readRawConfig` API and the dry-run
bundle path. Cloud operations are direct Wrangler deploy/D1/rollback commands;
the small helper retains source, artifact, target and readiness checks.
Neither build nor dependency installation receives Cloudflare credentials.
Provider diagnostic output stays private; failure is explicit and may require
operator investigation, since cloud state can change before a check fails.

## Rollback boundary

Keep the tested Worker revision, configuration contract and compatible schema
available for rollback. Restore a compatible service revision and retire/revoke
affected sessions where needed; do not downgrade encrypted storage or bypass
configuration errors. Dashboard release-archive rollback restores Pages only,
not D1, Worker code or secrets.
