# First-slice verification — 2026-09-27

## Automated

`npm test`: data-integrity tests cover default-profile initialization, close/reopen persistence, approximate timestamps, invalid-time rejection, window overlap without interpolation, explicit ongoing spans, historical scales, PRN occurrence rejection, cross-profile validation, malformed/future-format rejection, transactional conflicts, repeat import, and complete JSON round trips with tags/extensions.

`npm run build`: TypeScript and production/PWA build pass. Dependency installation audit after updating Vitest reports zero known vulnerabilities.

## Chromium browser checks

Performed through Playwright CLI on the production preview at `http://127.0.0.1:4173` using separate fictional test profiles:

- Minimal observation saved through the UI, page reloaded, record still present.
- Approximate “Yesterday evening” entry retained its confirmed 6–10 PM window and original note.
- Look Back included both nearby entries; changing the after-window to zero excluded the later one.
- Desktop (1440 × 1000) and phone (390 × 844) screenshots inspected.
- JSON download saved, imported, previewed, and confirmed. Identical records skipped.
- Export restored through the UI in a separate fresh browser session. Both entries recovered.
- Keyboard Enter used to open logging and save an entry; native dialog Escape worked.
- Browser network set offline, page reloaded successfully, both saved entries still displayed.
- Browser console reported zero errors/warnings. Request list showed only static app requests.

Screenshots and fictional backup artifacts are under ignored `output/playwright/` and `.playwright-cli/`. They are not user health records and are not included in the source release.

## Custom observation editor follow-up

16 tests pass after adding coverage for custom-type creation, immutable edits and round-trip restoration, stale editors/logging forms, explicit false versus absent values, historical choice validation, invalid scales, and duplicate names. Build passes.

Chromium UI verification: created Head pressure with optional Intensity 1–10; logged 8; renamed to Brain goblin and changed maximum to 3; reloaded. The new quick action and logging form use the new name and scale, while the historical entry still reads Head pressure and 8 (scale 1–10). Editor visually inspected at 390 × 844. New and legacy profile captions display My journal without a storage rewrite.

## Medication and episode follow-up

24 automated tests pass; TypeScript and production/PWA build pass. New coverage includes PRN versus unconfigured plans, no generated dose records, explicit taken/skipped actions, immutable plan revisions and stopping, invalid/stale writes, episode time bounds, related links, backup restoration, and concurrent episode edits.

Chromium UI verification with fictional data: created a PRN medication and confirmed the timeline stayed empty; explicitly recorded 2 tablets; created an episode from that entry; unmarked and re-marked its relation; changed the plan to scheduled and verified both revisions in history with the recorded dose unchanged. Inspected the scheduled-plan form at 390 × 844. Exported the combined backup, restored it into a fresh browser session, reloaded, and reopened the recovered episode in Look Back with its linked dose. Browser console reported no errors. The user's preview was refreshed without adding test records.

## Local journal customization follow-up

28 automated tests pass. New tests cover atomic fresh-profile creation, unique template IDs, record isolation, last-profile persistence on reopen, independent settings, backup restoration, duplicate-name rejection, invalid/cross-profile references, and stale edits. No schema changes or migrations were needed.

Chromium UI check: created a fictional second journal, moved Energy change to the first quick action, removed Pain from quick actions while retaining it in the logging menu, and changed its window to 48 hours before / 0 after. Logged a fictional entry, confirmed those Look Back defaults, switched to the original empty journal, then switched back and reloaded. The entry, selected profile and customized order persisted; the original journal kept its four defaults. Phone settings layout inspected at 390 × 844. Browser console reported zero errors or warnings.

## Observation corrections and recovery

34 tests pass, including immutable correction snapshots, preservation of approximate bounds and original scales, medication-dose corrections, stale edit/undo rejection, invalid history rejection, backup/restore with history, and deletion/restoration retaining episode links. Production build passes.

Chromium with fictional data: saved an observation, corrected its note, verified the original in history, moved it to Recently deleted, undid deletion, deleted it again, waited for saved confirmation, reloaded, and restored it from Recently deleted. Phone editor inspected at 390 × 844. Browser console had no errors or warnings. Reloading before a save transaction completes is not a successful save; verification waits for the committed-success UI.

## Remaining limits

Not yet tested on physical iOS/Android devices, Safari, Firefox, or with a screen reader. Browser storage is not encrypted. Native app packaging and cross-device sync have not been implemented. Only the additive database v1-to-v2 upgrade and portable-backup v1-to-v2 conversion are implemented and tested. This is a local prototype, not a public hosted health service.

## Photos and annotations (2026-09-28)

41 automated tests pass. Added coverage for original-byte preservation, normalized annotations, approximate observation time independent of attachment time, reopen/fresh restore, historical removal/deletion recovery, foreign/missing/malformed photo references including history, atomic rollback, immutable originals, stale writes, v1 backup conversion, and additive v1 database upgrade. Production/PWA build passes.

Chromium production-preview verification in isolated fictional sessions: attached PNG, captioned it, drew/undid freehand, drew an arrow and oval, toggled the original, saved and reloaded. Opened it from Timeline and Look Back, zoomed, and inspected the viewer at 390 × 844. Edited marks at phone viewport size; removed the attachment and opened both prior versions from history. Downloaded a backup and verified its decoded image equals the input file byte-for-byte with both saved overlays. Restored through the UI in a fresh browser session and opened the recovered photo with two annotations. JPEG and WebP selection also succeeded; SVG and animated PNG were rejected without saving. Browser console reported no errors or warnings. Physical touch/stylus and iOS photo orientation are not yet verified.

Evidence: ignored `output/playwright/photo-annotation-desktop.png`, `photo-viewer-mobile.png`, `photo-restored-desktop.png`, and `photos-backup.json`. All use a synthetic illustration, not personal medical imagery.
