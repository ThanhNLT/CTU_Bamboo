import type { DriveFile, SortKey } from "./types";

const num = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export const formatBytes = (bytes: number | null | undefined) => {
  if (bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i += 1;
  }
  return `${num.format(value)} ${units[i]}`;
};

export const fileExtension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

const blocked = (f: DriveFile) => f.scan === "infected" || f.scan === "rejected";

export const sortFiles = (files: DriveFile[], key: SortKey) =>
  [...files].sort((a, b) => {
    if (blocked(a) !== blocked(b)) return blocked(a) ? 1 : -1;
    if (key === "name") return a.name.localeCompare(b.name, "vi");
    if (key === "size") return (b.bytes ?? 0) - (a.bytes ?? 0);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
