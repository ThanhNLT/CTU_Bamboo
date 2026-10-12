// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Paperclip } from "lucide-react";
import type { UserMsg } from "../types";

/** Tin nhắn người dùng: căn phải, bong bóng xám nhạt. */
export const UserMessage = ({ msg }: { msg: UserMsg }) => (
  <div className="flex justify-end">
    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-black/[0.05] px-4 py-2.5 text-[13.5px] leading-relaxed text-ink sm:max-w-[70%]">
      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
      {msg.files?.length ? (
        <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-1.5 p-0">
          {msg.files.map((f) => (
            <li key={f} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11.5px] text-body">
              <Paperclip className="h-3 w-3" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  </div>
);
