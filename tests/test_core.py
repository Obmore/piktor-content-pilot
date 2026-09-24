"""Meaningful boundary tests; all products and approvals here are synthetic."""

from contextlib import redirect_stderr, redirect_stdout
from copy import deepcopy
import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

from pilot.__main__ import main
from pilot.approvals import approve_product, approved_products
from pilot.audit import audit_dataset
from pilot.exporter import ALLOWED_XML_TAGS, create_exports, export_to_directory
from pilot.model import load_json, product_blockers, proposal_hash, validate_dataset
from pilot.safety import PilotError, manufacturer_key, spreadsheet_safe, validate_description
from pilot.supplier import match_supplier


def sample_product():
    return {
        "id": "synthetic-1",
        "brand": "Schuller",
        "shop_sku": "S12345",
        "manufacturer_sku": "12345",
        "name": "Synthetic spatula, 100 mm",
        "category": "Synthetic category",
        "shop_url": "https://shop.example/products/S12345",
        "current_description": "Observed page has no visible description; database not read.",
        "current_description_kind": "public_observation_not_unas_export",
        "proposed_short": "Synthetic 100 mm spatula.",
        "proposed_long": "<p>Synthetic spatula with a <strong>100 mm</strong> blade.</p>",
        "facts": [{"label": "Width", "value": "100 mm", "source_url": "https://manufacturer.example/12345"}],
        "sources": [{"url": "https://manufacturer.example/12345", "title": "Synthetic manufacturer sheet", "kind": "manufacturer"}],
        "match_status": "exact",
        "unknowns": ["Shipping weight unknown."],
        "image": {"url": None, "width": None, "height": None, "rights": "unknown"},
    }


def dataset():
    return {"schema_version": 1, "observed_at": "2026-09-24", "products": [sample_product()], "categories": []}


def approval_for(data):
    return approve_product(data, {"schema_version": 1, "approvals": []}, "S12345", "Synthetic test reviewer", source_review_confirmed=True)


class SkuTests(unittest.TestCase):
    def test_explicit_prefix_rules_are_applied_once(self):
        self.assertEqual(manufacturer_key("Schuller", "S50707"), "50707")
        self.assertEqual(manufacturer_key("Schuller", "SS50707"), "S50707")
        self.assertEqual(manufacturer_key("Abraboro", "ABR12345"), "12345")
        self.assertEqual(manufacturer_key("Abraboro", "ABRABR12345"), "ABR12345")
        self.assertEqual(manufacturer_key("Festa", "L12345"), "L12345")

    def test_unknown_brand_missing_prefix_and_markup_rejected(self):
        for brand, sku in (("Unknown", "S123"), ("Schuller", "123"), ("Schuller", "S"), ("Abraboro", "abr123"), ("Festa", "123"), ("Festa", "L123<")):
            with self.subTest(brand=brand, sku=sku), self.assertRaises(PilotError):
                manufacturer_key(brand, sku)

    def test_duplicate_shop_sku_and_product_id_rejected(self):
        data = dataset()
        other = deepcopy(data["products"][0])
        other["id"] = "different-id"
        data["products"].append(other)
        with self.assertRaises(PilotError):
            validate_dataset(data)

    def test_declared_exact_match_cannot_hide_wrong_manufacturer_key(self):
        data = dataset()
        data["products"][0]["manufacturer_sku"] = "12346"
        with self.assertRaises(PilotError):
            approval_for(data)

    def test_malformed_match_status_is_a_validation_error(self):
        data = dataset()
        data["products"][0]["match_status"] = ["exact"]
        with self.assertRaises(PilotError):
            validate_dataset(data)


