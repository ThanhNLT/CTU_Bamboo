<!--
  Bamboo - DX-OS Open-Core
  @version 0.5.2
  @author CTUBamboo
  @copyright Copyright 2026 Bamboo
  @license Apache-2.0
  @see https://github.com/CTUBamboo/Bamboo, Bamboo project

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

# Triển khai Kubernetes (k3s) và GitOps bằng Argo CD

Bamboo chạy chính bằng Docker Compose (ADR #13). Thư mục này là cùng hệ thống ở dạng manifest Kubernetes cho k3s một
node, đồng bộ bằng Argo CD (ADR #95). Manifest **sinh từ compose**, không viết tay: sửa `infra/compose/*.yml` rồi chạy

```bash
uv run --no-project --with pyyaml python tools/k8s/generate.py
```

CI (`.github/workflows/k8s.yml`) báo lỗi khi manifest lệch compose, kiểm schema, và dựng thử phần lõi trên cụm k3s tạm
(k3d) rồi chạy `tools/ci/gateway-smoke.sh` qua cổng API.

| Thư mục | Nội dung |
|---|---|
| `base/` | Mỗi dịch vụ một Deployment (dịch vụ chạy một lần như `migrate`, `openbao-init`, `bootstrap` thành Job) và Service; PVC cho volume có tên; ConfigMap cho tệp cấu hình; ServiceAccount cho init container chờ Job |
| `components/<nhóm>/` | Nhóm tùy chọn của compose (`observability`, `scan`), bật bằng `components:` trong overlay |
| `overlays/ci/` | Cụm thử: image dựng tại chỗ thẻ `dev`, Secret `bamboo-settings` từ mặc định của dev (`settings.env`), bỏ dịch vụ nặng (AI, OCR, Trino, Kafka, IoT) |
| `overlays/production/` | Image GHCR theo phiên bản, Ingress cho cổng API; Secret tạo ngoài Git |
| `argocd/application.yaml` | Application của Argo CD trỏ vào `overlays/production` (tự đồng bộ, prune, selfHeal) |

## Cài trên k3s

1. Cài k3s (một node) và Argo CD (`kubectl create namespace argocd && kubectl apply -n argocd -f
   https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml`).
2. Tạo Secret cài đặt từ tệp `.env` của bạn (cùng tên biến với `.env.example`; danh sách biến cần có xem
   `overlays/ci/settings.env`):

   ```bash
   kubectl create namespace bamboo
   kubectl -n bamboo create secret generic bamboo-settings --from-env-file=.env
   ```

   Hoặc dùng External Secrets Operator đọc từ OpenBao, Sealed Secrets: miễn ra Secret tên `bamboo-settings`.
3. Sửa host trong `overlays/production/ingress.yaml`, đặt các URL công khai trong Secret theo tên miền đó.
4. `kubectl apply -n argocd -f infra/k8s/argocd/application.yaml`. Argo CD dựng hệ thống và giữ cụm khớp nhánh `main`.

Thử trên máy bằng k3d: `k3d cluster create bamboo`, `docker compose build`, `k3d image import ghcr.io/ctubamboo/bamboo-<tên>:dev
-c bamboo`, `kubectl apply -k infra/k8s/overlays/ci`, `kubectl -n bamboo port-forward svc/gateway 8000:9080`.

## Khác với Compose

- `depends_on` thành init container: chờ Job xong (`kubectl wait`) hoặc chờ Service có pod sẵn sàng (`nc`).
- Không có `sleeper` (cần Docker API): Trino, Tika, Gotenberg, Ollama, OCR chạy thường trực; tên `trino`, `tika`... là
  Service trỏ thẳng vào chúng. Không có `vector` (đọc log container qua Docker): dùng bộ thu log của cụm.
- Volume là PVC `ReadWriteOnce`, nhiều pod dùng chung (`actions-secrets`...): cụm một node (local-path của k3s) chạy
  được; nhiều node cần storage `ReadWriteMany` (Longhorn, NFS).
- Mỗi biến `${TÊN:-mặc định}` của compose đọc từ Secret `bamboo-settings` (khóa `TÊN`); thiếu khóa thì giá trị rỗng.
- mTLS nội bộ (`infra/compose/mtls.yml`) chưa có bản Kubernetes: trong cụm nên dùng service mesh (Linkerd, Istio).
