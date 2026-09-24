"""Local human review records bound to the exact product snapshot."""

from datetime import datetime, timezone

from .model import DESCRIPTION_FIELDS, find_product, load_json, product_blockers, proposal_hash
from .safety import PilotError


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def validate_approvals(data):
    if not isinstance(data, dict) or type(data.get("schema_version")) is not int or data["schema_version"] != 1:
        raise PilotError("Expected approvals schema_version=1; UI review notes are not CLI approvals.")
    if not isinstance(data.get("approvals"), list):
        raise PilotError("Approvals must contain an approvals list.")
    seen = set()
    for approval in data["approvals"]:
        if not isinstance(approval, dict):
            raise PilotError("Each approval must be an object.")
        sku = approval.get("shop_sku")
        if not isinstance(sku, str) or not sku or sku in seen:
            raise PilotError("Approval shop_sku is empty or duplicated.")
        seen.add(sku)
        digest = approval.get("proposal_sha256")
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise PilotError(f"{sku}: invalid proposal hash.")
        reviewer = approval.get("reviewer")
        if not isinstance(reviewer, str) or not reviewer.strip() or len(reviewer) > 200 or any(ord(c) < 32 for c in reviewer):
            raise PilotError(f"{sku}: expected a named reviewer.")
        if not isinstance(approval.get("product_id"), str) or not approval["product_id"]:
            raise PilotError(f"{sku}: product_id is required.")
        if approval.get("scope") != list(DESCRIPTION_FIELDS):
            raise PilotError(f"{sku}: approval scope must contain only the two proposal description fields.")
        if approval.get("source_review_confirmed") is not True:
            raise PilotError(f"{sku}: explicit human source-review confirmation is missing.")
        try:
            date = datetime.fromisoformat(approval["approved_at"].replace("Z", "+00:00"))
            if date.tzinfo is None:
                raise ValueError("Timezone required")
        except (KeyError, AttributeError, TypeError, ValueError) as exc:
            raise PilotError(f"{sku}: invalid approval timestamp.") from exc
    return data


def load_approvals(path):
    return validate_approvals(load_json(path))


def approve_product(dataset, approvals, shop_sku, reviewer, *, source_review_confirmed=False):
    validate_approvals(approvals)
    if source_review_confirmed is not True:
        raise PilotError("Approval requires --confirm-source-review after a person checks the source, exact variant and proposed text.")
    product = find_product(dataset, shop_sku)
    blockers = product_blockers(product)
    if blockers:
        raise PilotError(f"Cannot approve {shop_sku}: " + " ".join(blockers))
    approval = {
        "product_id": product["id"],
        "shop_sku": shop_sku,
        "proposal_sha256": proposal_hash(product),
        "reviewer": reviewer,
        "approved_at": utc_now(),
        "scope": list(DESCRIPTION_FIELDS),
        "source_review_confirmed": True,
    }
    updated = {
        "schema_version": 1,
        "notice": "Local review record, not a digital signature or permission to upload to a live shop.",
        "approvals": [item for item in approvals["approvals"] if item["shop_sku"] != shop_sku] + [approval],
    }
    return validate_approvals(updated)


def approved_products(dataset, approvals):
    validate_approvals(approvals)
    selected = []
    for approval in approvals["approvals"]:
        product = find_product(dataset, approval["shop_sku"])
        if approval["product_id"] != product["id"] or approval["proposal_sha256"] != proposal_hash(product):
            raise PilotError(f"Stale approval for {product['shop_sku']}; the snapshot changed. Review and approve again.")
        blockers = product_blockers(product)
        if blockers:
            raise PilotError(f"Approved product {product['shop_sku']} is now blocked: " + " ".join(blockers))
        selected.append((product, approval))
    if not selected:
        raise PilotError("No approved products: export requires at least one explicit, current human approval.")
    return selected
