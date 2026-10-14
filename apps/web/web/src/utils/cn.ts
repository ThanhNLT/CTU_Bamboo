// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");
