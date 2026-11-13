/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

export const BambooLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <path d="M15.5 30C15.6 23 16 15 17.2 6" fill="none" stroke="#276533" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M17 12.5C20.5 6.8 26 4.8 29.5 4.5C28.6 8.6 24.2 13.6 17 14.4Z" fill="#3f9150" />
    <path d="M16 18.6C11.4 13.5 6 12.6 2.5 13.2C4.4 17 9.4 20.2 16 20.4Z" fill="#2f7a3e" />
    <path d="M16.6 9.6C14.6 5.6 11.6 3 8.6 2.4C8.8 5.8 11.6 9.4 16.6 11.2Z" fill="#63ab70" />
  </svg>
);
