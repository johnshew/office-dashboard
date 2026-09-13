---
title: Static SPA Release Procedure
description: Use for release preparation, authorized Git publication, GitHub Pages deployment, provenance verification and rollback.
---

## Sources of truth

Read [current release status](../RELEASE.md#current-status),
[remaining acceptance](../RELEASE.md#remaining-acceptance-and-hardening),
[Pages workflow](../.github/workflows/pages.yml) and
[rollback workflow](../.github/workflows/rollback.yml) before release work.
Historical setup checkpoints do not supersede the latest dated status.

The default branch is currently `gh-pages`; verify origin rather than assuming
`main`. The source branch name does not mean GitHub should serve repository source.
Pages must use Actions and upload only the built `dist/` artifact.

## Prepare an authorized release

1. Confirm authorization covers commits, pushes, PR merge and production publication.
   Inspect the dirty worktree; preserve unrelated work. Fetch origin and verify
   branch freshness before choosing a new version or tag.
2. Keep the change focused. Run [validation](testing.md), review the diff and resolve
   failures. An audit without findings is supporting evidence, not a substitute for
   tests. Inspect package and lockfile changes rather than regenerating them blindly.
3. Match the version in [package.json](../package.json) and the root package entries
   in [package-lock.json](../package-lock.json). Use a new stable `vMAJOR.MINOR.PATCH`
   tag. Never move an existing published tag or replace its original release assets.
4. Submit through the agreed PR/review process. Require the `Validate` check and
   required reviews before merging. A green run does not prove branch protection
   is configured. Do not use an admin bypass or change protections to unblock work.
5. Tag the accepted default-branch commit. The workflow requires the tagged commit
   to be an ancestor of origin's default branch and the tag to match package version.
   Ordinary branch pushes and PRs run validation but do not deploy.

Use concise, imperative commit messages that explain the actual change. Do not
stage all files indiscriminately or include temporary overrides, generated bundles,
local environment files, private diagnostics or planning-only commits.

## Configuration and publication

The static release needs valid public `VITE_CLIENT_ID` and `VITE_TENANT_ID` values
matching the saved Entra SPA registration and intended audience. Keep
`VITE_DEVICE_LOGIN_URL` unset. Exact localhost, github.io and custom-domain HTTPS
callbacks must be registered as appropriate. Do not enable implicit grants, public
client flows on the SPA or broader consent as a shortcut for account problems.

The workflow builds after the mocked browser tests, stamps version/commit in
`release.json`, packages the site and checksums, deploys Pages, and compares live
provenance before publishing GitHub release assets. Check every job, not just the
overall existence of an Actions run. Use the exact deployed HTTPS URL; do not permit
an HTTP redirect in an authentication or provenance check.

Verify the live `release.json` matches the intended source commit and version,
and that the GitHub release retains `office-dashboard.tar.gz` and `SHA256SUMS`.
Then report publication separately from user acceptance. Keep known certificate,
HTTPS-enforcement, device and session-renewal gaps explicit; update dated release
status only with observed evidence. Do not claim a local candidate is already live.

If a tag deployment fails, diagnose the failed job. The default-branch manual
dispatch accepts an existing release tag and rebuilds it; it is not permission to
move the tag. A changed workflow can retry unchanged tagged source from that branch.

## Rollback and remaining gates

Rollback uses the published archive and checksum instead of rebuilding historical
source with today's settings. Verify artifact integrity and live restored provenance.
Inspect the current rollback verifier before relying on it: it must use the same
HTTPS-only URL handling as publication. Known gaps are not assumed fixed by prose.

Preserve strict TLS and the exact HTTPS identity callbacks. Changes to custom-domain
DNS, certificates, app registration, consent, hosting or repository rules require
authorization beyond editing the application. Never weaken transport security to
make a rollout appear successful.

If tooling, credentials, approvals or required validation are unavailable, stop at
that boundary and leave a precise handoff. A completion hook cannot grant permission
or establish a deployment. Do not repeatedly retry blocked actions or mark release
work complete without publication evidence.