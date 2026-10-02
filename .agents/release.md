# Releases and deployment

Use [RELEASE.md](../RELEASE.md) for dated deployment evidence, remaining gates
and backend alternatives. Do not replace historical observations with assumptions.

The default branch is `gh-pages`, but GitHub Pages publishes through Actions,
not by serving that branch directly. PRs and default-branch pushes validate only;
feature-branch pushes do not duplicate PR checks.
Production releases require a stable `vMAJOR.MINOR.PATCH` tag matching
`package.json`, whose commit belongs to the default branch.

Default-branch CI installs locked dependencies, runs Node checks and the
mainstream Playwright golden thread, builds `dist/`, and dry-run bundles the
Worker without deploying it. It stamps version/commit provenance and seals
`office-dashboard.tar.gz`, `SHA256SUMS` and `site-manifest.json` in the immutable
`release-site` artifact, retained for 30 days.

Stable tags and release dispatches **promote that tested artifact**; they do not
install application dependencies, rebuild or rerun browser tests. Promotion
requires the exact tagged commit on the default branch, matching package and
lockfile versions, a successful default-branch push run of `pages.yml`, and its
single unexpired artifact. It verifies GitHub's ZIP SHA-256, the sealed site
archive SHA-256, the run/attempt, and a deterministic digest of all four public
`VITE_` identity/service settings. Archive paths, file types and contained
`release.json` must also pass before Pages receives the original site bytes.
Missing/expired artifacts, mismatched configuration or failed validation stop
the release; there is no rebuild fallback. If public configuration changes,
create a new version/source commit and validate it on the default branch before
tagging. Old releases without a sealed manifest remain available through the
original-archive rollback workflow, not this promotion path.

The site publishes through the protected `github-pages` environment with the
existing serialized deployment group and HTTPS provenance verification before
creating release assets.
Version tags are immutable; update the package and lockfile together for a new
version. Build/public configuration changes are not deployed merely by editing
repository files or merging a PR.

Cloudflare proxies the custom domain to GitHub Pages. Verify public HTTPS,
origin TLS, GitHub certificate status and live `release.json` independently.
Cloudflare edge HTTPS is not proof of Pages certificate provisioning.

Node device-code and Cloudflare Phone Link services need their own hosting,
configuration, secrets, tests, deployment and rollback. The Pages workflow does
not deploy either backend. Installing Node or Wrangler, logging in to Cloudflare,
creating D1 resources and deploying are distinct actions.

The independent, manual **Phone Link release** workflow uses an accepted
default-branch SHA/tag, locked tooling, required human environment reviewers,
an immutable Worker artifact and a sanitized deployment receipt. Deploy and
explicit-version rollback share their own serialized concurrency group with
separate, confirmed additive D1 initialization. Normal deploy and rollback never
apply SQL; initialization never deploys code. The dispatch tooling can release
an older accepted source without requiring identical historical helpers, and
records both source and tooling provenance. Runtime secrets are never rotated
by a release.
See [Worker CI/CD](worker.md#independent-worker-cicd) for onboarding, scoped API
credentials, environment variables and rollback compatibility. The environment
and credentials must be configured before that workflow can release; adding
the workflow does not prove they exist or that a live release has run.

Rollback restores the original release archive/checksum rather than rebuilding
with current configuration. Verify restored provenance over HTTPS and coordinate
queued deployments. Do not roll back to the legacy implicit-authentication app
or a known vulnerable release.

Do not commit, push, merge, tag, publish, change DNS or change cloud/repository
settings unless the user's authorization covers that action. Passing checks is
not authority to bypass branch rules, approval gates or tenant policy.
