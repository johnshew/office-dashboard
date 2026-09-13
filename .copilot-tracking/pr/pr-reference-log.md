---
title: Account Chooser Release Review
description: Review evidence for the four-file 0.3.1 account chooser release candidate.
---

## Summary

Commit a0c57cbb40ae3cce4e6c188738ae5370935bc91e changed four code/version files.
At the user's request, commit 9a2bd2a added the README update and its linked agent
guides to this release. The initial reference and chunk review predated that commit.

## Changes by Significance

* Explicit browser Login requests the Microsoft account chooser. Reload restoration,
  silent renewal, delegated scopes and static hosting remain unchanged.
* The existing identity test suite gained a request-contract regression test.
* Package and root lockfile versions changed to 0.3.1 without dependency changes.

## Review Findings

Two read-only reviews found no blocking implementation defect. The chunk review
noted that assertions in mocked device logout can be swallowed by the production
best-effort cancellation path; cancellation completion ordering has limited coverage.
The chooser request is asserted outside that path. Real Microsoft acceptance is
still required and is not established by mocks.

## Verification

* 36 Node tests passed locally.
* 12 desktop/mobile browser tests passed with the existing Edge installation.
* The TypeScript/Vite build passed; npm audit reported zero vulnerabilities.
* Local production configuration validation could not run because VITE_CLIENT_ID
  was absent. No placeholder was substituted.
* GitHub run 34776809957 succeeded for the exact candidate commit. Tag-only
  production configuration validation, deployment and live acceptance remain pending.
* Seven documentation files passed frontmatter and relative-path validation.
  Combined-candidate CI is pending. The temporary browser override was removed.
  No backend or permission expansion was introduced.

## Issue References

None.