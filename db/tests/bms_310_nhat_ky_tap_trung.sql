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

INSERT INTO obs.log_event (ts, service, level, message, trace_id) VALUES
    (now() - interval '20 days', 'actions', 'INFO', 'cũ thường', 't1'),
    (now() - interval '20 days', 'actions', 'ERROR', 'cũ lỗi', 't1'),
    (now() - interval '70 days', 'actions', 'ERROR', 'rất cũ lỗi', 't2'),
    (now() - interval '1 hour', 'flow-sync', 'WARNING', 'mới', 't3');
SELECT test.throws($$INSERT INTO obs.log_event (service, level, message) VALUES ('x', 'TRACE', 'sai mức')$$, '%check%', 'mức nhật ký hợp lệ');
SELECT test.eq(obs.purge(), 2, 'xóa log thường quá 14 ngày và log lỗi quá 60 ngày');
SELECT test.eq((SELECT array_agg(message ORDER BY message) FROM obs.log_event), ARRAY['cũ lỗi', 'mới'], 'giữ lại log lỗi lâu hơn');
