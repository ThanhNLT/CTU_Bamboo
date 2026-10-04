// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Show, TextField } from "@refinedev/antd";
import { useShow } from "@refinedev/core";
import { Typography } from "antd";
import React from "react";
import { CATEGORIES_QUERY } from "./queries";

const { Title } = Typography;

export const CategoryShow = () => {
  const { result: record, query } = useShow({
    meta: {
      fields: CATEGORIES_QUERY,
    },
  });
  const { isLoading } = query;

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>{"ID"}</Title>
      <TextField value={record?.id} />
      <Title level={5}>{"Title"}</Title>
      <TextField value={record?.title} />
    </Show>
  );
};
