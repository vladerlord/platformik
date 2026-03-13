from __future__ import annotations

import typer

from platformik_service_ai.tui.registry import load_registry
from platformik_service_ai.tui.types import CommandContext


async def handle_workflows_command(context: CommandContext, args: str) -> bool:
    del context, args
    registry = load_registry()

    if not registry:
        typer.echo("No workflows found.")
        return True

    typer.echo("Available workflows:")
    for name in sorted(registry):
        typer.echo(f"  {name}")

    return True
