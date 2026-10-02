import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    actions_secret: str
    flowable_url: str
    flowable_user: str
    flowable_password: str
    hasura_url: str
    hasura_admin_secret: str


def load() -> Settings:
    env = os.environ.get
    return Settings(
        database_url=env("DATABASE_URL", "postgresql://bms:bms-dev@db:5432/bms"),
        actions_secret=env("ACTIONS_SECRET", "dev-actions-secret"),
        flowable_url=env("FLOWABLE_URL", "http://flowable:8080/flowable-rest/service"),
        flowable_user=env("FLOWABLE_USER", "rest-admin"),
        flowable_password=env("FLOWABLE_PASSWORD", "test"),
        hasura_url=env("HASURA_URL", "http://hasura:8080"),
        hasura_admin_secret=env("HASURA_GRAPHQL_ADMIN_SECRET", "dev-admin-secret"),
    )
