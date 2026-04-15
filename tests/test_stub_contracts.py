from pathlib import Path

from tests.stub_registry import install_default_import_stubs


def test_stub_registry_has_canonical_service_entries() -> None:
    registry = install_default_import_stubs(ensure_models=True)

    expected_services = {
        "cache_manager",
        "compute_engine",
        "insight_orchestrator",
        "narrative_service",
        "nl2sql_generator",
    }

    assert expected_services.issubset(set(registry.services.keys()))


def test_stub_contracts_match_real_service_signatures() -> None:
    registry = install_default_import_stubs(ensure_models=True)
    project_root = Path(__file__).resolve().parents[1]

    mismatches = registry.validate_contracts(project_root=project_root)

    assert mismatches == []
