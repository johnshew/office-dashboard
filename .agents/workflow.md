# Repository freshness and instruction maintenance

This guide adopts the observable repository-update and learning-consolidation
practices from agents-live's committed CDL records and GLP updates. Its actual
CDL/GLP command contracts were not tracked in the reviewed snapshot, so this
guide does not invent abbreviation expansions, aliases or automatic commands.

## Start work with current evidence

Read `AGENTS.md` and the task guide, then inspect this worktree:

```powershell
git status --short --branch
git branch --show-current
git fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw 'Remote refresh failed; upstream state is not current.' }
git rev-list --left-right --count HEAD...origin/gh-pages
git log --oneline HEAD..origin/gh-pages
```

`gh-pages` is this repository's default branch, not a reason to switch away from
an app-managed feature worktree. Fetch updates remote evidence without merging
or changing working files. Inspect the intended task base and any open dependent
work; a clean default branch can still omit an unmerged Worker implementation.

Use the isolated worktree already provided by the app. Do not access or change
the main checkout to obtain a cleaner starting point. Preserve concurrent edits,
including unrelated hunks in a file this task also changes.

Only in a clean checkout already on the intended default branch, with no local
commits/work to preserve, is this default-branch synchronization appropriate:

```powershell
git pull --ff-only origin gh-pages
if ($LASTEXITCODE -ne 0) { throw 'Fast-forward failed; inspect divergence without resetting.' }
```

Do not run that pull blindly on a feature branch. Do not use checkout/reset/stash
to remove someone else's work, add incidental synchronization merge commits or
rewrite a published/shared branch. Rebasing unshared work requires an intentional
base decision and renewed inspection/testing of overlapping code; rewriting
shared history requires explicit approval.

## Refresh at meaningful checkpoints

Fetch again after long implementation/validation and before any authorized
publication. Inspect upstream changes that overlap this task even when Git
reports no textual conflict. A test result belongs to the exact source tested;
subsequent concurrent code edits can invalidate it.

Review diffs by hunk before staging and exclude unrelated work without removing
it from the working tree. A successful CI run does not authorize merging,
tagging, deployment, DNS changes or provisioning a Worker/D1 database.

After an authorized merge, fetch and prove the exact tested commit is included:

```powershell
git fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw 'Post-merge refresh failed.' }
# Replace the placeholder with the full tested commit, not a guessed branch head.
git merge-base --is-ancestor <tested-commit> origin/gh-pages
if ($LASTEXITCODE -ne 0) { throw 'The tested commit is not confirmed in the default branch.' }
```

The placeholder must be replaced before execution. Default-branch pull, deployed
`release.json` verification and actual phone/vehicle acceptance are separate
outcomes. Remove only task-owned resources, through the app's lifecycle when
app-managed. Stop task-owned servers by their exact PID, never by process name.

## Keep goals and workstreams open until their own acceptance

Keep one parent-owned goal record with separately tracked workstreams,
prerequisites, evidence and blockers. Carry it across reviews, side questions and
child handoffs. A completed review, passing CI, merged source or finished child
does not complete a goal that still requires deployment or real phone acceptance.
These continuity and delegation requirements follow the owner's request and
the app's session contracts, not an unverified CDL/GLP command contract.

Continue independent, authorized work while another workstream is blocked.
Give a delegated child its exact scope, source/base, constraints, required
validation and delivery boundary; keep credentials and live acceptance with
their designated owner. Read back its tested source, results and limitations
before accepting only that workstream's completion.

Record human-only credential, consent and approval gates as blocked, not done.
Coordinate protected input without copying credentials into conversation or
bypassing required review. Do not claim overall completion while unblocked work
remains; when only genuine human gates remain, report those precise gates and
keep the overall goal open. Store requested CDL-style progress privately, with
observed UTC events and explicitly retrospective earlier history, rather than
publishing raw transcripts or inventing executable aliases.

## Consolidate learnings without duplicating policy

For a meaningful behavior or process discovery:

1. Compare the evidence against the current owning guide before editing.
   If already covered, record `no_change`; an update is not mandatory.
2. Identify whether it is a correction, addition or supersession. Capture what
   changed, source evidence, previous understanding, verification/limits and
   follow-up, without private data or copied session transcripts.
3. Update the canonical owning guide. Keep task routing, README/setup instructions,
   package scripts, CI configuration and release evidence aligned where affected.
   Thin tool adapters point to `AGENTS.md`; they do not become competing policies.
4. Read back commands, paths, links, version claims and authorization boundaries.
   Distinguish a local change being applied from consolidation being complete.
5. Keep proposals explicitly pending until implemented and validated. Actionable
   deferred engineering work belongs in an authorized GitHub issue, not a new
   competing instruction file. Do not create an issue without user authorization.

Current controlling instructions remain in effect until a replacement is
intentionally accepted. Source tests, installed tools, deployed artifacts and
live acceptance need their own evidence. Knowledge consolidation cannot grant
new operational permissions.

If a receipt or documentation checkpoint is the only remaining change, perform
the required readback once; do not create an endless sequence of commits/receipts
because each receipt changes the repository.

## Source and scope

Reviewed source: [agents-live at f471de0](https://github.com/johnshew/agents-live/tree/f471de02c44d8565d47c8dd541239787f721d199),
particularly its `AGENTS.md`, `.agents/development.md`,
`docs/development-release-process.md` consolidation entries and committed
`logs/cdl/` examples. These patterns are adapted to this SPA's `gh-pages`,
tag-gated Pages deployment and optional backends. They do not import its Python
release tooling or establish `cdl`/`glp` as executable commands in this repository.
