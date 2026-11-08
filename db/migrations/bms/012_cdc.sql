CREATE SCHEMA cdc;

CREATE TABLE cdc.heartbeat (
    id       int PRIMARY KEY CHECK (id = 1),
    beat_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO cdc.heartbeat (id) VALUES (1);

CREATE PUBLICATION bms_cdc FOR TABLES IN SCHEMA core, mdm, wf, proc, ic, collab, cdc;
