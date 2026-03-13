from __future__ import annotations

import asyncio
from typing import Any, cast
from uuid import uuid4

import typer

from platformik_service_ai.config import load_settings
from platformik_service_ai.temporal.types import (
    FlowDefinition,
    InteractiveFlowParams,
    InteractiveFlowResult,
    InteractiveFlowState,
)
from platformik_service_ai.temporal.workflow import InteractiveDslWorkflow

settings = load_settings()


def print_delivered_messages(messages: list[str], seen_messages: int) -> int:
    for message in messages[seen_messages:]:
        typer.echo("Delivered:")
        typer.echo(message)
    return len(messages)


def print_workflow_result(result: InteractiveFlowResult, seen_messages: int) -> int:
    typer.echo(f"workflow_id={result.workflow_id}")
    typer.echo(f"flow_version={result.flow_version}")
    next_seen_messages = print_delivered_messages(result.delivered_messages, seen_messages)
    typer.echo("Workflow completed.")
    return next_seen_messages


async def maybe_get_workflow_result(
    handle: Any, timeout_seconds: float = 0.2
) -> InteractiveFlowResult | None:
    try:
        return cast(
            InteractiveFlowResult,
            await asyncio.wait_for(handle.result(), timeout=timeout_seconds),
        )
    except TimeoutError:
        return None


async def get_workflow_state(handle: Any) -> InteractiveFlowState:
    state = await handle.query("workflow_state", result_type=InteractiveFlowState)
    if isinstance(state, InteractiveFlowState):
        return state
    return InteractiveFlowState(**cast(dict[str, Any], state))


async def describe_active_workflow(
    handle: Any,
    seen_messages: int,
    *,
    wait_for_visible_state: bool = False,
) -> tuple[bool, int]:
    attempts = 10 if wait_for_visible_state else 1

    for attempt in range(attempts):
        result = await maybe_get_workflow_result(handle)
        if result is not None:
            next_seen_messages = print_workflow_result(result, seen_messages)
            return False, next_seen_messages

        state = await get_workflow_state(handle)
        next_seen_messages = print_delivered_messages(state.delivered_messages, seen_messages)

        if state.pending_question is not None:
            typer.echo(f"Question: {state.pending_question}")
            if state.pending_options:
                for i, label in enumerate(state.pending_options, start=1):
                    typer.echo(f"  {i}. {label}")
            return True, next_seen_messages

        if state.awaiting_answer:
            typer.echo("Workflow is waiting for an answer.")
            return True, next_seen_messages

        if attempt < attempts - 1:
            await asyncio.sleep(0.1)
            continue

        typer.echo("Workflow is running.")
        return True, next_seen_messages

    return True, seen_messages


async def start_workflow(
    client: Any,
    definition: FlowDefinition,
    workflow_id: str | None = None,
) -> tuple[Any, str]:
    handle = await client.start_workflow(
        cast(Any, InteractiveDslWorkflow.run),
        InteractiveFlowParams(definition=definition),
        id=workflow_id or f"service-ai-dsl-{uuid4()}",
        task_queue=settings.temporal_task_queue,
        result_type=InteractiveFlowResult,
    )
    return handle, cast(str, handle.id)


def get_workflow_handle(client: Any, workflow_id: str) -> Any:
    return client.get_workflow_handle(
        workflow_id,
        result_type=InteractiveFlowResult,
    )


async def send_answer(handle: Any, answer: str) -> None:
    await handle.signal(InteractiveDslWorkflow.submit_answer, answer)
