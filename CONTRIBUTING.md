# Contributing

Thank you for helping make Breadcrumb easier and kinder to use. You do not need to code: usability notes, accessibility feedback, clearer language, and ideas are welcome in Issues. Use the bug or suggestion form and describe the experience you want to improve.

Public discussions must use fictional examples. Never attach journal backups, medical photos, identifying health details, or secrets. For a security problem, use **Security → Report a vulnerability**, not a public issue.

Please be patient and respectful. People using or contributing to this project may have limited energy, brain fog, pain, or fluctuating capacity. There are no participation quotas or expectations of quick replies.

## Code contributions

Open an issue before a large change so we can agree on scope. Small fixes can go straight to a pull request. Explain the problem, what changed, and how you checked it. AI-assisted contributions are welcome; disclose meaningful assistance and review what you submit. Do not send personal journal data to an AI service while developing or testing.

Run `npm ci`, `npm test`, and `npm run build`. Use fictional data only.

Every UX change must uphold the three principles in `docs/product-principles.md`. New fields must not retroactively reinterpret existing observations. All storage and imports pass runtime validation in `src/domain/validation.ts`.

Keep domain logic independent of React. New database versions and portable data versions require migration fixtures and rollback/failure tests. Do not modify released migrations. PRN plans never generate expected-dose occurrences. Missing entries never imply wellness, skipped medication, or noncompliance.
