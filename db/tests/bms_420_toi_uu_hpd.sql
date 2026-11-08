SELECT test.fixture();

CREATE FUNCTION pg_temp.counters_ok(p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM test.eq((SELECT count(*)::int FROM chat.member m
                     WHERE m.left_at IS NULL AND m.unread <> chat.count_unread(m.conversation_id, m.person_id, m.last_read_id)),
                    0, p_label);
END $$;

DO $$
DECLARE
    v_conv uuid;
    v_ids  bigint[];
BEGIN
    SELECT id INTO v_conv FROM chat.conversation WHERE org_unit_id = test.id('DT_MH');
    PERFORM test.put('KENH', v_conv);
    WITH m AS (
        INSERT INTO chat.message (tenant_id, conversation_id, sender_id, body)
        SELECT test.id('TDX'), v_conv, test.id(x), 'tin ' || x FROM unnest(ARRAY['c', 'd', 'c', 'tp_mh_dt', 'd']) x
        RETURNING id)
    SELECT array_agg(id ORDER BY id) INTO v_ids FROM m;
    PERFORM pg_temp.counters_ok('sau khi gửi');
    PERFORM test.eq((SELECT unread FROM chat.member WHERE conversation_id = v_conv AND person_id = test.id('tp_mh_dt')),
                    1, 'trưởng phòng gửi tin thứ 4 là đã đọc tới đó: còn 1 tin chưa đọc');
    UPDATE chat.message SET deleted_at = now() WHERE id = v_ids[1];
    PERFORM pg_temp.counters_ok('sau khi thu hồi');
    UPDATE chat.member SET last_read_id = v_ids[3] WHERE conversation_id = v_conv AND person_id = test.id('c');
    PERFORM pg_temp.counters_ok('sau khi đọc một phần');
    PERFORM test.eq((SELECT unread FROM chat.member WHERE conversation_id = v_conv AND person_id = test.id('c')),
                    2, 'chị C đọc tới tin 3: còn tin 4, 5 của người khác');
END $$;

SELECT test.position('TDX', 'P_NV3_MH_DT', 'DT_MH', 'Chuyên viên mua hàng 3');
SELECT test.assign('TDX', 'e', 'P_NV3_MH_DT');
SELECT test.eq((SELECT unread FROM chat.member WHERE conversation_id = test.id('KENH') AND person_id = test.id('e')), 0,
               'người mới vào kênh không có tin chưa đọc cũ');
INSERT INTO chat.message (tenant_id, conversation_id, sender_id, body) VALUES (test.id('TDX'), test.id('KENH'), test.id('c'), 'mới');
SELECT test.eq((SELECT unread FROM chat.member WHERE conversation_id = test.id('KENH') AND person_id = test.id('e')), 1,
               'tin sau khi vào thì tính');
SELECT pg_temp.counters_ok('sau khi có người mới');

INSERT INTO chat.conversation (tenant_id, id, kind, direct_key, created_by)
VALUES (test.id('TDX'), test.put('RIENG', gen_random_uuid()), 'DIRECT', 'a:c', test.id('c'));
INSERT INTO chat.member (tenant_id, conversation_id, person_id)
VALUES (test.id('TDX'), test.id('RIENG'), test.id('c')), (test.id('TDX'), test.id('RIENG'), test.id('a'));
UPDATE chat.member SET left_at = now() WHERE conversation_id = test.id('RIENG') AND person_id = test.id('a');
INSERT INTO chat.message (tenant_id, conversation_id, sender_id, body) VALUES (test.id('TDX'), test.id('RIENG'), test.id('c'), 'hai');
SELECT test.eq((SELECT (left_at IS NULL, unread) FROM chat.member WHERE conversation_id = test.id('RIENG') AND person_id = test.id('a')),
               (true, 1), 'người đã ẩn cuộc được đưa lại với đúng 1 tin chưa đọc');
SELECT pg_temp.counters_ok('cuộc hai người');

CREATE FUNCTION pg_temp.brute(p_event cal.event, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (occurs_at timestamptz, ends_at timestamptz) LANGUAGE sql STABLE AS $$
    WITH s AS (
        SELECT CASE p_event.recurrence WHEN 'DAILY' THEN interval '1 day' WHEN 'WEEKLY' THEN interval '1 week'
                                       WHEN 'MONTHLY' THEN interval '1 month' END AS step,
               p_event.ends_at - p_event.starts_at AS len, p_event.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS l0
    ), x AS (
        SELECT (l0 + n * step) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS o, len FROM s, generate_series(0, 800) n
        WHERE step IS NOT NULL AND (l0 + n * step)::date <= p_event.recur_until
        UNION ALL SELECT p_event.starts_at, len FROM s WHERE step IS NULL
    )
    SELECT o, o + len FROM x WHERE o < p_to AND o + len > p_from
$$;

INSERT INTO cal.event (tenant_id, title, starts_at, ends_at, organizer_id, recurrence, recur_until)
VALUES (test.id('TDX'), 'ngày', '2026-01-31 23:30+07', '2026-02-01 01:00+07', test.id('c'), 'DAILY', '2026-12-31'),
       (test.id('TDX'), 'tuần', '2026-03-02 08:30+07', '2026-03-02 09:30+07', test.id('c'), 'WEEKLY', '2027-06-30'),
       (test.id('TDX'), 'tháng', '2026-01-31 09:00+07', '2026-01-31 10:00+07', test.id('c'), 'MONTHLY', '2027-12-31'),
       (test.id('TDX'), 'đơn', '2026-05-10 09:00+07', '2026-05-12 10:00+07', test.id('c'), 'NONE', NULL);
SELECT test.eq(
    (SELECT count(*)::int FROM cal.event e, generate_series('2025-12-01'::timestamptz, '2027-08-01', interval '9 days') f,
            LATERAL (SELECT array_agg(o ORDER BY o) a FROM cal.occurrences(e, f, f + interval '40 days') o) n,
            LATERAL (SELECT array_agg(b ORDER BY b) a FROM pg_temp.brute(e, f, f + interval '40 days') b) m
     WHERE e.title IN ('ngày', 'tuần', 'tháng', 'đơn') AND n.a IS DISTINCT FROM m.a),
    0, 'lần lặp giống cách tính cũ ở mọi khoảng xem');
SELECT test.ok(cal.last_end('WEEKLY', '2026-03-02 09:30+07', '2026-03-02 08:30+07', '2027-06-30')
               >= '2027-06-30 09:30+07'::timestamptz, 'lần cuối của chuỗi lặp');

INSERT INTO pm.project (tenant_id, id, code, name, org_unit_id, manager_id, start_date, end_date, created_by)
VALUES (test.id('TDX'), test.put('DA', gen_random_uuid()), 'DA-1', 'x', test.id('DT_MH'), test.id('c'), current_date - 10,
        current_date + 10, test.id('c'));
INSERT INTO pm.task (tenant_id, project_id, name, start_date, end_date, progress)
VALUES (test.id('TDX'), test.id('DA'), 'a', current_date - 10, current_date - 1, 100),
       (test.id('TDX'), test.id('DA'), 'b', current_date, current_date + 9, 0);
SELECT test.eq((SELECT pm.project_stats(j) ->> 'actual_pct' FROM pm.project j WHERE id = test.id('DA')),
               (SELECT actual_pct::text FROM pm.stats(test.id('DA'))), 'stats gộp khớp pm.stats');

INSERT INTO api.api_key (tenant_id, id, name, prefix, key_sha256, scopes, created_by, expires_at)
VALUES (test.id('TDX'), test.put('KHOA', gen_random_uuid()), 'k', 'bak_abcdef', sha256('z'), '{org.read}', test.id('c'),
        now() + interval '1 day');
INSERT INTO api.usage (key_id, day, calls, last_used_at, last_ip) VALUES (test.id('KHOA'), current_date, 1, now(), '10.0.0.7');
SELECT test.eq((SELECT api.api_key_last_ip(k) FROM api.api_key k WHERE id = test.id('KHOA')), '10.0.0.7', 'IP cuối');
SELECT test.ok((SELECT api.api_key_last_used_at(k) IS NOT NULL FROM api.api_key k WHERE id = test.id('KHOA')), 'lần dùng cuối');
