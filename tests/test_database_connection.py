from __future__ import annotations

from sqlalchemy.engine import make_url

from api.services.database_connection import postgres_connect_args


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
