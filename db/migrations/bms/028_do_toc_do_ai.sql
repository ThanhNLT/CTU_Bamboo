ALTER TABLE core.ai_question
    ADD COLUMN IF NOT EXISTS first_token_at timestamptz,
    ADD COLUMN IF NOT EXISTS cold_start boolean;
