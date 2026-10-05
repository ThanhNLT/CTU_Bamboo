-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- CDC (ADR #22, #38): Debezium đọc WAL logic của CSDL bms qua publication `bms_cdc` và đẩy từng thay đổi
-- vào Kafka. Publication gồm mọi bảng (kể cả bảng tạo sau) trong các schema nghiệp vụ; không gồm
-- `audit` (nhật ký có chuỗi hash riêng, ADR #33), `search` (hàng đợi nội bộ), `public`.
-- Cần PostgreSQL chạy với wal_level=logical (docker-compose.yml); migration vẫn chạy được khi chưa bật.

CREATE SCHEMA cdc;

-- Nhịp tim: Debezium ghi định kỳ để vị trí replication slot luôn tiến, kể cả khi bảng nghiệp vụ không
-- đổi mà CSDL khác cùng máy chủ (keycloak, flowable) vẫn sinh WAL; slot đứng yên giữ WAL làm đầy đĩa.
CREATE TABLE cdc.heartbeat (
    id       int PRIMARY KEY CHECK (id = 1),
    beat_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO cdc.heartbeat (id) VALUES (1);

CREATE PUBLICATION bms_cdc FOR TABLES IN SCHEMA core, mdm, wf, proc, ic, collab, cdc;
