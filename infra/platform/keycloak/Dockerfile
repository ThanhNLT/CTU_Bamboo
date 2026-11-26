# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

FROM quay.io/keycloak/keycloak:26.8.0
LABEL org.opencontainers.image.title="bamboo-keycloak" \
      org.opencontainers.image.description="Bamboo: Keycloak kèm realm bms" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/CTU_Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/CTU_Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY realm/ /opt/keycloak/data/import/
COPY themes/ /opt/keycloak/themes/
