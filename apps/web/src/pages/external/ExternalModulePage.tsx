/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { Alert, Spin } from "antd";
import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { config } from "../../config";
import { launchExternal } from "../../modules/api";
import { RequireModule } from "../../modules/RequireModule";
import { tr } from "../../i18n";

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
      className="h-[calc(100vh-112px)] w-full rounded-2xl border border-line bg-surface"
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
