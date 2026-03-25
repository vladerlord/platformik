from __future__ import annotations

from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from platformik_service_ai.temporal.activities import deliver_message
    from platformik_service_ai.temporal.types import (
        FlowNode,
        InteractiveFlowParams,
        InteractiveFlowResult,
        InteractiveFlowState,
    )


def _resolve_option(raw: str, node: FlowNode) -> tuple[str, str] | None:
    """Return selected option label and next_node_id, or None if invalid."""
    if raw.isdigit():
        idx = int(raw) - 1
        if 0 <= idx < len(node.options):
            option = node.options[idx]
            return option.label, option.next_node_id
    else:
        for opt in node.options:
            if opt.label.lower() == raw.lower():
                return opt.label, opt.next_node_id
    return None


@workflow.defn
class InteractiveDslWorkflow:
    def __init__(self) -> None:
        self._flow_version: str | None = None
        self._pending_question: str | None = None
        self._pending_options: list[str] = []
        self._awaiting_answer_key: str | None = None
        self._answers: dict[str, str] = {}
        self._delivered_messages: list[str] = []
        self._completed = False

    @workflow.run
    async def run(self, params: InteractiveFlowParams) -> InteractiveFlowResult:
        self._flow_version = params.definition.version
        nodes_by_id = {node.id: node for node in params.definition.nodes}
        current_node_id: str | None = params.definition.start_node_id
        context: dict[str, str] = {}

        while current_node_id is not None:
            node = nodes_by_id[current_node_id]

            if node.type == "start":
                current_node_id = node.next_node_id
                continue

            if node.type == "option_selection":
                if node.question is None:
                    raise ValueError(f"Node {node.id} is missing question")
                if not node.options:
                    raise ValueError(f"Node {node.id} has no options")

                answer_key = node.answer_key or f"{node.id}_selection"
                self._pending_question = node.question
                self._pending_options = [opt.label for opt in node.options]
                self._awaiting_answer_key = answer_key

                raw = ""
                selected: tuple[str, str] | None = None
                while selected is None:
                    await workflow.wait_condition(lambda: answer_key in self._answers)
                    raw = self._answers.pop(answer_key)
                    selected = _resolve_option(raw, node)
                    if selected is None:
                        options_hint = ", ".join(
                            f"{i + 1}. {opt.label}" for i, opt in enumerate(node.options)
                        )
                        self._delivered_messages.append(
                            f"Invalid selection: {raw!r}. Choose: {options_hint}"
                        )

                selected_label, next_node_id = selected
                context[answer_key] = selected_label
                self._pending_question = None
                self._pending_options = []
                self._awaiting_answer_key = None
                current_node_id = next_node_id
                continue

            if node.type == "send_message":
                if node.message_template is None:
                    raise ValueError(f"Node {node.id} is missing message_template")

                rendered_message = node.message_template.format(**context)
                delivered_message = await workflow.execute_activity(
                    deliver_message,
                    rendered_message,
                    schedule_to_close_timeout=timedelta(seconds=10),
                )
                self._delivered_messages.append(delivered_message)
                current_node_id = node.next_node_id
                continue

            if node.type == "end":
                current_node_id = None
                continue

            raise ValueError(f"Unsupported node type: {node.type}")

        self._completed = True
        return InteractiveFlowResult(
            workflow_id=workflow.info().workflow_id,
            flow_version=params.definition.version,
            answers=dict(context),
            delivered_messages=list(self._delivered_messages),
        )

    @workflow.signal
    def submit_answer(self, answer: str) -> None:
        if self._awaiting_answer_key is None:
            workflow.logger.warning("Ignoring answer without pending question")
            return
        self._answers[self._awaiting_answer_key] = answer

    @workflow.query
    def pending_question(self) -> str | None:
        return self._pending_question

    @workflow.query
    def workflow_state(self) -> InteractiveFlowState:
        return InteractiveFlowState(
            flow_version=self._flow_version,
            pending_question=self._pending_question,
            delivered_messages=list(self._delivered_messages),
            awaiting_answer=self._awaiting_answer_key is not None,
            completed=self._completed,
            pending_options=list(self._pending_options),
        )
