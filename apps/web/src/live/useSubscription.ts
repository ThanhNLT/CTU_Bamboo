import { useEffect, useRef, useState } from "react";

import { wsClient } from "../api/client";

/**
 * Một subscription GraphQL (Hasura live query) qua kết nối WebSocket dùng chung của ứng dụng. Trả dữ liệu mới nhất,
 * lỗi và trạng thái kết nối; đổi `variables` thì đăng ký lại. `skip` để chưa đăng ký (chưa có tham số).
 */
export const useSubscription = <T>(query: string, variables: Record<string, unknown> = {}, skip = false) => {
  const [state, setState] = useState<{ data?: T; error?: string; connected: boolean }>({ connected: false });
  const key = JSON.stringify(variables);
  const vars = useRef(variables);
  vars.current = variables;

  useEffect(() => {
    if (skip) return;
    let alive = true;
    const dispose = wsClient.subscribe<T>(
      { query, variables: vars.current },
      {
        next: ({ data, errors }) => {
          if (!alive) return;
          if (errors?.length) setState((s) => ({ ...s, error: errors[0].message }));
          else if (data) setState({ data, connected: true });
        },
        error: (e) => alive && setState((s) => ({ ...s, connected: false, error: (e as Error)?.message })),
        complete: () => alive && setState((s) => ({ ...s, connected: false })),
      },
    );
    return () => {
      alive = false;
      dispose();
    };
  }, [query, key, skip]);

  return state;
};
