-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

CREATE TABLE core.external_module (
    module         text PRIMARY KEY REFERENCES core.module_install ON DELETE CASCADE
                   CHECK (module ~ '^x_[a-z0-9_]{2,30}$'),
    name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    description    text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
    vendor         text CHECK (length(vendor) <= 120),
    version        text CHECK (length(version) <= 40),
    base_url       text NOT NULL CHECK (base_url ~ '^https?://[^/?#]+(/[^?#]*)?$'),
    entry_path     text NOT NULL DEFAULT '/' CHECK (entry_path ~ '^/'),
    health_path    text CHECK (health_path ~ '^/'),
    depends        text[] NOT NULL DEFAULT '{}',
    scopes         text[] NOT NULL DEFAULT '{}'
                   CHECK (scopes <@ ARRAY['org.read', 'people.read', 'notify.send']),
    menu           jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(menu) = 'array'),
    key_salt       bytea NOT NULL CHECK (length(key_salt) = 16),
    key_sha256     bytea NOT NULL UNIQUE CHECK (length(key_sha256) = 32),
    registered_at  timestamptz NOT NULL DEFAULT now(),
    registered_by  text
);

ALTER TABLE collab.notification
    DROP CONSTRAINT notification_kind_check,
    ADD CHECK (kind IN ('TASK_ASSIGNED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_RETURNED',
                        'REQUEST_CANCELLED', 'COMMENT', 'MENTION',
                        'IC_ORDER_NEW', 'IC_ORDER_CONFIRMED', 'IC_ORDER_REJECTED', 'IC_ORDER_CANCELLED',
                        'HR_DECISION',
                        'PROCESS_PUBLISHED', 'PROCESS_CHANGE_REQUESTED', 'PROCESS_CHANGE_RESOLVED',
                        'PROCESS_AUTOMATION', 'SECURITY', 'EXTERNAL'));
