-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

CREATE SCHEMA cdc;

CREATE TABLE cdc.heartbeat (
    id       int PRIMARY KEY CHECK (id = 1),
    beat_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO cdc.heartbeat (id) VALUES (1);

CREATE PUBLICATION bms_cdc FOR TABLES IN SCHEMA core, mdm, wf, proc, ic, collab, cdc;
