-- Bamboo - DX-OS Open-Core
-- @version 0.5.1
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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

SELECT test.fixture();

DELETE FROM live.event;
UPDATE core.org_unit SET name = name WHERE tenant_id = test.id('TDX');
SELECT test.eq((SELECT count(*)::int FROM live.event WHERE tenant_id = test.id('TDX') AND topic = 'org'), 1,
               'một tín hiệu cho mỗi câu lệnh và công ty');
UPDATE core.org_unit SET name = name WHERE false;
SELECT test.eq((SELECT count(*)::int FROM live.event), 1, 'câu lệnh không đổi dòng nào không sinh tín hiệu');
SELECT test.ok((SELECT relpersistence = 'u' FROM pg_class WHERE oid = 'live.event'::regclass), 'bảng tín hiệu không ghi WAL');
SELECT test.eq((SELECT count(*)::int FROM pg_publication_tables WHERE pubname = 'bms_cdc' AND schemaname IN ('live', 'api')),
               0, 'live, api không vào CDC');

INSERT INTO live.presence (tenant_id, person_id, device, path, seen_at)
VALUES (test.id('TDX'), test.id('c'), 'thiet-bi-01', '/d/ops', now() - interval '1 day');
SELECT test.ok((SELECT seen_at > now() - interval '1 minute' FROM live.presence WHERE device = 'thiet-bi-01'),
               'seen_at theo giờ máy chủ');
SELECT test.ok(EXISTS (SELECT 1 FROM live.v_online WHERE person_id = test.id('c')), 'đang trực tuyến');
UPDATE live.presence SET path = '/i/bi' WHERE device = 'thiet-bi-01';
SELECT test.throws($$ UPDATE live.presence SET path = '/d/ops?token=x' WHERE device = 'thiet-bi-01' $$, '%path%',
                   'không lưu chuỗi truy vấn');
SELECT test.throws($$ INSERT INTO live.presence (tenant_id, person_id, device, path)
                      VALUES (test.id('TDX'), test.id('c'), 'x', '/') $$, '%device%', 'mã thiết bị quá ngắn');

SELECT test.throws($$ INSERT INTO api.api_key (tenant_id, name, prefix, key_sha256, scopes, created_by, expires_at)
                      VALUES (test.id('TDX'), 'k', 'bak_abcdef', sha256('a'), '{org.read}', test.id('c'),
                              now() + interval '400 days') $$, '%check%', 'hạn quá một năm');
SELECT test.throws($$ INSERT INTO api.api_key (tenant_id, name, prefix, key_sha256, scopes, created_by, expires_at)
                      VALUES (test.id('TDX'), 'k', 'bak_abcdef', sha256('a'), '{}', test.id('c'),
                              now() + interval '1 day') $$, '%scopes%', 'phải có phạm vi');
INSERT INTO api.api_key (tenant_id, name, prefix, key_sha256, scopes, created_by, expires_at)
VALUES (test.id('TDX'), 'k', 'bak_abcdef', sha256('a'), '{org.read}', test.id('c'), now() + interval '1 day');
SELECT test.throws($$ INSERT INTO api.api_key (tenant_id, name, prefix, key_sha256, scopes, created_by, expires_at)
                      VALUES (test.id('TDX'), 'k2', 'bak_abcdef', sha256('a'), '{org.read}', test.id('c'),
                              now() + interval '1 day') $$, '%key_sha256%', 'mã băm không trùng');
SELECT test.ok(EXISTS (SELECT 1 FROM audit.log WHERE table_name = 'api.api_key'), 'tạo khóa ghi nhật ký kiểm toán');
