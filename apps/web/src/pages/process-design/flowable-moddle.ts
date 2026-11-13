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

import { tr } from "../../i18n";

export const flowableModdle = {
  name: "Flowable",
  uri: "http://flowable.org/bpmn",
  prefix: "flowable",
  xml: { tagAlias: "lowerCase" },
  types: [
    {
      name: "UserTaskProps",
      extends: ["bpmn:UserTask"],
      properties: [
        { name: "assignee", isAttr: true, type: "String" },
        { name: "candidateUsers", isAttr: true, type: "String" },
        { name: "candidateGroups", isAttr: true, type: "String" },
        { name: "dueDate", isAttr: true, type: "String" },
        { name: "formKey", isAttr: true, type: "String" },
      ],
    },
    {
      name: "ServiceTaskProps",
      extends: ["bpmn:ServiceTask"],
      properties: [
        { name: "class", isAttr: true, type: "String" },
        { name: "expression", isAttr: true, type: "String" },
        { name: "delegateExpression", isAttr: true, type: "String" },
        { name: "type", isAttr: true, type: "String" },
      ],
    },
  ],
};

export const bambooModdle = {
  name: "Bamboo",
  uri: "http://bamboo.local/bpmn",
  prefix: "bamboo",
  xml: { tagAlias: "lowerCase" },
  types: [
    {
      name: "AutomationProps",
      extends: ["bpmn:ServiceTask"],
      properties: [
        { name: "action", isAttr: true, type: "String" },
        { name: "audience", isAttr: true, type: "String" },
        { name: "message", isAttr: true, type: "String" },
        { name: "url", isAttr: true, type: "String" },
        { name: "method", isAttr: true, type: "String" },
        { name: "body", isAttr: true, type: "String" },
        { name: "value", isAttr: true, type: "String" },
        { name: "script", isAttr: true, type: "String" },
      ],
    },
  ],
};

export const newProcessXml = (key: string, name: string) => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:flowable="http://flowable.org/bpmn"
  targetNamespace="https://github.com/ThanhNLT/Bamboo/bpmn">
  <process id="${key}" name="${name.replace(/[<&"]/g, "")}" isExecutable="true">
    <startEvent id="start" name="${tr("Bắt đầu")}"/>
    <sequenceFlow id="toReview" sourceRef="start" targetRef="review"/>
    <userTask id="review" name="${tr("Duyệt")}" flowable:candidateGroups="TRUONG_PHONG" flowable:dueDate="PT48H"/>
    <sequenceFlow id="toEnd" sourceRef="review" targetRef="end"/>
    <endEvent id="end" name="${tr("Hoàn tất")}"/>
  </process>
  <bpmndi:BPMNDiagram id="diagram">
    <bpmndi:BPMNPlane id="plane" bpmnElement="${key}">
      <bpmndi:BPMNShape id="start_di" bpmnElement="start"><dc:Bounds x="152" y="182" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="review_di" bpmnElement="review"><dc:Bounds x="250" y="160" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="end_di" bpmnElement="end"><dc:Bounds x="432" y="182" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="toReview_di" bpmnElement="toReview"><di:waypoint x="188" y="200"/><di:waypoint x="250" y="200"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="toEnd_di" bpmnElement="toEnd"><di:waypoint x="370" y="200"/><di:waypoint x="432" y="200"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>
`;
