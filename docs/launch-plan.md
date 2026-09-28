# Breadcrumb early-preview launch

## Target

Share a public early preview and the MIT-licensed source. Serve the existing static app at a stable HTTPS origin. Journals, photos, and annotations continue to live in each visitor's browser; no health-data backend, accounts, or synchronization is part of this release.

This is a proposed release plan, not confirmation of publication. As of this review, the local repository has no configured remote or public deployment.

## Release work, in order

1. Choose the public repository owner/name and stable website address. Configure a private security-reporting route. Keep fictional test outputs, backups, personal attachments, and local tooling out of the release.
2. Make the first visit explain local browser storage, private backups, and the absence of account-based recovery. Clearly disclose that saved photos removed from entries remain in history/backups, and permanent erasure within the app is not yet available. Distinguish host access logs from health records, which the app does not upload.
3. Check the deployed candidate on an actual phone: attach a photo, verify its orientation, draw a mark, save/reopen, open Look Back, download a backup, and restore into a separate test browser. Check desktop keyboard use, offline reopen, and update behavior. Use only fictional data. A phone-sized Chromium viewport has already been checked; it is not a substitute for this device check.
4. Run the production build and regression suite against the release candidate; check the actual host's security headers, static-only network requests, and cache/update behavior. Existing baseline: 41 tests pass, with byte-for-byte photo backup verification and fresh-browser restoration.
5. Prepare a short demo and announcement, then publish the verified candidate and source. Check both public links before announcing. Label it an early preview with supported/untested browsers stated plainly.

Do not change the website origin casually after launch: browser storage belongs to its origin. Moving to another domain requires users to export and restore their journals.

## Announcement draft

I made Breadcrumb because I needed somewhere to leave the little things I couldn't keep track of when I was sick.

A feeling. A change. “Something feels off.” A photo of the spot that hurt.

You can log it without knowing what it means, then use Look Back to see what you recorded around that moment. Photos can have captions, arrows, circles, and handwritten marks.

It's free and open source. Your entries stay in your browser on your device. There are no accounts or automatic cloud backups, so please keep a private backup of anything you want to keep.

This is an early preview, built from my experience with chronic illness, conversations with ChatGPT, and Astra in Codex. It doesn't diagnose or interpret your symptoms.

It's okay to be sick. You don't have to log perfectly.

[Insert verified app link]
[Insert verified source link]

## Later

Clinician-friendly exports, themes, tags, and further customization can follow feedback. Hosted accounts, cloud storage, and AI interpretation would require separate design and review and are outside this release.