class HtmlAndSerializationTests(unittest.TestCase):
    def test_dangerous_and_unfinished_html_rejected(self):
        for value in (
            '<script>alert(1)</script>', '<p onclick="alert(1)">x</p>',
            '<img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">x</a>',
            '<script', '<p><strong>x</p></strong>', '<!-- hidden -->text',
            '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><p>&x;</p>',
            '<svg><script>alert(1)</script></svg>', "<p>\x00bad</p>",
            "<p></p>", " ",
        ):
            with self.subTest(value=value), self.assertRaises(PilotError):
                validate_description(value)

    def test_xml_escape_does_not_create_shop_fields(self):
        data = dataset()
        data["products"][0]["proposed_long"] = "<p>A &amp; B: &lt;/Long&gt;&lt;Prices&gt;1&lt;/Prices&gt;</p>"
        output = create_exports(data, approval_for(data))
        root = ET.fromstring(output["unas-description-preview.xml"])
        self.assertIsNone(root.find(".//Prices"))
        self.assertEqual(root.findtext(".//Long"), data["products"][0]["proposed_long"])
        self.assertEqual(root.findtext(".//LongIsHtml"), "1")
        self.assertEqual(root.findtext(".//ShortIsHtml"), "0")

    def test_csv_formula_injection_neutralized_in_every_review_column(self):
        data = dataset()
        product = data["products"][0]
        product["name"] = '=HYPERLINK("https://evil.example","click")'
        product["current_description"] = "  @SUM(1,2)"
        product["proposed_short"] = "+SUM(1,1)"
        approvals = approval_for(data)
        approvals["approvals"][0]["reviewer"] = "-2+3"
        output = create_exports(data, approvals)
        rows = list(csv.DictReader(io.StringIO(output["review.csv"].lstrip("\ufeff"))))
        for field in ("name", "current_description_observation_not_backup", "proposed_short", "reviewer"):
            self.assertTrue(rows[0][field].startswith("'"), field)
        self.assertEqual(spreadsheet_safe("\t=1+1"), "'\t=1+1")
        self.assertEqual(spreadsheet_safe("normal"), "normal")

    def test_duplicate_json_keys_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "bad.json"
            path.write_text('{"brand":"Schuller","brand":"Festa"}', encoding="utf-8")
            with self.assertRaises(PilotError):
                load_json(path)


