# Breadcrumb

A local-first personal health timeline. A little space for you, named Breadcrumb.

1. You shouldn't have to know what's important before you log it.
2. Logging imperfectly is better than losing the breadcrumb.
3. It's okay to be sick.

## Try Breadcrumb

**[Open Breadcrumb](https://bonitadreama.github.io/breadcrumb/)** · [Getting started](docs/getting-started.md) · [Share an idea or report a bug](https://github.com/bonitadreama/breadcrumb/issues)

An early community preview: free to use, no account needed. Start with a few words, then use Look Back when you want to revisit a moment. Your journal stays in this browser on this device. It will not automatically appear on another device. **Keep private backups**; browser-data clearing and device loss can remove your records.

Desktop Chromium has been tested. Android Chrome is the first phone testing target; physical-device and other-browser testing are still in progress. This is a personal journal, not a diagnostic tool or medication reminder.

## How this was made

Created and directed by [bonitadreama](https://github.com/bonitadreama), a Codex Ambassador, from lived experience with chronic illness.

**ChatGPT helped develop the idea, product principles, and architecture. OpenAI Codex, powered by Astra, helped implement, refine, and test the application.** This project was developed collaboratively with AI assistance; it was not built without that help. The human creator owns the product decisions and release responsibility.

Shared openly so the community can learn from it, use it, and help improve it. An independent community project, not an official OpenAI product or an OpenAI endorsement.

## You are welcome here

You do not need to code to contribute. Clearer wording, accessibility feedback, confusing interactions, and small ideas all help. Please use fictional examples in public issues—never upload your journal backup or medical photos. See [Contributing](CONTRIBUTING.md).

## Run locally

Requires Node.js 22.12+ and npm. No backend or API keys.

```sh
npm ci
npm run build
npm run preview -- --port 4173 --strictPort
```

Open http://127.0.0.1:4173. Use this same URL and browser profile each time: browser databases belong to an origin, so another hostname or port has different storage. The app caches its files after its first production load and can reopen offline in a compatible browser. Development mode (`npm run dev`) does not enable the offline service worker.

For development: `npm run dev`. Tests: `npm test`. Production build: `npm run build`.

## Working now

- One default local profile, no account or selection screen.
- Profiles: create separate local profiles, rename them, choose/order quick actions, and set each journal's default Look Back window. Reopening remembers the last journal used.
- Four starter observation types, exact/backdated/approximate time, optional notes.
- Make it yours: create/edit observation types with optional text, numeric/unit, severity, choice, and yes/no fields. New definitions preserve historical entries.
- Automatic IndexedDB saving. Success only after the transaction commits.
- Edit observation times, notes, fields, and medication records against their original template. Earlier versions remain available in edit history.
- Attach up to six local photos per observation with captions, freehand marks, arrows, and circles. View/zoom in Timeline, Look Back, and edit history. Originals remain unchanged; backups include images and overlays.
- Recoverable deletion with Undo and a per-journal Recently deleted screen; entries are never automatically purged.
- Chronological searchable Timeline with details; no interpolation.
- Look Back around an observation with adjustable before/after windows.
- Medication names with optional scheduled or as-needed/PRN plans and preserved plan history. Explicit taken/skipped logging; actual amounts are never inferred from plans.
- Named episodes with exact or approximate start/end times, Look Back, and observations you mark as related.
- Versioned JSON backup download, validated import preview, transactional restore.
- Identical records are skipped. Conflicting IDs abort the whole restore.
- Mobile layout, native dialog focus trapping, keyboard controls, reduced motion.
- About page, privacy explanation, optional persistent-storage request.

Creating a journal or restoring a backup can introduce additional local profiles; the active name at the top right opens the same local-profile menu as the Profiles button. New journals start with independent starter templates and no copied health records. The original local profile is retained. Profiles are data containers, not security boundaries.

## Deliberately later

Journal archiving/deletion, tag editing, visual timeline tracks, theme controls, CSV and clinician reports. Scheduled occurrence generation and matching doses to planned times are also deferred. No alarms, accounts, cloud sync, or AI interpretation.

## Data and privacy

All health records stay in this browser's IndexedDB. Breadcrumb adds no analytics, third-party fonts, remote assets, or health-data API calls. GitHub Pages serves the application files and may keep ordinary access logs. Local storage and exported backups are not encrypted. Browser-data clearing and device loss can remove records. Keep private backups. This is an early prototype, not a medical device or a substitute for clinical records.

Photos accept still JPEG, PNG, and WebP up to 8 MiB / 40 megapixels each. HEIC requires conversion before attachment. Original files may retain embedded camera/location metadata. This prototype caps encoded photo data at 48 MiB across all journals and history; JSON imports/exports are limited to 100 MiB. Removing a saved attachment keeps it in history and backups; permanent erasure is not implemented.

Read [PRIVACY.md](PRIVACY.md), [the data model](docs/data-model.md), [backup format](docs/export-format.md), and [migration policy](docs/migrations.md).

## Make it yours

See [CUSTOMIZE_WITH_CODEX.md](CUSTOMIZE_WITH_CODEX.md). Source is MIT-licensed. Only use fictional records in tests, screenshots, examples, and issue reports.
