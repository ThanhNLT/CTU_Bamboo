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
