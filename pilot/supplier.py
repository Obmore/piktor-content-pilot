"""Read-only exact supplier candidate matching; never marks facts as verified."""

import csv
from pathlib import Path

from .safety import PilotError, canonical_brand, manufacturer_key, safe_url, validate_sku


REQUIRED_COLUMNS = {"brand", "manufacturer_sku", "name", "source_url"}


def match_supplier(dataset, csv_path, delimiter=","):
    if delimiter not in {",", ";", "\t"}:
        raise PilotError("Supplier delimiter must be comma, semicolon or tab.")
    path = Path(csv_path)
    if path.stat().st_size > 16 * 1024 * 1024:
        raise PilotError("Supplier CSV exceeds 16 MiB.")
    index = {}
    try:
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream, delimiter=delimiter)
            columns = reader.fieldnames or []
            if len(columns) != len(set(columns)) or not REQUIRED_COLUMNS.issubset(columns):
                raise PilotError("Supplier CSV needs unique columns: brand,manufacturer_sku,name,source_url.")
            for number, row in enumerate(reader, start=2):
                if None in row or any(row.get(key) is None for key in REQUIRED_COLUMNS):
                    raise PilotError(f"Supplier CSV row {number}: column count does not match the header.")
                brand = canonical_brand(row["brand"])
                sku = validate_sku(row["manufacturer_sku"], f"supplier row {number} manufacturer_sku")
                if brand == "Festa" and not sku.startswith("L"):
                    raise PilotError(f"Supplier row {number}: Festa manufacturer SKU must retain L.")
                if not row["name"].strip() or not safe_url(row["source_url"]):
                    raise PilotError(f"Supplier row {number}: product name and valid source URL are required.")
                candidate = {
                    "row": number,
                    "brand": brand,
                    "manufacturer_sku": sku,
                    "name": row["name"],
                    "source_url": row["source_url"],
                }
                # Supplier content is deliberately not copied into proposals.
                index.setdefault((brand, sku), []).append(candidate)
    except (UnicodeError, csv.Error) as exc:
        raise PilotError(f"Cannot read supplier CSV: {exc}") from exc
    records = []
    for product in dataset["products"]:
        key = (canonical_brand(product["brand"]), manufacturer_key(product["brand"], product["shop_sku"]))
        candidates = index.get(key, [])
        records.append({
            "shop_sku": product["shop_sku"],
            "expected_manufacturer_sku": key[1],
            "status": "exact_key_candidate_requires_review" if len(candidates) == 1 else ("ambiguous_blocked" if candidates else "no_match"),
            "candidates": candidates,
            "dataset_changed": False,
        })
    return {
        "schema_version": 1,
        "mode": "read_only_supplier_match",
        "notice": "An exact key is only a candidate. A person must verify manufacturer, product variant, source authenticity and usage rights; no proposal or approval is changed.",
        "summary": {
            "products": len(records),
            "exact_candidates": sum(record["status"] == "exact_key_candidate_requires_review" for record in records),
            "ambiguous": sum(record["status"] == "ambiguous_blocked" for record in records),
            "unmatched": sum(record["status"] == "no_match" for record in records),
        },
        "products": records,
    }