class ApprovalTests(unittest.TestCase):
    def test_human_acknowledgment_required(self):
        with self.assertRaises(PilotError):
            approve_product(dataset(), {"schema_version": 1, "approvals": []}, "S12345", "Test")

    def test_unverified_and_conflicting_products_cannot_be_approved(self):
        for status in ("unverified", "conflict"):
            data = dataset()
            data["products"][0]["match_status"] = status
            with self.subTest(status=status), self.assertRaises(PilotError):
                approval_for(data)

    def test_merchant_only_source_does_not_unlock_export(self):
        data = dataset()
        data["products"][0]["sources"][0]["kind"] = "shop"
        with self.assertRaises(PilotError):
            approval_for(data)

    def test_unlisted_fact_source_is_blocked(self):
        data = dataset()
        data["products"][0]["facts"][0]["source_url"] = "https://unlisted.example/12345"
        self.assertTrue(product_blockers(data["products"][0]))
        with self.assertRaises(PilotError):
            approval_for(data)

    def test_description_source_or_baseline_changes_invalidate_approval(self):
        for field, value in (
            ("proposed_short", "Changed proposal."),
            ("current_description", "Different observation."),
            ("sources", [{"url": "https://manufacturer.example/changed", "title": "Changed", "kind": "manufacturer"}]),
            ("unknowns", []),
        ):
            data = dataset()
            approvals = approval_for(data)
            data["products"][0][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(PilotError, "Stale approval"):
                approved_products(data, approvals)

    def test_hash_is_independent_of_json_key_order(self):
        product = sample_product()
        reordered = dict(reversed(list(product.items())))
        self.assertEqual(proposal_hash(product), proposal_hash(reordered))

    def test_duplicate_approvals_and_unapproved_scope_rejected(self):
        data = dataset()
        approvals = approval_for(data)
        approvals["approvals"].append(deepcopy(approvals["approvals"][0]))
        with self.assertRaises(PilotError):
            approved_products(data, approvals)
        approvals = approval_for(data)
        approvals["approvals"][0]["scope"].append("price")
        with self.assertRaises(PilotError):
            approved_products(data, approvals)


class ExportAndAuditTests(unittest.TestCase):
    def test_protected_fields_never_enter_changes_or_xml(self):
        data = dataset()
        data["products"][0].update({
            "price": "PRICE_SENTINEL", "stocks": "STOCK_SENTINEL",
            "weight_kg": "WEIGHT_SENTINEL", "status": "STATUS_SENTINEL",
            "Categories": "CATEGORY_SENTINEL", "SkuNew": "RENAME_SENTINEL",
        })
        output = create_exports(data, approval_for(data))
        for filename in ("changes.json", "unas-description-preview.xml"):
            self.assertNotIn("SENTINEL", output[filename])
        root = ET.fromstring(output["unas-description-preview.xml"])
        self.assertTrue(all(node.tag in ALLOWED_XML_TAGS for node in root.iter()))
        self.assertTrue(all(len(node) or (node.text or "").strip() for node in root.iter()))
        self.assertEqual(root.findtext(".//Action"), "modify")

    def test_unknown_weight_is_never_inferred_and_does_not_block_description_review(self):
        report = audit_dataset(dataset())
        weight = report["products"][0]["fields"]["weight"]
        self.assertFalse(weight["inferred"])
        self.assertFalse(weight["exported"])
        self.assertNotIn("value", weight)
        self.assertEqual(report["summary"]["eligible_for_human_review"], 1)

    def test_observation_note_is_not_treated_as_live_description_or_rollback(self):
        report = audit_dataset(dataset())
        field = report["products"][0]["fields"]["current_description"]
        self.assertFalse(field["usable_as_rollback"])
        self.assertEqual(field["status"], "observation_or_supplied_text_not_verified_live")
        self.assertNotIn("characters", field)

    def test_stale_approval_writes_no_partial_files(self):
        data = dataset()
        approvals = approval_for(data)
        data["products"][0]["proposed_long"] = "Changed draft."
        with tempfile.TemporaryDirectory() as temporary:
            out = Path(temporary) / "output"
            with self.assertRaises(PilotError):
                export_to_directory(data, approvals, out)
            self.assertFalse(out.exists())

    def test_empty_approval_cannot_export(self):
        with self.assertRaises(PilotError):
            create_exports(dataset(), {"schema_version": 1, "approvals": []})

    def test_only_approved_rows_exported(self):
        data = dataset()
        other = sample_product()
        other.update({"id": "synthetic-2", "shop_sku": "S98765", "manufacturer_sku": "98765", "match_status": "unverified"})
        data["products"].append(other)
        output = create_exports(data, approval_for(data))
        self.assertEqual(len(json.loads(output["changes.json"])["products"]), 1)
        self.assertEqual(json.loads(output["export-manifest.json"])["skipped_unapproved_count"], 1)


class SupplierTests(unittest.TestCase):
    def test_duplicate_supplier_candidates_stay_ambiguous(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "supplier.csv"
            path.write_text("brand,manufacturer_sku,name,source_url\nSchuller,12345,Variant A,https://manufacturer.example/a\nSchuller,12345,Variant B,https://manufacturer.example/b\n", encoding="utf-8")
            data = dataset()
            before = deepcopy(data)
            report = match_supplier(data, path)
            self.assertEqual(report["products"][0]["status"], "ambiguous_blocked")
            self.assertEqual(data, before)

    def test_supplier_matching_has_no_fuzzy_fallback(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "supplier.csv"
            path.write_text("brand,manufacturer_sku,name,source_url\nSchuller,12346,Synthetic spatula 100mm,https://manufacturer.example/12346\n", encoding="utf-8")
            report = match_supplier(dataset(), path)
            self.assertEqual(report["products"][0]["status"], "no_match")


class CliTests(unittest.TestCase):
    def _run(self, arguments):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            status = main(arguments)
        return status, out.getvalue(), err.getvalue()

    def test_audit_to_approval_to_export_offline(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, approval, out = root / "data.json", root / "approvals.json", root / "out"
            source.write_text(json.dumps(dataset()), encoding="utf-8")
            status, stdout, _ = self._run(["audit", "--input", str(source)])
            self.assertEqual(status, 0)
            self.assertEqual(json.loads(stdout)["summary"]["products"], 1)
            status, _, _ = self._run(["approve", "--input", str(source), "--sku", "S12345", "--reviewer", "Synthetic test", "--out", str(approval), "--confirm-source-review"])
            self.assertEqual(status, 0)
            status, _, _ = self._run(["export", "--input", str(source), "--approvals", str(approval), "--out-dir", str(out)])
            self.assertEqual(status, 0)
            self.assertTrue((out / "review.csv").exists())
            self.assertFalse(json.loads((out / "export-manifest.json").read_text())["shop_upload_performed"])

    def test_cli_cannot_overwrite_input_with_audit_or_export(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, approval = root / "changes.json", root / "approvals.json"
            text = json.dumps(dataset())
            source.write_text(text, encoding="utf-8")
            approval.write_text(json.dumps(approval_for(dataset())), encoding="utf-8")
            status, _, _ = self._run(["audit", "--input", str(source), "--out", str(source)])
            self.assertEqual(status, 2)
            status, _, _ = self._run(["export", "--input", str(source), "--approvals", str(approval), "--out-dir", str(root)])
            self.assertEqual(status, 2)
            self.assertEqual(source.read_text(encoding="utf-8"), text)


if __name__ == "__main__":
    unittest.main()
