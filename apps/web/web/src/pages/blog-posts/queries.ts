// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export const BLOG_POSTS_QUERY = [
  "id",
  "title",
  "status",
  "created_at",
  "category_id",
  "content",
  {
    category: ["id", "title"],
  },
];

export const BLOG_POSTS_CATEGORIES_SELECT_QUERY = ["id", "title"];
