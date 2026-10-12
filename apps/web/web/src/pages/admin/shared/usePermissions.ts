// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { myPermissions } from "../../../providers/access";

/** Quyền của người dùng trong tenant đang chọn (chỉ để ẩn/hiện; máy chủ kiểm lại khi ghi). */
export const usePermissions = () => {
  const [perms, setPerms] = useState<Set<string>>();
  useEffect(() => {
    let alive = true;
    void myPermissions().then((p) => alive && setPerms(p));
    return () => {
      alive = false;
    };
  }, []);
  return perms;
};

export const ORG = "core.org.manage";
export const PERM = "core.permission.manage";
export const MDM = "mdm.manage";
