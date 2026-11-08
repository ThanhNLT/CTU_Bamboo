SELECT test.fixture();
SELECT test.pr('pr', 'c', 'P_NV_MH_DT', 20000000);

INSERT INTO pm.project (tenant_id, id, code, name, org_unit_id, manager_id, start_date, end_date, created_by)
VALUES (test.id('TDX'), test.put('DA', gen_random_uuid()), 'ERP-2027', 'Triển khai ERP', test.id('DT_MH'),
        test.id('tp_mh_dt'), '2026-11-02', '2026-12-31', test.id('tp_mh_dt'));
INSERT INTO pm.member (tenant_id, project_id, person_id, role)
VALUES (test.id('TDX'), test.id('DA'), test.id('c'), 'MEMBER');

INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key,
                             uploaded_by)
VALUES (test.id('TDX'), 'pm.project', test.id('DA'), 'ke-hoach.docx', 'text/plain', 10, 'k-da', test.id('c'))
RETURNING test.put('f_da', id);
INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key,
                             uploaded_by)
VALUES (test.id('TDX'), 'proc.purchase_request', test.id('pr'), 'bao-gia.pdf', 'application/pdf', 10, 'k-pr',
        test.id('c'))
RETURNING test.put('f_pr', id);

SELECT test.ok(wf.entity_can_read('pm.project', test.id('DA'), test.id('c')), 'thành viên dự án xem tệp dự án');
SELECT test.ok(NOT wf.entity_can_read('pm.project', test.id('DA'), test.id('a')), 'người ngoài không xem');
SELECT test.eq(collab.entity_label('pm.project', test.id('DA')), 'ERP-2027 – Triển khai ERP', 'nhãn dự án');
SELECT test.ok(collab.entity_label('proc.purchase_request', test.id('pr')) LIKE '% – %', 'nhãn chứng từ cũ giữ nguyên');
SELECT test.throws($$ INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type,
                                                   size_bytes, storage_key, uploaded_by)
                      VALUES (test.id('TDX'), 'pm.project', gen_random_uuid(), 'x.txt', 'text/plain', 1, 'k-x',
                              test.id('c')) $$, '%Không tìm thấy chứng từ%', 'dự án không tồn tại thì không nhận tệp');

SELECT test.eq(core.attachment_para(a), 'PROJECTS', 'dự án đang lập kế hoạch')
FROM core.attachment a WHERE id = test.id('f_da');
SELECT test.eq(core.attachment_para(a), 'PROJECTS', 'đề nghị đang soạn')
FROM core.attachment a WHERE id = test.id('f_pr');
UPDATE pm.project SET status = 'DONE' WHERE id = test.id('DA');
SELECT test.eq(core.attachment_para(a), 'ARCHIVES', 'dự án hoàn thành chuyển Lưu trữ')
FROM core.attachment a WHERE id = test.id('f_da');
UPDATE proc.purchase_request SET status = 'CANCELLED' WHERE id = test.id('pr');
SELECT test.eq(core.para_of('proc.purchase_request', test.id('pr')), 'ARCHIVES', 'đề nghị đã hủy chuyển Lưu trữ');

SELECT test.eq(core.para_of('chat.conversation', (SELECT id FROM chat.conversation
                                                  WHERE org_unit_id = test.id('DT_MH'))), 'AREAS', 'kênh phòng ban');
DO $$
DECLARE v_conv uuid;
BEGIN
    INSERT INTO chat.conversation (tenant_id, kind, title, created_by)
    VALUES (test.id('TDX'), 'GROUP', 'Nhóm ERP', test.id('tp_mh_dt')) RETURNING id INTO v_conv;
    PERFORM test.eq(core.para_of('chat.conversation', v_conv), 'AREAS', 'nhóm thường');
    UPDATE pm.project SET conversation_id = v_conv, status = 'ACTIVE' WHERE id = test.id('DA');
    PERFORM test.eq(core.para_of('chat.conversation', v_conv), 'PROJECTS', 'nhóm của dự án đang chạy');
END $$;
