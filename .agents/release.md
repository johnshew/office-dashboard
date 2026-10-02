# Releases and deployment

Use [RELEASE.md](../RELEASE.md) for dated deployment evidence, remaining gates
and backend alternatives. Do not replace historical observations with assumptions.

The default branch is `gh-pages`, but GitHub Pages publishes through Actions,
not by serving that branch directly. Ordinary pushes and PRs validate only.
Production releases require a stable `vMAJOR.MINOR.PATCH` tag matching
`package.json`, whose commit belongs to the default branch.

The CI workflow installs the locked dependencies, validates, builds `dist/`,
dry-run bundles the Worker without deploying it, stamps version/commit provenance
and publishes the site through the `github-pages`
environment. It verifies live HTTPS provenance before creating release assets.
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
explicit-version rollback share their own serialized concurrency group.
Schema initialization is opt-in; runtime secrets are never rotated by a release.
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
