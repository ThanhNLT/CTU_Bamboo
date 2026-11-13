# Bamboo - DX-OS Open-Core
# @version 0.5.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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

FROM postgres:17
LABEL org.opencontainers.image.title="bamboo-migrate" \
      org.opencontainers.image.description="Bamboo DX-OS: migration và kiểm thử CSDL (chạy một lần rồi thoát)" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY db /repo/db
COPY tools/db /repo/tools/db
RUN find /repo -type f \( -name '*.sh' -o -name '*.sql' \) -exec sed -i 's/\r$//' {} + && chmod 0755 /repo/tools/db/*.sh
ENTRYPOINT ["/repo/tools/db/up.sh"]
