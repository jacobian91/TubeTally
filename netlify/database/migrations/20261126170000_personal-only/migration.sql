-- Beta reset: remove organization-owned fields without touching any user's personal scope.
DELETE FROM data_scopes WHERE scope_type = 'organization';
ALTER TABLE data_scopes DROP CONSTRAINT IF EXISTS data_scopes_organization_id_fkey;
ALTER TABLE data_scopes DROP COLUMN IF EXISTS organization_id;
ALTER TABLE data_scopes DROP CONSTRAINT IF EXISTS data_scopes_scope_type_check;
ALTER TABLE data_scopes ADD CONSTRAINT data_scopes_scope_type_check CHECK (scope_type = 'personal');
ALTER TABLE data_scopes ALTER COLUMN identity_user_id SET NOT NULL;

DROP TABLE IF EXISTS organization_audit_events;
DROP TABLE IF EXISTS organization_invitations;
DROP TABLE IF EXISTS organization_user_preferences;
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS organizations;

-- Rate limiting for account-signup invitations (no field access or membership).
CREATE TABLE account_invitation_attempts (
  id TEXT PRIMARY KEY,
  invited_by_identity_user_id TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX account_invitation_sender_time_idx
  ON account_invitation_attempts(invited_by_identity_user_id, created_at DESC);
CREATE INDEX account_invitation_email_time_idx
  ON account_invitation_attempts(normalized_email, created_at DESC);
