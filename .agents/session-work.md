# Session work, coordination and queued steering

Use a CDL-style work ledger to keep the current goal, workstreams, evidence and
developer steering recoverable across interruptions and handoffs. This adopts
observable practices from agents-live's committed CDL record; it does not
define a `cdl` command, expand its abbreviation or import an unavailable command
contract. See [workflow](workflow.md) for repository refresh and GLP-style
knowledge consolidation.

## Session ledger

For multi-step work, keep one ledger in the app-provided session artifacts
directory, outside the repository. Use JSON or Markdown; do not copy the full
conversation, private content, credentials or machine/account inventories.
No ledger is needed for a trivial one-step lookup.

Record:

- Session identity, repository, branch, logging-start time in UTC and current goal.
- Each workstream's scope, owner/session, status, actual prerequisites, next action
  and completion criterion. Keep active work distinct from queued work.
- Developer decisions and action-specific authorization. Development approval
  does not authorize commit/push/merge/deployment or live authentication.
- Changed paths, tested revision or source fingerprint, artifact/configuration
  digest, environment/tool versions, exact checks and outcomes. Record failed,
  invalidated and skipped evidence as such, not as passes.
- Coordination handoffs, actionable blockers and pending steering, with stable
  item IDs so an acknowledged request cannot be applied twice.
- Learning disposition: `no_change`, proposed, applied or integrated, with a
  pointer to the canonical owning guide or authorized issue.

When logging starts mid-session, label earlier work as a summary captured now;
do not invent historical event timestamps. Update at meaningful boundaries:
new steering, a workstream transition, a blocker, validation, handoff and final
delivery. Do not log every tool call or create receipt-only commit loops.
Capture the final outcome and unresolved work before returning control.

## Non-interrupting steering

An additive request normally joins the pending queue; it does not replace the
current goal or restart a healthy active workstream. Record its scope, priority,
dependencies and authorization, then pick it up at the next suitable boundary.
For example, "also document session coordination" can be queued behind an active
artifact test without discarding that test or its result.

If the developer explicitly says to queue work for another app session, use
`send_session_message` with `delivery_mode: "enqueue"` so it waits behind the
current work. Immediate delivery is for an urgent correction, stop request,
changed authorization, blocker or deliberate redirection, not an ordinary
queued addition. Message delivery does not itself stop a running command.
In this session, preserve the active workstream and track pending additions in
the ledger; there is no separate CDL inbox daemon.

Keep the original user request distinct from coordinator instructions.
Do not reinterpret new work as permission to publish, provision resources,
spend provider credits or perform account acceptance. Ask when priority,
scope or a conflict cannot be resolved from the developer's direction.

## Coordination contract

Use existing app session IDs, not background-agent IDs, to address app sessions.
For approved parallel work, use the app's orchestration guidance and isolated
worktrees. Give each worker a bounded objective, owning paths/contracts,
dependencies, completion criteria and reporting destination. Do not assign
overlapping writers to the same checkout or merge their work automatically.

Send only information that changes the recipient's next action: new decisions,
contract changes, blockers, questions and completed handoffs. Do not repeatedly
poll, forward acknowledgments or copy whole session histories. A handoff states
what changed, exact source/evidence, remaining work and limits; "done" is not
proof of integration, deployment or live acceptance.

Before integrating a dependency, inspect its delivered revision and overlapping
contracts, then run the affected checks. Keep deferred work in the session
queue; move work that must outlive the session into an existing or separately
authorized GitHub issue. Never auto-create issues or persistent automation.

## Source and limits

Source: [agents-live CDL record at f471de0](https://github.com/johnshew/agents-live/blob/f471de02c44d8565d47c8dd541239787f721d199/logs/cdl/20260925T144501Z-132ebc97-622a-4e39-8cff-696681199c58.md).
It separates summarized context, active workstreams, concurrency, authorization,
validation, learning and delivery. It also identifies `.agents/cdl-glp/` as
untracked concurrent work; those command contracts are absent from the reviewed
snapshot. Queued app-message steering above is an Office Dashboard adaptation,
not a claim that this record implements an inbox or session scheduler.
