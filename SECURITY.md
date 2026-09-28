# Security

Report vulnerabilities privately using [Report a vulnerability](https://github.com/bonitadreama/breadcrumb/security/advisories/new), or the repository's **Security** tab. Use a minimal fictional reproduction without health records, photos, backups, secrets, or identifying information. Do not publish sensitive vulnerability details in Issues. This is a volunteer project; no response-time guarantee is offered.

## Current scope

Breadcrumb is an early browser-only journal. GitHub Pages serves static application files; it does not receive journal entries or photos from the app. There are no server accounts or sync. Profiles do not provide authentication or encryption. Browser records and exported backups are not encrypted.

The website host can receive ordinary request metadata and keeps control of delivery of application code. Browser storage belongs to the origin, so other code served from that origin may access it. Protect the publishing account and device. No HIPAA-compliance claim is made.

Backups and imports undergo schema and reference validation. Corrections and recoverable deletion retain previous contents, including removed photos; permanent erasure within the app is not yet implemented. Browser data clearing and device loss can remove local records. Keep private backups.

Changes involving server-side health data, authentication, cloud sync, or automated interpretation need a separate design and review. Do not add them as incidental dependencies or telemetry.
