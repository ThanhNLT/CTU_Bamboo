/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

export type TipProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    name?: string | number;
    value?: number | string | null;
    color?: string;
    stroke?: string;
    fill?: string;
    dataKey?: string | number;
  }>;
};

export const ChartTooltip = ({
  active,
  label,
  payload,
  nameOf,
  unit,
}: TipProps & { nameOf?: (key: string) => string; unit?: string }) => {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null);
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-float">
      {label != null && <div className="mb-1 font-semibold text-ink">{label}</div>}
      <ul className="m-0 list-none space-y-0.5 p-0">
        {rows.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-ui" style={{ background: p.color ?? p.stroke ?? p.fill }} aria-hidden />
            <span className="flex-1 text-body">{nameOf ? nameOf(String(p.dataKey)) : p.name}</span>
            <span className="font-medium tabular-nums text-ink">
              {p.value}
              {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
