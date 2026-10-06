// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// "Nguyễn Văn An" → "an.nguyenvan" (bỏ dấu); người dùng sửa lại được.
export const suggestUsername = (fullName: string) => {
  const words = fullName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d")
    .toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[words.length - 1];
  return words.length > 1 ? `${first}.${words.slice(0, -1).join("")}` : first;
};
