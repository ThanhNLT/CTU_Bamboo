SELECT test.fixture();

INSERT INTO obs.log_event (ts, service, level, message, trace_id) VALUES
    (now() - interval '20 days', 'actions', 'INFO', 'cũ thường', 't1'),
    (now() - interval '20 days', 'actions', 'ERROR', 'cũ lỗi', 't1'),
    (now() - interval '70 days', 'actions', 'ERROR', 'rất cũ lỗi', 't2'),
    (now() - interval '1 hour', 'flow-sync', 'WARNING', 'mới', 't3');
SELECT test.throws($$INSERT INTO obs.log_event (service, level, message) VALUES ('x', 'TRACE', 'sai mức')$$, '%check%', 'mức nhật ký hợp lệ');
SELECT test.eq(obs.purge(), 2, 'xóa log thường quá 14 ngày và log lỗi quá 60 ngày');
SELECT test.eq((SELECT array_agg(message ORDER BY message) FROM obs.log_event), ARRAY['cũ lỗi', 'mới'], 'giữ lại log lỗi lâu hơn');
