from __future__ import annotations

import pytest

from Crawl4AI.extract_numeric_metrics import (
    ExtractionError,
    PageMetrics,
    normalize_integer_value,
    normalize_numeric_value,
    parse_extracted_metrics,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("$1,499.00", 1499.0),
        ("12.5k", 12_500.0),
        ("AED 2.4 million", 2_400_000.0),
        ("(€3.5k)", -3500.0),
        ("12.5%", 12.5),
    ],
)
def test_normalize_numeric_value(raw: str, expected: float) -> None:
    assert normalize_numeric_value(raw) == expected


def test_normalize_integer_value_rejects_fractions() -> None:
    assert normalize_integer_value("12.5k") == 12_500
    with pytest.raises(ValueError, match="whole number"):
        normalize_integer_value("12.5")


def test_page_metrics_normalizes_llm_numbers_and_rejects_extra_fields() -> None:
    metrics = PageMetrics.model_validate(
        {
            "currency_code": "aed",
            "price": "$1,499.00",
            "monthly_revenue": None,
            "annual_revenue": "12.5k",
            "customer_count": "3k",
            "employee_count": None,
            "conversion_rate_percent": "12.5%",
        }
    )

    assert metrics.currency_code == "AED"
    assert metrics.price == 1499.0
    assert metrics.annual_revenue == 12_500.0
    assert metrics.customer_count == 3000
    assert metrics.conversion_rate_percent == 12.5

    with pytest.raises(ValueError, match="Extra inputs"):
        PageMetrics.model_validate(
            {
                "price": 10,
                "unexpected": 3,
            }
        )


def test_parse_extracted_metrics_accepts_single_object_list() -> None:
    metrics = parse_extracted_metrics('[{"price": "12.5k"}]')
    assert metrics.price == 12_500.0

    with pytest.raises(ExtractionError, match="exactly one metrics object"):
        parse_extracted_metrics('[{"price": 10}, {"price": 20}]')
