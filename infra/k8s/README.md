<!--
SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
SPDX-License-Identifier: Apache-2.0
-->

# Triển khai Kubernetes (k3s, GitOps): chỗ dành sẵn

Thư mục này **chưa có manifest**. Bamboo hiện chạy bằng Docker Compose: `compose.yaml` ở gốc repo include các tệp trong
`infra/compose/` (ADR #13), image dựng từ `infra/docker/` và `infra/platform/`.

Khi chuyển sang k3s, cấu hình đặt ở đây, tách theo cùng nhóm với `infra/compose/`:

| Thư mục dự kiến | Nội dung |
|---|---|
| `base/` | Kustomize cho từng nhóm dịch vụ (core, data, ai, scan), dùng chung image `ghcr.io/ctubamboo/bamboo-*` |
| `overlays/<môi-trường>/` | Khác biệt theo môi trường (tài nguyên, tên miền, số bản sao) |
| `argocd/` | Ứng dụng ArgoCD trỏ vào overlay; Git là nguồn duy nhất, như cấu hình cổng APISIX standalone (ADR #34) |

Nguyên tắc giữ nguyên khi chuyển: mỗi dịch vụ một danh tính riêng (CSDL, OpenBao AppRole, S3, Kafka), bí mật chỉ lấy từ
OpenBao, tệp tải lên vào `bms-quarantine` trước khi quét. Vòng đối soát hiện tại cho Compose là
`tools/gitops/reconcile.sh`.
