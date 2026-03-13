from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

NodeType = Literal["start", "send_message", "option_selection", "end"]


@dataclass
class FlowNodeOption:
    label: str
    next_node_id: str


@dataclass
class FlowNode:
    id: str
    type: NodeType
    next_node_id: str | None = None
    question: str | None = None
    answer_key: str | None = None
    message_template: str | None = None
    options: list[FlowNodeOption] = field(default_factory=list)


@dataclass
class FlowDefinition:
    version: str
    start_node_id: str
    nodes: list[FlowNode]


@dataclass
class InteractiveFlowParams:
    definition: FlowDefinition


@dataclass
class InteractiveFlowResult:
    workflow_id: str
    flow_version: str
    answers: dict[str, str]
    delivered_messages: list[str]


@dataclass
class InteractiveFlowState:
    flow_version: str | None
    pending_question: str | None
    delivered_messages: list[str]
    awaiting_answer: bool
    completed: bool
    pending_options: list[str] = field(default_factory=list)
