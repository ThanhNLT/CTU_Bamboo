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

CREATE TABLE search.pending_chunk (
    tenant_id        uuid NOT NULL REFERENCES core.tenant,
    kb_document_id   uuid PRIMARY KEY,
    dirty            boolean NOT NULL DEFAULT true,
    attempts         int NOT NULL DEFAULT 0,
    next_attempt_at  timestamptz NOT NULL DEFAULT now(),
    last_error       text,
    indexed_at       timestamptz,
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pending_chunk_dirty ON search.pending_chunk (next_attempt_at) WHERE dirty;

CREATE FUNCTION search.mark_chunk(p_tenant uuid, p_doc uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO search.pending_chunk (tenant_id, kb_document_id)
    VALUES (p_tenant, p_doc)
    ON CONFLICT (kb_document_id)
    DO UPDATE SET dirty = true, attempts = 0, next_attempt_at = now(), updated_at = clock_timestamp();
    PERFORM pg_notify('search_sync', 'chunk:' || p_doc);
END $$;

CREATE FUNCTION search.mark_all_chunks() RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
    n int;
BEGIN
    INSERT INTO search.pending_chunk (tenant_id, kb_document_id)
    SELECT tenant_id, id FROM collab.kb_document WHERE status = 'APPROVED'
    ON CONFLICT (kb_document_id)
    DO UPDATE SET dirty = true, attempts = 0, next_attempt_at = now(), updated_at = clock_timestamp();
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_notify('search_sync', 'chunk:all');
    RETURN n;
END $$;

CREATE OR REPLACE FUNCTION search.kb_document_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    a record;
BEGIN
    PERFORM search.mark(coalesce(NEW.tenant_id, OLD.tenant_id), 'collab.kb_document', coalesce(NEW.id, OLD.id));
    PERFORM search.mark_chunk(coalesce(NEW.tenant_id, OLD.tenant_id), coalesce(NEW.id, OLD.id));
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        FOR a IN SELECT id FROM core.attachment WHERE entity_type = 'collab.kb_document' AND entity_id = NEW.id LOOP
            PERFORM search.mark(NEW.tenant_id, 'core.attachment', a.id);
        END LOOP;
    END IF;
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION search.attachment_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF search.attachment_indexable(NEW.entity_type) AND (NEW.status = 'CLEAN' OR OLD.status = 'CLEAN') THEN
        PERFORM search.mark(NEW.tenant_id, 'core.attachment', NEW.id);
        IF NEW.entity_type = 'collab.kb_document' THEN
            PERFORM search.mark_chunk(NEW.tenant_id, NEW.entity_id);
        END IF;
    END IF;
    RETURN NULL;
END $$;

CREATE TABLE core.ai_question (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES core.tenant,
    agent_id           uuid NOT NULL REFERENCES core.ai_agent,
    person_id          uuid NOT NULL REFERENCES core.person,
    question           text NOT NULL CHECK (length(question) BETWEEN 1 AND 2000),
    kb_document_id     uuid REFERENCES collab.kb_document,
    status             text NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued', 'running', 'done', 'refused', 'error')),
    answer             text NOT NULL DEFAULT '',
    citations          jsonb NOT NULL DEFAULT '[]',
    guard              text CHECK (guard IN ('scope', 'prompt')),
    error              text,
    model              text NOT NULL,
    prompt_tokens      int,
    completion_tokens  int,
    created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
    started_at         timestamptz,
    finished_at        timestamptz
);
CREATE INDEX ai_question_queue ON core.ai_question (status, created_at);
CREATE INDEX ai_question_history ON core.ai_question (tenant_id, person_id, created_at DESC);
CREATE INDEX ai_question_agent ON core.ai_question (agent_id, created_at);
CREATE INDEX ai_question_person ON core.ai_question (person_id);
CREATE INDEX ai_question_kb_document ON core.ai_question (kb_document_id) WHERE kb_document_id IS NOT NULL;

CREATE FUNCTION core.ai_question_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('ai_question', NEW.id::text);
    RETURN NULL;
END $$;

CREATE TRIGGER ai_question_notify AFTER INSERT ON core.ai_question
FOR EACH ROW WHEN (NEW.status = 'queued') EXECUTE FUNCTION core.ai_question_notify();

CREATE TRIGGER audit_log AFTER INSERT OR UPDATE OF status OR DELETE ON core.ai_question
FOR EACH ROW EXECUTE FUNCTION audit.log_change('id');
