CREATE FUNCTION kpi.on_time_rate(p_tenant uuid, p_from timestamptz, p_to timestamptz,
                                 p_sla interval DEFAULT interval '48 hours')
RETURNS double precision
LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN count(*) = 0 THEN NULL
                ELSE round((100.0 * count(*) FILTER (WHERE t.closed_at - t.created_at <= p_sla) / count(*))::numeric, 1)
           END::double precision
    FROM wf.task t
    WHERE t.tenant_id = p_tenant AND t.status = 'DONE' AND t.closed_at >= p_from AND t.closed_at <= p_to
$$;

CREATE FUNCTION kpi.refresh(p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    d          record;
    v          double precision;
    v_today    timestamptz := date_trunc('day', p_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
    v_day      timestamptz;
    v_month    timestamptz;
    v_first    timestamptz;
    v_week     timestamptz := date_trunc('week', p_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
BEGIN
    FOR d IN SELECT tenant_id, key FROM kpi.definition WHERE key IN ('on-time', 'pr-value', 'lots-on-hold') LOOP
        IF d.key = 'on-time' THEN
            DELETE FROM kpi.value WHERE tenant_id = d.tenant_id AND kpi_key = d.key;
            FOR i IN 0..13 LOOP
                v_day := v_today - make_interval(days => i);
                v := kpi.on_time_rate(d.tenant_id, v_day - interval '29 days', least(v_day + interval '1 day', p_at));
                IF v IS NOT NULL THEN
                    INSERT INTO kpi.value (tenant_id, kpi_key, period_start, value) VALUES (d.tenant_id, d.key, v_day, v);
                END IF;
            END LOOP;
        ELSIF d.key = 'pr-value' THEN
            DELETE FROM kpi.value WHERE tenant_id = d.tenant_id AND kpi_key = d.key;
            SELECT min(h.created_at) INTO v_first
            FROM wf.approval_history h
            WHERE h.tenant_id = d.tenant_id AND h.entity_type = 'proc.purchase_request' AND h.event = 'COMPLETED';
            IF v_first IS NULL THEN
                CONTINUE;
            END IF;
            FOR v_month IN
                SELECT m AT TIME ZONE 'Asia/Ho_Chi_Minh'
                FROM generate_series(
                    greatest(date_trunc('month', v_first AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                             date_trunc('month', p_at AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '11 months'),
                    date_trunc('month', p_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), interval '1 month') m
            LOOP
                SELECT coalesce(sum(r.total_amount), 0) / 1e9 INTO v
                FROM proc.purchase_request r
                WHERE r.tenant_id = d.tenant_id AND r.status = 'APPROVED' AND EXISTS (
                    SELECT 1 FROM wf.approval_history h
                    WHERE h.entity_type = 'proc.purchase_request' AND h.entity_id = r.id AND h.event = 'COMPLETED'
                      AND h.created_at >= v_month
                      AND h.created_at < (v_month AT TIME ZONE 'Asia/Ho_Chi_Minh' + interval '1 month')
                                         AT TIME ZONE 'Asia/Ho_Chi_Minh');
                INSERT INTO kpi.value (tenant_id, kpi_key, period_start, value)
                VALUES (d.tenant_id, d.key, v_month, round(v::numeric, 2));
            END LOOP;
        ELSE
            SELECT count(*) INTO v FROM mfg.lot WHERE tenant_id = d.tenant_id AND status = 'ON_HOLD';
            INSERT INTO kpi.value (tenant_id, kpi_key, period_start, value) VALUES (d.tenant_id, d.key, v_week, v)
            ON CONFLICT (tenant_id, kpi_key, period_start) DO UPDATE SET value = EXCLUDED.value;
        END IF;
    END LOOP;
END $$;

UPDATE kpi.definition
SET grain = 'day',
    definition = 'Bước duyệt xong trong 48 giờ / mọi bước duyệt xong trong 30 ngày gần nhất, tính từ dữ liệu duyệt.'
WHERE key = 'on-time';

SELECT kpi.refresh();
