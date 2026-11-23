/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { tr } from "../../i18n";

export const SAMPLE_REGULATION = tr(
  "QUY TRÌNH: Phê duyệt đề nghị mua sắm\nMã quy trình: phe_duyet_mua_sam\nMục đích: Thống nhất cách lập, duyệt và đặt hàng các đề nghị mua sắm.\nPhạm vi áp dụng: Toàn công ty.\n\nCÁC BƯỚC THỰC HIỆN\n\nBước 1. Lập đề nghị mua sắm\n  Người thực hiện: Nhân viên mua hàng\n  Thời hạn: 2 ngày\n  Mô tả: Điền đủ nhà cung cấp, số lượng và đơn giá.\n  Tiếp theo: Bước 2\n\nBước 2. Trưởng phòng duyệt [Phê duyệt]\n  Người thực hiện: Trưởng phòng\n  Nếu đồng ý: chuyển Bước 3\n  Nếu từ chối: kết thúc (Từ chối)\n  Nếu cần bổ sung: quay lại Bước 1\n\nBước 3. Đặt hàng\n  Người thực hiện: Nhân viên mua hàng\n  Thời hạn: 48 giờ\n  Tiếp theo: kết thúc (Hoàn thành)\n",
);
