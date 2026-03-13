import asyncio

from temporalio.worker import Worker

from platformik_service_ai.config import load_settings
from platformik_service_ai.container import build_container
from platformik_service_ai.temporal.activities import deliver_message
from platformik_service_ai.temporal.workflow import InteractiveDslWorkflow


async def serve() -> None:
    settings = load_settings()
    container = await build_container(settings=settings)

    worker = Worker(
        client=container.temporal_client,
        task_queue=settings.temporal_task_queue,
        workflows=[InteractiveDslWorkflow],
        activities=[deliver_message],
    )

    try:
        await worker.run()
    finally:
        await container.close()


def main() -> None:
    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        pass
