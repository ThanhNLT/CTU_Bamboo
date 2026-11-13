-- Bamboo - DX-OS Open-Core
-- @version 0.5.1
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

ALTER TABLE core.tenant
    ADD COLUMN industry text CHECK (length(btrim(industry)) BETWEEN 1 AND 100),
    ADD COLUMN size_band text CHECK (size_band IN ('1-10', '11-50', '51-200', '200+'));

ALTER TABLE core.tenant DROP CONSTRAINT tenant_tax_code_check;
ALTER TABLE core.tenant ADD CONSTRAINT tenant_tax_code_check
    CHECK (tax_code ~ '^([0-9]{10}(-[0-9]{3})?|[0-9]{12})$');

ALTER TABLE core.person
    ADD COLUMN birth_year smallint CHECK (birth_year BETWEEN 1900 AND 2100),
    ADD COLUMN phone text CHECK (phone ~ '^\+?[0-9 .-]{8,20}$'),
    ADD COLUMN email text CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
