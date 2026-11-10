/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { Popover } from "antd";
import { useLocation } from "react-router";

import { presencePath, useOnline, usePresenceBeat } from "../../live/presence";
import { tr, trf } from "../../i18n";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** Người cùng công ty đang trực tuyến (ADR #64): ai đang xem cùng trang hiện trước, kèm số người trực tuyến. */
export const OnlinePeople = () => {
  usePresenceBeat();
  const people = useOnline();
  const { pathname } = useLocation();
  const here = presencePath(pathname);
  if (people.length === 0) return null;
  const sameFirst = [...people].sort((a, b) => Number(b.path === here) - Number(a.path === here));
  const samePage = people.filter((p) => p.path === here).length;
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      content={
        <div className="w-[260px]">
          <p className="m-0 mb-2 text-[12px] text-muted">
            {trf("{0} người đang trực tuyến, kể cả bạn", [people.length])}
          </p>
          <ul className="m-0 flex max-h-[280px] list-none flex-col gap-1.5 overflow-auto p-0">
            {sameFirst.map((p) => (
              <li key={p.person_id} className="flex items-center gap-2 text-[12.5px]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bamboo-100 text-[10px] font-semibold text-bamboo-800">
                  {initialsOf(p.full_name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{p.full_name}</span>
                {p.path === here && <span className="shrink-0 text-[11px] text-bamboo-700">{tr("cùng trang")}</span>}
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <button
        type="button"
        className="flex h-9 items-center gap-1.5 rounded-full px-2 text-[12px] text-body transition-colors hover:bg-black/[0.05] max-md:hidden"
        aria-label={trf("{0} người đang trực tuyến, {1} người cùng trang", [people.length, samePage])}
      >
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-bamboo-400 opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-bamboo-500" />
        </span>
        <span className="flex -space-x-1.5" aria-hidden>
          {sameFirst.slice(0, 3).map((p) => (
            <span
              key={p.person_id}
              className="grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--surface-solid)] bg-bamboo-100 text-[9.5px] font-semibold text-bamboo-800"
            >
              {initialsOf(p.full_name)}
            </span>
          ))}
        </span>
        <span className="tabular-nums">{people.length}</span>
      </button>
    </Popover>
  );
};
