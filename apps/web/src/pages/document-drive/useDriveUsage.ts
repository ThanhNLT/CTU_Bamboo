/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useState } from "react";

import { request } from "../../api/client";

export type DriveUsage = {
  quotaBytes: number;
  usedBytes: number;
  availableBytes: number;
  userQuotaBytes: number;
  userUsedBytes: number;
  userAvailableBytes: number;
};

type Row = Record<
  "quota_bytes" | "used_bytes" | "available_bytes" | "user_quota_bytes" | "user_used_bytes" | "user_available_bytes",
  number
>;

const USAGE = `query DriveUsage {
  drive_usage { quota_bytes used_bytes available_bytes user_quota_bytes user_used_bytes user_available_bytes }
}`;

export const useDriveUsage = () => {
  const [data, setData] = useState<DriveUsage>();
  const reload = useCallback(
    () =>
      request<{ drive_usage: Row }>(USAGE)
        .then(({ drive_usage: u }) =>
          setData({
            quotaBytes: Number(u.quota_bytes),
            usedBytes: Number(u.used_bytes),
            availableBytes: Number(u.available_bytes),
            userQuotaBytes: Number(u.user_quota_bytes),
            userUsedBytes: Number(u.user_used_bytes),
            userAvailableBytes: Number(u.user_available_bytes),
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
