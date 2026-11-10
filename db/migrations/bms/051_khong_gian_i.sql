ALTER TABLE core.ai_question
    ADD COLUMN context_key text,
    ADD COLUMN reused_from uuid REFERENCES core.ai_question ON DELETE SET NULL,
    ADD COLUMN attempts int NOT NULL DEFAULT 0;

CREATE INDEX ai_question_context ON core.ai_question (tenant_id, context_key, finished_at DESC)
    WHERE status = 'done' AND context_key IS NOT NULL;
CREATE INDEX ai_question_reused ON core.ai_question (reused_from) WHERE reused_from IS NOT NULL;

CREATE TABLE kpi.chart (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL,
    person_id   uuid NOT NULL,
    name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    chart_type  text NOT NULL CHECK (chart_type IN ('bar', 'stacked', 'line', 'area', 'pie', 'table')),
    spec        jsonb NOT NULL CHECK (jsonb_typeof(spec) = 'object' AND spec ? 'metrics'),
    shared      boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX chart_owner ON kpi.chart (tenant_id, person_id, updated_at DESC);
CREATE INDEX chart_shared ON kpi.chart (tenant_id, updated_at DESC) WHERE shared;

CREATE FUNCTION kpi.chart_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT'
       AND (SELECT count(*) FROM kpi.chart WHERE tenant_id = NEW.tenant_id AND person_id = NEW.person_id) >= 50 THEN
        RAISE EXCEPTION 'Mỗi người lưu tối đa 50 biểu đồ' USING ERRCODE = 'data_exception';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE TRIGGER chart_touch BEFORE INSERT OR UPDATE ON kpi.chart FOR EACH ROW EXECUTE FUNCTION kpi.chart_touch();

CREATE FUNCTION kpi.chart_is_mine(p_row kpi.chart, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT p_row.person_id = (hasura_session ->> 'x-hasura-user-id')::uuid
$$;
