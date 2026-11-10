/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { tr } from "../../../i18n";

const SOURCE_URL: string | undefined = import.meta.env.VITE_SOURCE_URL;

export const DashboardFooter = () => (
  <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1 text-[11.5px] text-muted">
    <span>BAMBOO v0.x · Apache-2.0</span>
    {SOURCE_URL ? (
      <a
        href={SOURCE_URL}
        target="_blank"
        rel="noreferrer"
        className="text-muted underline underline-offset-2 hover:text-ink"
      >
        {tr("Mã nguồn")}
      </a>
    ) : (
      <span className="underline underline-offset-2">{tr("Mã nguồn")}</span>
    )}
    <span>{tr("Dữ liệu demo")}</span>
  </footer>
);
