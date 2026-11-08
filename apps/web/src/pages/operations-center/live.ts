import { createContext, useContext } from "react";

import type { LiveTopic } from "../../live/useLive";

/** Mọi chủ đề số liệu của Trung tâm điều hành: một subscription cho cả trang (ADR #64). */
export const OPS_TOPICS: LiveTopic[] = [
  "approval",
  "procurement",
  "ic",
  "production",
  "hr",
  "iot",
  "kpi",
  "files",
  "org",
];

/** Tăng mỗi khi có tín hiệu thay đổi; các bảng số liệu tải lại khi giá trị đổi. */
export const OpsLiveContext = createContext(0);

export const useOpsLiveTick = () => useContext(OpsLiveContext);
