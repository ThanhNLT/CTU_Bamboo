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

SELECT test.pr('pr600', 'a', 'P_NV_KD_CHIP', 600000000);
SELECT test.approve('pr600', 'gd_chip');
SELECT test.eq(test.assignee('pr600'), 'tgd', 'Việc bước 2 ở TGĐ cũ');
SELECT test.end_assignment('tgd', 'P_TGD');
SELECT test.ok((test.open_task('pr600')).assignee_id IS NULL, 'Không còn ai trên TGĐ: việc nằm chờ tại vị trí');
SELECT test.throws(format($$SELECT wf.act(%L, %L, 'APPROVE')$$, (test.open_task('pr600')).id, test.id('tgd')),
                   '%đang chờ có người giữ vị trí%', 'Việc nằm chờ thì chưa ai duyệt được');
SELECT test.person('TDX', 'tgd2', 'TGĐ mới');
SELECT test.assign('TDX', 'tgd2', 'P_TGD', 'PRIMARY', tstzrange(now(), NULL));
SELECT test.eq(test.assignee('pr600'), 'tgd2', 'Việc tự chuyển sang TGĐ mới');
SELECT test.eq((SELECT count(*) FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
                WHERE s.entity_id = test.id('pr600') AND t.status = 'TRANSFERRED'), 2::bigint,
               'Việc chuyển hai lần: TGĐ cũ → nằm chờ → TGĐ mới');
SELECT test.ok(EXISTS (SELECT 1 FROM wf.approval_history WHERE entity_id = test.id('pr600') AND event = 'TRANSFERRED'
                       AND detail->>'from_person_id' = test.id('tgd')::text),
               'Lịch sử ghi chuyển việc từ TGĐ cũ');
SELECT test.throws(format($$SELECT wf.act(%L, %L, 'APPROVE')$$, (test.open_task('pr600')).id, test.id('tgd')),
                   '%Không có quyền xử lý%', 'TGĐ cũ không duyệt được nữa');
SELECT test.approve('pr600', 'tgd2');
SELECT test.eq(test.status('pr600'), 'APPROVED', 'TGĐ mới duyệt xong');

SELECT test.pr('pr30', 'c', 'P_NV_MH_DT', 30000000);
SELECT test.end_assignment('tp_mh_dt', 'P_TP_MH_DT');
SELECT test.eq(test.assignee('pr30'), 'gd_dt', 'Trưởng phòng nghỉ: việc lên giám đốc công ty');

SELECT test.pr('pr100', 'c', 'P_NV_MH_DT', 100000000);
INSERT INTO core.delegation (tenant_id, delegator_id, delegate_id, position_id, valid_period, reason)
VALUES (test.id('TDX'), test.id('gd_dt'), test.id('d'), test.id('P_GD_DT'),
        tstzrange(now() - interval '1 day', now() + interval '7 days'), 'Đi công tác');
SELECT test.eq((SELECT array_agg(test.key(person_id) || ':' || via_delegation ORDER BY via_delegation)
                FROM wf.v_inbox WHERE entity_id = test.id('pr100')),
               ARRAY['gd_dt:false', 'd:true'], 'Hộp việc của cả người ủy quyền và người được ủy quyền');
SELECT test.approve('pr100', 'd');
SELECT test.eq(test.status('pr100'), 'APPROVED', 'Người được ủy quyền duyệt thay');
SELECT test.eq((SELECT test.key(acted_by) || '/' || test.key(on_behalf_of) FROM wf.approval_step
                WHERE entity_id = test.id('pr100')),
               'd/gd_dt', 'Bước duyệt ghi "duyệt thay"');

SELECT test.pr('pr101', 'c', 'P_NV_MH_DT', 100000000);
UPDATE core.delegation SET permission_codes = ARRAY['proc.purchase_request.read'] WHERE delegate_id = test.id('d');
SELECT test.ok(NOT EXISTS (SELECT 1 FROM wf.v_inbox WHERE entity_id = test.id('pr101') AND via_delegation),
               'Không hiện trong hộp việc người được ủy quyền');
SELECT test.throws(format($$SELECT wf.act(%L, %L, 'APPROVE')$$, (test.open_task('pr101')).id, test.id('d')),
                   '%Không có quyền xử lý%', 'Ủy quyền không gồm quyền duyệt');

UPDATE core.delegation SET permission_codes = NULL WHERE delegate_id = test.id('d');
SELECT test.pr('pr_d', 'd', 'P_NV2_MH_DT', 100000000);
SELECT test.throws(format($$SELECT wf.act(%L, %L, 'APPROVE')$$, (test.open_task('pr_d')).id, test.id('d')),
                   '%không được duyệt%', 'Người lập không duyệt thay chứng từ của mình');

SET CONSTRAINTS ALL DEFERRED;
SELECT test.pr('pr_gd', 'c', 'P_NV_MH_DT', 100000000);
SELECT test.end_assignment('gd_dt', 'P_GD_DT');
SELECT test.person('TDX', 'gd_dt2', 'Giám đốc Điện thoại X mới');
SELECT test.assign('TDX', 'gd_dt2', 'P_GD_DT', 'PRIMARY', tstzrange(now(), NULL));
SELECT test.eq(test.assignee('pr_gd'), 'gd_dt', 'Trước commit việc chưa chuyển');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT test.eq(test.assignee('pr_gd'), 'gd_dt2', 'Lúc commit việc chuyển cho giám đốc mới');
SELECT test.eq((SELECT count(*) FROM wf.approval_history WHERE entity_id = test.id('pr_gd') AND event = 'TRANSFERRED'),
               1::bigint, 'Chỉ chuyển một lần');

SELECT test.pr('pr_lich', 'a', 'P_NV_KD_CHIP', 10000000);
UPDATE core.assignment SET valid_period = tstzrange(lower(valid_period), now() + interval '1 day')
WHERE person_id = test.id('tp_kd_chip');
SELECT test.throws(format($$SELECT wf.act(%L, %L, 'APPROVE', NULL, now() + interval '2 days')$$,
                          (test.open_task('pr_lich')).id, test.id('tp_kd_chip')),
                   '%không còn giữ vị trí%', 'Hết hạn bổ nhiệm thì không duyệt được nữa');
