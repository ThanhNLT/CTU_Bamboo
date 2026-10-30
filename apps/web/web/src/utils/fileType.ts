// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Trình duyệt hay báo thiếu hoặc sai loại tệp (.md để trống, .csv thành application/vnd.ms-excel trên Windows), nên suy ra từ đuôi tệp.
const BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  md: "text/markdown",
  markdown: "text/markdown",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const uploadContentType = (file: File) =>
  BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? (file.type || "application/octet-stream");
