"""Describe evidence gaps without inventing missing facts."""

from .model import DESCRIPTION_FIELDS, product_blockers, proposal_hash
from .safety import PilotError, manufacturer_key, validate_description


def _proposal_status(value):
    try:
        validate_description(value)
    except PilotError as exc:
        return {"status": "blocked", "reason": str(exc)}
    return {"status": "draft_requires_human_review", "characters": len(value)}


def audit_dataset(data):
    products = []
    for product in data["products"]:
        image = product.get("image") or {}
        if not image.get("url"):
            image_status = "missing_or_not_observed"
        elif image.get("width") is None or image.get("height") is None:
            image_status = "dimensions_not_verified"
        else:
            image_status = "dimensions_recorded_policy_check_required"
        current = product.get("current_description")
        current_kind = product.get("current_description_kind", "not_verified_as_shop_export")
        fields = {
            "current_description": {
                "status": "not_observed" if current is None else "observation_or_supplied_text_not_verified_live",
                "note_character_count": None if current is None else len(current),
                "kind": current_kind,
                "usable_as_rollback": False,
            },
            "manufacturer_sku": {
                "status": product["match_status"],
                "expected": manufacturer_key(product["brand"], product["shop_sku"]),
                "recorded": product.get("manufacturer_sku"),
            },
            "image": {
                "status": image_status,
                "width": image.get("width"),
                "height": image.get("height"),
                "rights": image.get("rights", "unknown"),
                "exported": False,
            },
            "weight": {
                "status": "outside_pilot_requires_authoritative_evidence",
                "exported": False,
                "inferred": False,
                "note": "Product mass and packaged shipping weight must be established separately; no default or zero is generated.",
            },
        }
        for field in DESCRIPTION_FIELDS:
            fields[field] = _proposal_status(product.get(field))
        blockers = product_blockers(product)
        products.append({
            "id": product["id"],
            "shop_sku": product["shop_sku"],
            "name": product["name"],
            "status": "blocked" if blockers else "eligible_for_human_review",
            "proposal_sha256": proposal_hash(product),
            "fields": fields,
            "blockers": blockers,
            "unknowns": product.get("unknowns", []),
        })
    categories = [{
        "id": item["id"],
        "name": item["name"],
        "status": "review_only_no_category_export",
        "proposal": _proposal_status(item.get("proposed_description")),
    } for item in data.get("categories", [])]
    return {
        "schema_version": 1,
        "observed_at": data["observed_at"],
        "mode": "offline_audit",
        "summary": {
            "products": len(products),
            "eligible_for_human_review": sum(item["status"] == "eligible_for_human_review" for item in products),
            "blocked": sum(item["status"] == "blocked" for item in products),
            "categories_review_only": len(categories),
        },
        "limitations": [
            "Recorded URLs are evidence references; this CLI does not fetch them or verify factual truth.",
            "An exact SKU and source metadata do not replace human product/variant verification.",
            "Current-description notes are observations, not a verified shop backup; no rollback data is produced.",
            "No live-shop export was loaded; baseline drift and shop permissions need a separate preflight before any upload.",
            "No price, stock, image, weight or category update is generated.",
        ],
        "products": products,
        "categories": categories,
    }
