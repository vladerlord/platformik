from __future__ import annotations

import typer

from platformik_service_ai.tui.client import describe_active_workflow, start_workflow
from platformik_service_ai.tui.registry import load_registry
from platformik_service_ai.tui.types import CommandContext


async def handle_start_command(context: CommandContext, args: str) -> bool:
    flow_name = args.split()[0] if args.split() else ""
    registry = load_registry()

    if not flow_name:
        typer.echo("Usage: /start <flow_name>")
        typer.echo(f"Available flows: {', '.join(registry)}")
        return True

    definition = registry.get(flow_name)
    if definition is None:
        typer.echo(f"Unknown flow: {flow_name!r}")
        typer.echo(f"Available flows: {', '.join(registry)}")
        return True

    handle, workflow_id = await start_workflow(context.client, definition)
    context.session.workflow_id = workflow_id
    context.session.seen_messages = 0
    typer.echo(f"Workflow started: {workflow_id}")
    _, context.session.seen_messages = await describe_active_workflow(
        handle,
        context.session.seen_messages,
        wait_for_visible_state=True,
    )
    return True
