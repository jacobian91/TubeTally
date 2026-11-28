# TubeTally

An offline-capable, mobile-first PWA for counting irrigation tube rows and marking them Good, Slow or Fast.

## Data and accounts

- Every saved field belongs to a single person's device or signed-in Tube Tally account.
- Signed-in personal fields sync to Netlify Database. Unsigned users can save locally.
- A field-share URL embeds the report data; opening it starts an immediately editable **independent** field. No server-side collaboration, access permissions, shared ownership, or copy step.
- Opening a shared field prompts before replacing an existing active field, and removes the link payload from the URL so later edits survive refresh.
- Invitations sent from the account panel only invite someone to create their own account; they do not share fields.
- Organizations, organization memberships, organization data scopes and roles are not supported.

## Development and verification

Run `npm ci`, `npm test`, `npm run typecheck:functions`, and `npm run build`.

The [Personal fields browser integration](.github/workflows/personal-ui.yml) workflow tests the actual mobile UI, including field save/refresh, independent share editing, account invitations, and toolbar layout at 320–1024 px. Its `organization-integration` GitHub environment retains the existing test-account email/password secrets (`TUBETALLY_E2E_ADMIN_EMAIL`, `TUBETALLY_E2E_ADMIN_PASSWORD`); the workflow does **not** send live signup invitations.

## Beta migration

`20261126170000_personal-only` deletes **organization-owned** beta field records and membership tables. Personal scopes, fields, snapshots and authentication accounts are retained. Treat this migration as irreversible; approve the PR before merging.
