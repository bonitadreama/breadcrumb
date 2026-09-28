# Make this space yours

Open this repository in Codex. Describe the experience you want. For example:

> Add an optional posture field to my symptom entries. Keep existing entries intact and let me log without selecting a posture.

> Add a weather observation template, with pressure and a unit. Do not upload my records to a weather service.

> Make the interface more playful while preserving reduced motion, contrast, and a plain-language option.

## Where changes belong

- Starter definitions: `src/templates/defaults.ts` (new profiles only).
- Domain types and runtime schemas: `src/domain/types.ts`.
- Reference and historical-value validation: `src/domain/validation.ts`.
- Storage: `src/storage/`.
- Appearance: `src/themes/app.css`.
- Screens: `src/app/` and `src/features/`.

Existing users' definitions are not replaced by changing templates. New revisions must preserve old definitions. Add namespaced extension data such as `my-fork.weather` for fork-specific additions. The JSON backup path preserves extensions; core schema changes need a documented new format/migration.

Use **Make it yours** beside Leave a breadcrumb to create or edit observation types inside the app. Fields can be text, number with optional unit, severity, choices, or yes/no. Fields remain optional when logging. New types appear first among quick actions; all types are available in the logging selector. Changes create immutable revisions; past entries keep their original names, fields, and scales.

For code-level additions, keep fields optional, use fictional tests, and test backup/restore after data-model changes.

Use **Profiles → Customize** to rename a journal, choose/order its home-screen quick actions, and set its default Look Back window. These preferences are saved per journal and included in backups. New episodes copy that journal's window when created; previously saved episodes retain their own window. **Add a profile** starts a separate local container with fresh starter templates. It does not copy records or grant private access to another person.
