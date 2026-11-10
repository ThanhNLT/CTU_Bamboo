/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { useEffect, useState } from "react";

import { myPermissions } from "../../../providers/access";

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
