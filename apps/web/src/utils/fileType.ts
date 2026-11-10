/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

const BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  md: "text/markdown",
  markdown: "text/markdown",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const uploadContentType = (file: File) =>
  BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? (file.type || "application/octet-stream");
