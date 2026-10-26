# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import pathlib

import pytest

from app import process_design

PROCESSES = pathlib.Path(__file__).resolve().parents[3] / "platform/flowable/processes"
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
