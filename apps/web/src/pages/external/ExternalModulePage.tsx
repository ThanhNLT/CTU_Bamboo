// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, Spin } from "antd";
import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { config } from "../../config";
import { launchExternal } from "../../modules/api";
import { RequireModule } from "../../modules/RequireModule";
import { tr } from "../../i18n";

/**
 * Giao diện mô-đun ngoài trong khung nhúng (ADR #58). Khung không có allow-same-origin và máy chủ còn ép CSP sandbox, nên
 * mã của bên thứ ba chạy ở origin riêng: không đọc được token, localStorage hay cửa sổ Bamboo.
 */
const Frame = ({ code, path }: { code: string; path: string }) => {
  const [src, setSrc] = useState<string>();
  const [name, setName] = useState(code);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setSrc(undefined);
    setError(undefined);
    launchExternal(code, path)
      .then((r) => {
        setName(r.name);
        setSrc(`${config.extUrl}/${r.path}`);
      })
      .catch((e: Error) => setError(e.message));
  }, [code, path]);

  if (error) return <Alert type="error" showIcon message={tr("Không mở được mô-đun")} description={error} />;
  if (!src)
    return (
      <div className="flex justify-center py-24">
        <Spin />
      </div>
    );
  return (
    <iframe
      key={src}
      title={name}
      src={src}
      sandbox="allow-scripts allow-forms allow-popups allow-downloads allow-modals"
      referrerPolicy="no-referrer"
      className="h-[calc(100vh-112px)] w-full rounded-2xl border border-line bg-white"
    />
  );
};

export const ExternalModulePage = () => {
  const { code = "", "*": rest = "" } = useParams();
  return (
    <RequireModule module={code}>
      <Frame code={code} path={`/${rest}`} />
    </RequireModule>
  );
};
