from __future__ import annotations

from temporalio import activity


@activity.defn
async def deliver_message(message: str) -> str:
    activity.logger.info("Delivered message: %s", message)
    return message
