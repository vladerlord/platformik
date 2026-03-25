from __future__ import annotations

import asyncio
from typing import cast

import typer

from platformik_service_ai.container import AppContainer
from platformik_service_ai.tui.client import (
    describe_active_workflow,
    get_workflow_handle,
    get_workflow_state,
    print_delivered_messages,
    send_answer,
)
from platformik_service_ai.tui.commands import handle_slash_command
from platformik_service_ai.tui.commands.help import print_chat_help
from platformik_service_ai.tui.types import ChatSession, CommandContext


async def run_dsl_chat(container: AppContainer) -> None:
    client = container.temporal_client
    session = ChatSession()
    context = CommandContext(client=client, session=session)

    typer.echo("Interactive DSL chat")
    print_chat_help()

    try:
        while True:
            prompt = f"{session.workflow_id}> " if session.active else "> "

            try:
                raw_input = await asyncio.to_thread(input, prompt)
            except EOFError:
                break

            line = raw_input.strip()
            if not line:
                continue

            if line.startswith("/"):
                should_continue = await handle_slash_command(line, context)
                if not should_continue:
                    break
                continue

            if not session.active:
                typer.echo("No active workflow. Use /start or /attach.")
                continue

            handle = get_workflow_handle(client, cast(str, session.workflow_id))
            state = await get_workflow_state(handle)
            session.seen_messages = print_delivered_messages(
                state.delivered_messages,
                session.seen_messages,
            )

            if not state.awaiting_answer:
                typer.echo("Workflow is not waiting for an answer. Use /status.")
                continue

            await send_answer(handle, line)
            is_active, session.seen_messages = await describe_active_workflow(
                handle,
                session.seen_messages,
                wait_for_visible_state=True,
            )
            if not is_active:
                session.workflow_id = None
    finally:
        await container.close()
