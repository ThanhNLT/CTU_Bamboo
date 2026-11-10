/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { request, wsClient } from "../../../api/client";

/**
 * Truy vấn bảng qua Hasura và giữ dữ liệu luôn mới: mở subscription cùng nội dung truy vấn nên thay đổi của người
 * khác (bổ nhiệm, vai trò, đơn vị...) hiện ngay không cần tải lại trang. Quyền xem vẫn do Hasura lọc theo phiên.
 * Nếu kết nối WebSocket lỗi thì giữ dữ liệu đã tải bằng HTTP; `reload` luôn tải lại ngay sau khi ghi.
 */
export const useGql = <T>(query: string, variables?: Record<string, unknown>) => {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const vars = JSON.stringify(variables ?? {});

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await request<T>(query, JSON.parse(vars) as Record<string, unknown>);
      if (my === seq.current) {
        setData(r);
        setError(undefined);
      }
    } catch (e) {
      if (my === seq.current) setError((e as Error).message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [query, vars]);

  useEffect(() => {
    setLoading(true);
    void reload();
    const live = query.replace(/^\s*query\b/, "subscription");
    if (live === query) return undefined;
    return wsClient.subscribe<T>(
      { query: live, variables: JSON.parse(vars) as Record<string, unknown> },
      {
        next: ({ data: next }) => {
          if (!next) return;
          seq.current += 1;
          setData(next);
          setError(undefined);
          setLoading(false);
        },
        error: () => {},
        complete: () => {},
      },
    );
  }, [query, vars, reload]);

  return { data, error, loading, reload };
};
