# Migration policy

Database version, backup format version, and user-definition revisions are separate.

Observation editing uses the existing namespaced extension mechanism and existing `deletedAt` field. History has its own version (1); unsupported or corrupt histories are rejected before writes/imports. No backfill is performed; unedited observations need no extension. History is an app-maintained audit trail, not a cryptographic or tamper-proof log.

Current release: database v2, portable format v2. The database keeps its original `breadcrumb-health-v1` name. The v1-to-v2 upgrade transaction only adds the `photoAssets` store with `id` and `profileId` indexes; it does not rewrite existing records or definitions. A legacy-database fixture verifies preservation of existing records and the active profile. Existing tabs close their database connections on version-change; this build shows a reload notice. Close older tabs if an upgrade is blocked. Static service-worker updates remain user-controlled, so finish unsaved work before reopening.

Portable v1 backups are upgraded in memory by setting `formatVersion: 2` and adding an empty `photoAssets` array, then validated and merged transactionally. The source file is never modified. V2 exports include all photo originals; prior builds reject the new format. Unsupported versions fail without writes. Export a private backup before updating; future data-changing migrations still require the recovery safeguards below.

Medication and episode interfaces use the existing v1 shapes and require no storage migration. Schedule revisions now explicitly supersede earlier revisions at their effective start; this is computed when reading, without rewriting old end timestamps. Imported schedule histories must satisfy the same ordered, non-overlapping revision rules.

For each future upgrade:

1. Add a new immutable, ordered migration with fictional input/output fixtures.
2. Validate a recoverable pre-upgrade snapshot; verify space before data-changing conversion. Block with a clear explanation if recovery cannot be established.
3. Run IndexedDB store/index/data changes transactionally. Do not add unrelated network operations inside database transactions.
4. Never invent symptom values, doses, exact times, wellness, or adherence states.
5. Coordinate open tabs; old connections close on version-change. Add and test a visible reopen flow before shipping a database upgrade.
6. Convert supported older backup formats in a staging step; validate the full graph before one transactional commit.
7. Preserve extension data. Reject newer unsupported formats without touching current records.

Current import behavior is already transactional: preview validates and checks conflicts, then commit rechecks against current data inside the write transaction. Equal IDs/content are skipped; different content under the same key aborts. Restore retains preexisting profiles. No existing records are silently overwritten.
