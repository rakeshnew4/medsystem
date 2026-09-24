CREATE TABLE IF NOT EXISTS ai_assistant_conversations (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  staff_id BIGINT NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(hospital_id,staff_id)
);
CREATE TABLE IF NOT EXISTS ai_assistant_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES ai_assistant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_messages_conv ON ai_assistant_messages(conversation_id,id);