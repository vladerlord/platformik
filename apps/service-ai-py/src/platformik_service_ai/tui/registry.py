from __future__ import annotations

import json
from pathlib import Path

from platformik_service_ai.temporal.types import FlowDefinition, FlowNode, FlowNodeOption

_WORKFLOWS_DIR = Path(__file__).parent.parent / "workflows"


def _load_node(data: dict) -> FlowNode:
    options = [FlowNodeOption(**opt) for opt in data.pop("options", [])]
    return FlowNode(**data, options=options)


def load_flow(path: Path) -> FlowDefinition:
    data = json.loads(path.read_text())
    nodes = [_load_node(dict(node)) for node in data["nodes"]]
    return FlowDefinition(
        version=data["version"],
        start_node_id=data["start_node_id"],
        nodes=nodes,
    )


def load_registry() -> dict[str, FlowDefinition]:
    if not _WORKFLOWS_DIR.exists():
        return {}
    return {path.stem: load_flow(path) for path in sorted(_WORKFLOWS_DIR.glob("*.json"))}
