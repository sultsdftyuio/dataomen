from __future__ import annotations

import pytest
from sqlalchemy.engine import make_url

from api.services.database_connection import database_url, postgres_connect_args

_URL_ENV_VARS = ("DATABASE_URL", "SUPABASE_DB_URL", "POSTGRES_URL")


@pytest.fixture(autouse=True)
def _clear_database_url_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in _URL_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


@pytest.mark.parametrize(
    "raw_url",
    ["postgres://u:p@pooler:6543/db", "postgresql://u:p@pooler:6543/db"],
)
def test_driverless_urls_are_pinned_to_psycopg3(
    monkeypatch: pytest.MonkeyPatch, raw_url: str
) -> None:
    monkeypatch.setenv("DATABASE_URL", f"  {raw_url}  ")

    url = database_url()

    assert url == "postgresql+psycopg://u:p@pooler:6543/db"
    assert postgres_connect_args(url)["prepare_threshold"] is None


def test_explicit_driver_is_left_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://u:p@h/db")

    assert database_url() == "postgresql+psycopg2://u:p@h/db"


def test_falls_back_past_blank_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "   ")
    monkeypatch.setenv("POSTGRES_URL", "postgres://u:p@h/db")

    assert database_url() == "postgresql+psycopg://u:p@h/db"


def test_missing_url_names_every_variable() -> None:
    with pytest.raises(RuntimeError, match="DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL"):
        database_url()


def test_explicit_psycopg3_url_disables_prepared_statements() -> None:
    args = postgres_connect_args("postgresql+psycopg://u:p@pooler:6543/db", sslmode="require")

    assert args == {"sslmode": "require", "prepare_threshold": None}


def test_psycopg2_url_does_not_receive_psycopg3_option() -> None:
    assert postgres_connect_args("postgresql+psycopg2://u:p@pooler:6543/db") == {}


def test_bare_url_follows_the_driver_sqlalchemy_resolves() -> None:
    # SQLAlchemy 2.1 maps a bare postgresql:// URL to Psycopg 3. Production hit
    # DuplicatePreparedStatement because the option was keyed on the URL text.
    url = "postgresql://u:p@pooler:6543/db"
    resolves_to_psycopg3 = make_url(url).get_dialect().driver == "psycopg"

    assert ("prepare_threshold" in postgres_connect_args(url)) is resolves_to_psycopg3


def test_unparseable_url_passes_connect_args_through() -> None:
    assert postgres_connect_args("not a url", timeout=5) == {"timeout": 5}
