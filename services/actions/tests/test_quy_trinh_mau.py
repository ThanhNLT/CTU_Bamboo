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

import pathlib

import pytest

from app import process_design

PROCESSES = pathlib.Path(__file__).resolve().parents[3] / "infra/platform/flowable/processes"
FILES = sorted(PROCESSES.glob("*.bpmn20.xml"))


def test_co_du_quy_trinh_mau():
    assert {f.name.removesuffix(".bpmn20.xml") for f in FILES} == {
        "onboardingApproval",
        "transferApproval",
        "icOrderConfirmation",
        "kbDocumentProposal",
        "personnelDecision",
        "crossGroupTransfer",
    }


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_quy_trinh_mau_khong_loi_va_khong_canh_bao(path):
    xml = path.read_text(encoding="utf-8")
    forms = [{"key": k} for k in process_design.re.findall(r'flowable:formKey="([^"]+)"', xml)]
    assert process_design.lint(xml, forms) == []
    assert f'<process id="{path.name.removesuffix(".bpmn20.xml")}"' in xml
