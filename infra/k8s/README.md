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

# Triển khai Kubernetes (k3s, GitOps): chỗ dành sẵn

Thư mục này **chưa có manifest**. Bamboo hiện chạy bằng Docker Compose: `compose.yaml` ở gốc repo include các tệp trong
`infra/compose/` (ADR #13), image dựng từ `infra/docker/` và `infra/platform/`.

Khi chuyển sang k3s, cấu hình đặt ở đây, tách theo cùng nhóm với `infra/compose/`:

| Thư mục dự kiến | Nội dung |
|---|---|
| `base/` | Kustomize cho từng nhóm dịch vụ (core, data, ai, scan), dùng chung image `ghcr.io/thanhnlt/bamboo-*` |
| `overlays/<môi-trường>/` | Khác biệt theo môi trường (tài nguyên, tên miền, số bản sao) |
| `argocd/` | Ứng dụng ArgoCD trỏ vào overlay; Git là nguồn duy nhất, như cấu hình cổng APISIX standalone (ADR #34) |

Nguyên tắc giữ nguyên khi chuyển: mỗi dịch vụ một danh tính riêng (CSDL, OpenBao AppRole, S3, Kafka), bí mật chỉ lấy từ
OpenBao, tệp tải lên vào `bms-quarantine` trước khi quét. Vòng đối soát hiện tại cho Compose là
`tools/gitops/reconcile.sh`, chạy theo chu kỳ bằng `make gitops-enable`.
