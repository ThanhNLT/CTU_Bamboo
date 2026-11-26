<!--
  Bamboo - DX-OS Open-Core
  @version 0.5.2
  @author CTUBamboo
  @copyright Copyright 2026 Bamboo
  @license Apache-2.0
  @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

# Nhật ký chuyển kho mã sang ThanhNLT/CTU_Bamboo

Trang này ghi lại vì sao kho mã của Bamboo đổi địa chỉ ngay trước hạn chấm, để ban giám khảo đối chiếu lịch sử dự án trên
GitHub.

## Tóm tắt

- **Kho hiện tại:** <https://github.com/ThanhNLT/CTU_Bamboo> (công khai). Đây là nơi duy nhất cập nhật mã nguồn từ ngày
  26/11/2026.
- **Kho trước đó:** `https://github.com/CTUBamboo/Bamboo` (tài khoản CTUBamboo của nhóm). Ngày 26/11/2026 GitHub khóa tài
  khoản này; kho cũ không truy cập được.
- **Nguyên nhân:** GitHub chỉ thông báo tài khoản vi phạm Điều khoản dịch vụ, **không nêu vi phạm cụ thể**. Nhóm đã gửi
  yêu cầu xem xét tới GitHub Support và đang chờ trả lời.
- **Lịch sử mã nguồn không mất:** toàn bộ commit, nhánh và thẻ phiên bản đã chuyển sang kho mới. Những gì GitHub lưu
  ngoài git (pull request, issue, bình luận, lịch sử CI, bản phát hành, image) còn nằm ở kho cũ.

## Diễn biến

| Thời điểm (giờ Việt Nam) | Sự việc |
|---|---|
| 02/10/2026 | Commit đầu tiên của dự án, kho `ThanhNLT/Bamboo` |
| 07/11/2026 | Chuyển kho sang tài khoản nhóm `CTUBamboo/Bamboo` (GitHub tự chuyển hướng địa chỉ cũ) |
| 24/11/2026 | Phát hành 0.5.2; đặt lại tiêu đề tiếng Anh cho các pull request cũ |
| 24–26/11/2026 | Phát triển tiếp trên các pull request #136–#145 (tìm kiếm ngữ nghĩa, image GHCR, truy vết, mTLS, ký số, Kubernetes) |
| 26/11/2026, khoảng 15:30 | Mọi truy cập vào tài khoản CTUBamboo (web, API, `git push`) bị từ chối với thông báo: *"Access to your account has been suspended due to a violation of our Terms of Service. Please contact support for more information."* |
| 26/11/2026, chiều | Gửi yêu cầu xem xét tới GitHub Support kèm mô tả hoạt động của tài khoản; chưa có trả lời |
| 26/11/2026, chiều | Đẩy toàn bộ lịch sử git từ bản trên máy sang `ThanhNLT/CTU_Bamboo` (111 nhánh, 7 thẻ phiên bản `v0.1.0`–`v0.5.2`); đổi mọi đường dẫn trong mã sang kho mới (PR #2) |
| 26/11/2026, tối | Mở lại các pull request còn dang dở (#3–#10), ghi danh sách pull request của kho cũ ([trang lịch sử](06-lich-su-pull-request.md), PR #11), merge vào `main` |

## Những gì đã chuyển và chưa chuyển được

| Nội dung | Trạng thái |
|---|---|
| Commit, nhánh, thẻ phiên bản | Đã chuyển đầy đủ; mã nguồn mỗi commit giữ nguyên |
| Pull request đang mở | Mở lại trên kho mới, cùng nhánh và tiêu đề, mô tả ghi số PR cũ |
| Pull request đã merge hoặc đã đóng | Không tạo lại được trên GitHub; danh sách đủ 114 PR (số, tiêu đề, nhánh, trạng thái) ở [Lịch sử pull request](06-lich-su-pull-request.md); nội dung đã nằm trong lịch sử `main` |
| Issue, bình luận, review | Còn ở kho cũ |
| Lịch sử chạy GitHub Actions | Còn ở kho cũ; kho mới chạy CI lại từ ngày 26/11/2026 |
| Bản phát hành (Releases) và image `ghcr.io/ctubamboo/*` | Còn ở kho cũ; image mới đổi sang `ghcr.io/thanhnlt/*` |

## Người thực hiện commit

Tài khoản CTUBamboo là tài khoản chung của nhóm nên nhiều commit đứng tên CTUBamboo. Khi chuyển kho (26/11/2026), lịch sử
được ghi lại để mỗi commit đứng tên thành viên phụ trách phần việc mà commit đó sửa nhiều nhất: backend, cơ sở dữ liệu,
hạ tầng, tài liệu là **ThanhNLT**; giao diện web và kiểm thử giao diện là **LeeHuy**; AI, OCR là **nauxi-xl**. Ba người đều
là thành viên được mời vào kho. Nội dung và thời điểm của từng commit không đổi; mã commit đổi theo, nên mã commit trong
tài liệu viết trước ngày này không còn khớp.

## Sau khi GitHub trả lời

Nếu tài khoản CTUBamboo được mở lại, nhóm sẽ chuyển quyền sở hữu kho cũ sang ThanhNLT để giữ nguyên pull request, issue
và bình luận gốc, rồi ghi bổ sung vào trang này.
