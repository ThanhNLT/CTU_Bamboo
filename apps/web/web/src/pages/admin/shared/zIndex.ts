// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Hằng số =====
/**
 * Hộp thoại quản trị nằm trên ngăn kéo (Drawer, z-index 1000): chúng được render sẵn TRƯỚC ngăn kéo nên nếu cùng
 * z-index sẽ bị ngăn kéo đè lên khi mở từ trong ngăn kéo (bổ nhiệm, kết thúc bổ nhiệm, mật khẩu tạm).
 */
export const MODAL_Z = 1100;
