"""Description-only dry-run files. There is intentionally no network client."""

import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import tempfile
import xml.etree.ElementTree as ET

from .approvals import approved_products, utc_now
from .safety import PilotError, spreadsheet_safe


ALLOWED_XML_TAGS = {
    "Products", "Product", "Sku", "Action", "Description",
    "Short", "ShortIsHtml", "Long", "LongIsHtml",
}
EXPORT_FILENAMES = ("review.csv", "changes.json", "unas-description-preview.xml", "export-manifest.json")


def write_text_atomic(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(text)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def json_text(data):
    return json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n"


def _html_flag(value):
    return "1" if re.search(r"</?[A-Za-z]", value) else "0"


def create_exports(dataset, approvals):
    selected = approved_products(dataset, approvals)
    root = ET.Element("Products")
    root.append(ET.Comment(" DRY-RUN PREVIEW ONLY. No upload performed. Verify against the actual shop export before use. "))
    change_records = []
    review = io.StringIO(newline="")
    writer = csv.writer(review, lineterminator="\n")
    writer.writerow(["shop_sku", "name", "current_description_observation_not_backup", "proposed_short", "proposed_long", "reviewer", "proposal_sha256"])
    for product, approval in selected:
        sku = product["shop_sku"]
        # Construct from a fixed field list; never serialize the input product
        # wholesale. Protected shop fields cannot enter the patch by accident.
        node = ET.SubElement(root, "Product")
        ET.SubElement(node, "Sku").text = sku
        ET.SubElement(node, "Action").text = "modify"
        description = ET.SubElement(node, "Description")
        ET.SubElement(description, "Short").text = product["proposed_short"]
        ET.SubElement(description, "ShortIsHtml").text = _html_flag(product["proposed_short"])
        ET.SubElement(description, "Long").text = product["proposed_long"]
        ET.SubElement(description, "LongIsHtml").text = _html_flag(product["proposed_long"])
        change_records.append({
            "shop_sku": sku,
            "description": {"short": product["proposed_short"], "long": product["proposed_long"]},
            "review": {
                "reviewer": approval["reviewer"],
                "approved_at": approval["approved_at"],
                "proposal_sha256": approval["proposal_sha256"],
            },
        })
        writer.writerow([spreadsheet_safe(value) for value in (
            sku, product["name"], product.get("current_description"),
            product["proposed_short"], product["proposed_long"],
            approval["reviewer"], approval["proposal_sha256"],
        )])
    for node in root.iter():
        if node.tag is ET.Comment:
            continue
        if node.tag not in ALLOWED_XML_TAGS or node.attrib:
            raise PilotError("Internal export allowlist check failed.")
        if len(node) == 0 and not (node.text or "").strip():
            raise PilotError("Internal export rejected a destructive empty XML node.")
    ET.indent(root, space="  ")
    xml = ET.tostring(root, encoding="unicode", xml_declaration=True) + "\n"
    result = {
        "review.csv": "\ufeff" + review.getvalue(),
        "changes.json": json_text({
            "schema_version": 1,
            "mode": "offline_preview_only",
            "notice": "Not a native UNAS import. No HTTP request or shop write occurs.",
            "products": change_records,
        }),
        "unas-description-preview.xml": xml,
    }
    result["export-manifest.json"] = json_text({
        "schema_version": 1,
        "generated_at": utc_now(),
        "mode": "offline_preview_only",
        "approved_product_count": len(selected),
        "skipped_unapproved_count": len(dataset["products"]) - len(selected),
        "shop_upload_performed": False,
        "requires_before_any_live_use": [
            "Current shop export and explicit product/field mapping verification.",
            "Compare current live descriptions with the reviewed baseline and keep a restore copy.",
            "Separate authorization and a limited test in the actual shop.",
            "Per-product response handling, readback and rollback in a future live adapter.",
        ],
        "files": {name: hashlib.sha256(content.encode("utf-8")).hexdigest() for name, content in result.items()},
    })
    return result


def export_to_directory(dataset, approvals, directory):
    # Validate and build everything before writing the first output file.
    outputs = create_exports(dataset, approvals)
    directory = Path(directory)
    if directory.exists() and not directory.is_dir():
        raise PilotError("Export destination is not a directory.")
    for name, contents in outputs.items():
        write_text_atomic(directory / name, contents)
    return [str(directory / name) for name in outputs]
