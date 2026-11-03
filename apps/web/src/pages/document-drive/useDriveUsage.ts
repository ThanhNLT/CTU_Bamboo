// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";

import { request } from "../../api/client";

export type DriveUsage = { quotaBytes: number; usedBytes: number; availableBytes: number };

const USAGE = `query DriveUsage { drive_usage { quota_bytes used_bytes available_bytes } }`;

export const useDriveUsage = () => {
  const [data, setData] = useState<DriveUsage>();
  const reload = useCallback(
    () =>
      request<{ drive_usage: { quota_bytes: number; used_bytes: number; available_bytes: number } }>(USAGE)
        .then(({ drive_usage: u }) =>
          setData({
            quotaBytes: Number(u.quota_bytes),
            usedBytes: Number(u.used_bytes),
            availableBytes: Number(u.available_bytes),
          }),
        )
        .catch(() => setData(undefined)),
    [],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, reload };
};
