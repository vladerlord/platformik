from dataclasses import dataclass

from temporalio.client import Client

from platformik_service_ai.config import AppSettings


@dataclass
class AppContainer:
    temporal_client: Client

    async def close(self) -> None:
        pass


async def build_container(settings: AppSettings) -> AppContainer:
    return AppContainer(
        temporal_client=await Client.connect(
            target_host=settings.temporal_address, namespace=settings.temporal_namespace
        )
    )
