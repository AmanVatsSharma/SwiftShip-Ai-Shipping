# .beads/ — SwiftShip AI issue tracker

This is a git-backed, JSONL-on-disk issue tracker for the 24-week roadmap
in [`../ROADMAP_24W.md`](../ROADMAP_24W.md).

## Layout

```
.beads/
  config.yaml        workspace config (project name, labels, sync branch)
  issues.jsonl       one JSON object per line; each is a "bead"
```

## Reading

```bash
# Pretty-print the bead list
cat .beads/issues.jsonl | jq -r '"[\(.id)] \(.title)"'
```

```bash
# Filter by epic
cat .beads/issues.jsonl | jq -r 'select(.parent == "EPIC-RATE-ENGINE") | "[\(.id)] \(.title)"'
```

```bash
# Open beads, by priority
cat .beads/issues.jsonl | jq -r 'select(.status == "open") | "\(.priority) \(.id) \(.title)"' | sort
```

```bash
# What's blocked by what
cat .beads/issues.jsonl | jq -r '"\(.id)  blocked_by=\(.blocked_by)"'
```

## Schema

Each line is a JSON object with these fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `SS-NNN` |
| `title` | string | one line |
| `type` | string | `feature` \| `chore` \| `bug` |
| `priority` | string | `P0` (blocker) → `P3` (nice-to-have) |
| `status` | string | `open` \| `in_progress` \| `closed` |
| `labels` | string[] | from `config.yaml` |
| `created_at` | string | ISO date |
| `description` | string | the work contract — read this before opening a subagent |
| `owner` | string | which subagent type picks it up |
| `estimate` | string | human estimate (e.g. `5d`) |
| `blocked_by` | string[] | bead IDs that must be closed first |
| `parent` | string | epic id (`EPIC-TENANCY`, `EPIC-RATE-ENGINE`, etc.) |

## Epics

- `EPIC-TENANCY` — multi-tenant backfill (W1-W4)
- `EPIC-RATE-ENGINE` — live rate shopping + AI ranking (W5-W12)
- `EPIC-NDR` — NDR + RTO automation (W13-W15)
- `EPIC-CUSTOMER-FACING` — branded tracking + return portal + widgets (W16-W18)
- `EPIC-CHANNELS` — Amazon, Flipkart, Meesho, Myntra (W19-W22)
- `EPIC-POLISH` — REST + SDKs + observability (W23-W24)
- `EPIC-TYPEORM-CLEANUP` — weekly PrismaCompat removals
- `EPIC-ENFORCEMENT` — Nx graph CI check

## Conventions

- **Open = not started**. Subagent pulls a bead, flips `status` to `in_progress`, does the work, flips to `closed`.
- **Always include the `id` and the bead's parent epic** in the PR title so `git log --grep='SS-001'` works.
- **Don't close a bead that is `blocked_by` something still open.**
- **The compat shim removal** (`SS-029`) is a weekly ritual — pick the smallest remaining `Still on PrismaCompat` lib from `MIGRATION.md` §4b and migrate it.
- **Cross-bead dependencies in flight.** If a subagent finds its prerequisite lib not yet committed, it must NOT invent the contract — flip the bead to `status: "blocked"`, add the upstream bead id to `blocked_by`, and write a one-line note in the bead's `description` so the next re-dispatch can pick it up cleanly. (See SS-025 for the worked example.)
- **Stale skeleton detection.** A `project.json` + `tsconfig.json` + `tsconfig.lib.json` with no `src/index.ts` and no adapter files is a scaffolded-but-not-implemented lib. Treat it as "in progress upstream", not as a buildable target.
