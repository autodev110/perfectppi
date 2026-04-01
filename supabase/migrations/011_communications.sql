-- Communications: conversations, messages

CREATE TYPE message_status AS ENUM (
  'unread',
  'read',
  'archived'
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  has_attachment boolean NOT NULL DEFAULT false,
  attachment_url text,
  attachment_type text,
  status message_status NOT NULL DEFAULT 'unread',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX messages_sender_id_idx ON messages(sender_id);
