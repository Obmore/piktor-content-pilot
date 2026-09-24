"""Dataset loading, structural validation and explicit review eligibility."""

import hashlib
import json
from pathlib import Path

from .safety import (
    PilotError,
    canonical_brand,
    manufacturer_key,
    safe_url,
    validate_description,
    validate_sku,
    xml_text_valid,
)


MANUFACTURER_KINDS = {"manufacturer", "manufacturer_catalog"}
DESCRIPTION_FIELDS = ("proposed_short", "proposed_long")


def _unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise PilotError(f"Duplicate JSON field: {key}")
        result[key] = value
    return result


def load_json(path):
    path = Path(path)
    if path.stat().st_size > 16 * 1024 * 1024:
        raise PilotError("Input exceeds the pilot's 16 MiB limit.")
    try:
        return json.loads(
            path.read_text(encoding="utf-8-sig"),
            object_pairs_hook=_unique_pairs,
            parse_constant=lambda value: (_ for _ in ()).throw(PilotError(f"Invalid JSON number: {value}")),
        )
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise PilotError(f"Cannot read JSON: {exc}") from exc


def _text(value, location, *, allow_empty=False):
    if not isinstance(value, str) or (not allow_empty and not value.strip()) or not xml_text_valid(value):
        raise PilotError(f"{location}: expected {'a string' if allow_empty else 'nonempty text'}.")


def _sources(record, location):
    sources = record.get("sources", [])
    if not isinstance(sources, list):
        raise PilotError(f"{location}.sources: expected a list.")
    for source in sources:
        if not isinstance(source, dict) or not safe_url(source.get("url")):
            raise PilotError(f"{location}.sources: expected valid HTTP(S) source URLs.")
        _text(source.get("title"), f"{location}.sources.title")
        _text(source.get("kind"), f"{location}.sources.kind")


def validate_dataset(data):
    if not isinstance(data, dict) or type(data.get("schema_version")) is not int or data["schema_version"] != 1:
        raise PilotError("Expected dataset schema_version=1.")
    if not isinstance(data.get("products"), list):
        raise PilotError("Dataset products must be a list.")
    _text(data.get("observed_at"), "observed_at")
    seen_ids, seen_shop_skus, seen_manufacturer = set(), set(), set()
    for index, product in enumerate(data["products"]):
        location = f"products[{index}]"
        if not isinstance(product, dict):
            raise PilotError(f"{location}: expected an object.")
        _text(product.get("id"), f"{location}.id")
        _text(product.get("name"), f"{location}.name")
        brand = canonical_brand(product.get("brand"))
        shop_sku = validate_sku(product.get("shop_sku"), "shop_sku")
        normalized = manufacturer_key(brand, shop_sku)
        if product["id"] in seen_ids or shop_sku in seen_shop_skus:
            raise PilotError(f"Duplicate product id or shop_sku: {shop_sku}")
        # The manufacturer key is namespace-qualified by brand. The same
        # manufacturer ID in two brands is not necessarily the same product.
        if (brand, normalized) in seen_manufacturer:
            raise PilotError(f"Manufacturer SKU collision: {brand}/{normalized}")
        seen_ids.add(product["id"])
        seen_shop_skus.add(shop_sku)
        seen_manufacturer.add((brand, normalized))
        manufacturer_sku = product.get("manufacturer_sku")
        if manufacturer_sku not in (None, ""):
            validate_sku(manufacturer_sku, "manufacturer_sku")
        if not isinstance(product.get("match_status"), str) or product["match_status"] not in {"exact", "unverified", "conflict"}:
            raise PilotError(f"{location}.match_status: expected exact, unverified or conflict.")
        if not safe_url(product.get("shop_url")):
            raise PilotError(f"{location}.shop_url: expected a valid HTTP(S) URL.")
        _sources(product, location)
        facts = product.get("facts", [])
        if not isinstance(facts, list):
            raise PilotError(f"{location}.facts: expected a list.")
        for fact in facts:
            if not isinstance(fact, dict):
                raise PilotError(f"{location}.facts: expected objects.")
            _text(fact.get("label"), f"{location}.fact.label")
            # Numeric values are deliberately represented as strings with units.
            _text(fact.get("value"), f"{location}.fact.value")
            if not safe_url(fact.get("source_url")):
                raise PilotError(f"{location}.fact.source_url: expected HTTP(S) URL.")
        for field in ("current_description", *DESCRIPTION_FIELDS):
            if product.get(field) is not None:
                _text(product[field], f"{location}.{field}", allow_empty=True)
        unknowns = product.get("unknowns", [])
        if not isinstance(unknowns, list) or any(not isinstance(item, str) for item in unknowns):
            raise PilotError(f"{location}.unknowns: expected a string list.")
        image = product.get("image")
        if image is not None:
            if not isinstance(image, dict):
                raise PilotError(f"{location}.image: expected an object or null.")
            for dim in ("width", "height"):
                value = image.get(dim)
                if value is not None and (type(value) is not int or value <= 0):
                    raise PilotError(f"{location}.image.{dim}: expected a positive integer or null.")
            if image.get("url") and not safe_url(image["url"]):
                raise PilotError(f"{location}.image.url: expected HTTP(S) URL or null.")
    categories = data.get("categories", [])
    if not isinstance(categories, list):
        raise PilotError("Dataset categories must be a list.")
    category_ids = set()
    for category in categories:
        if not isinstance(category, dict):
            raise PilotError("Category must be an object.")
        for field in ("id", "name"):
            _text(category.get(field), f"category.{field}")
        if category["id"] in category_ids:
            raise PilotError(f"Duplicate category id: {category['id']}")
        category_ids.add(category["id"])
        if not safe_url(category.get("url")):
            raise PilotError("category.url: expected HTTP(S) URL.")
        _sources(category, "category")
    return data


def load_dataset(path):
    return validate_dataset(load_json(path))


def proposal_hash(product):
    """Bind review to content, matching, sources and the observed baseline."""
    encoded = json.dumps(product, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def product_blockers(product):
    blockers = []
    expected = manufacturer_key(product["brand"], product["shop_sku"])
    if product.get("match_status") != "exact":
        blockers.append("Manufacturer match is not explicitly exact.")
    if product.get("manufacturer_sku") != expected:
        blockers.append("Manufacturer SKU does not exactly match the partner's normalization rule.")
    sources = product.get("sources", [])
    source_urls = {source["url"] for source in sources}
    manufacturer_urls = {source["url"] for source in sources if source["kind"] in MANUFACTURER_KINDS}
    if not manufacturer_urls:
        blockers.append("No manufacturer source is recorded; merchant-only evidence cannot unlock export.")
    facts = product.get("facts", [])
    if not facts:
        blockers.append("No traceable factual basis is recorded.")
    if any(fact["source_url"] not in source_urls for fact in facts):
        blockers.append("A fact references a source absent from the product's declared source list.")
    if not any(fact["source_url"] in manufacturer_urls for fact in facts):
        blockers.append("No fact is linked to the recorded manufacturer source.")
    for field in DESCRIPTION_FIELDS:
        try:
            validate_description(product.get(field), field)
        except PilotError as exc:
            blockers.append(str(exc))
    return blockers


def find_product(data, shop_sku):
    matches = [product for product in data["products"] if product["shop_sku"] == shop_sku]
    if len(matches) != 1:
        raise PilotError(f"Expected exactly one product for shop SKU {shop_sku}; found {len(matches)}.")
    return matches[0]
