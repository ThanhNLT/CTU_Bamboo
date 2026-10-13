// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Đọc dữ liệu quản trị bằng một truy vấn GraphQL, tải lại sau mỗi lần ghi (không cần subscription: chỉ quản trị
// viên sửa, và họ thấy ngay kết quả của chính mình).
import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "../../../api/client";

export const useGql = <T>(query: string, variables?: Record<string, unknown>) => {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const vars = JSON.stringify(variables ?? {});

  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
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
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
};
