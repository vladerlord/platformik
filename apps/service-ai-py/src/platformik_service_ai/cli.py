from __future__ import annotations

import asyncio

import typer

from platformik_service_ai.config import load_settings
from platformik_service_ai.container import build_container

app = typer.Typer(no_args_is_help=True)


@app.command("dsl-chat")
def dsl_chat_command() -> None:
    asyncio.run(_run_chat())


async def _run_chat() -> None:
    from platformik_service_ai.tui.loop import run_dsl_chat

    settings = load_settings()
    container = await build_container(settings=settings)
    await run_dsl_chat(container)


if __name__ == "__main__":
    app()
