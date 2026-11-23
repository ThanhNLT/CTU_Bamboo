-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
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

CREATE FUNCTION pg_temp.register(p_code text, p_scopes text[] DEFAULT '{}', p_url text DEFAULT 'http://mo-dun:8080')
RETURNS void LANGUAGE sql AS $$
    INSERT INTO core.module_install (module) VALUES (p_code);
    INSERT INTO core.external_module (module, name, base_url, scopes, key_salt, key_sha256)
    VALUES (p_code, 'Mô-đun thử', p_url, p_scopes, substr(sha256(p_code::bytea), 1, 16), sha256(p_code::bytea));
$$;

SELECT pg_temp.register('x_nhac_viec', ARRAY['people.read', 'notify.send']);
SELECT test.eq((SELECT count(*)::int FROM core.external_module), 1, 'đăng ký mô-đun ngoài');
SELECT test.throws($$SELECT pg_temp.register('kho', '{}')$$, '%external\_module\_module\_check%', 'mã phải bắt đầu bằng x_');
SELECT test.throws($$SELECT pg_temp.register('x_doc_het', ARRAY['db.write'])$$, '%external\_module\_scopes\_check%',
                   'phạm vi ngoài danh sách bị từ chối');
SELECT test.throws($$SELECT pg_temp.register('x_sai_url', '{}', 'ftp://mo-dun')$$, '%external\_module\_base\_url\_check%',
                   'base_url phải là http(s)');

INSERT INTO core.tenant_module (tenant_id, module) VALUES (test.id('TDX'), 'x_nhac_viec');
SELECT collab.notify(test.id('TDX'), test.id('tgd'), 'EXTERNAL', 'x_nhac_viec', NULL, '[Nhắc việc] thử', NULL);
SELECT test.eq((SELECT count(*)::int FROM collab.notification WHERE kind = 'EXTERNAL'), 1, 'thông báo loại EXTERNAL');

DELETE FROM core.tenant_module WHERE module = 'x_nhac_viec';
DELETE FROM core.module_install WHERE module = 'x_nhac_viec';
SELECT test.eq((SELECT count(*)::int FROM core.external_module), 0, 'gỡ khỏi máy xóa đăng ký');
