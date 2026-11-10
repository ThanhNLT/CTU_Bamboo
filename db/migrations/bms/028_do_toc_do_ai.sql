-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

ALTER TABLE core.ai_question
    ADD COLUMN IF NOT EXISTS first_token_at timestamptz,
    ADD COLUMN IF NOT EXISTS cold_start boolean;
