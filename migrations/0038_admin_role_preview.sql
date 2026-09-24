CREATE TABLE IF NOT EXISTS admin_role_preview_sessions (
  id bigserial PRIMARY KEY,
  token text NOT NULL UNIQUE,
  admin_user_id text NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '8 hours')
);
CREATE INDEX IF NOT EXISTS idx_admin_role_preview_token ON admin_role_preview_sessions(token);