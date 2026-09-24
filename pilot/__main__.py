"""python -m pilot --help"""

import argparse
from pathlib import Path
import sys

from . import __version__
from .approvals import approve_product, load_approvals
from .audit import audit_dataset
from .exporter import EXPORT_FILENAMES, export_to_directory, json_text, write_text_atomic
from .model import load_dataset
from .safety import PilotError
from .supplier import match_supplier


def parser():
    result = argparse.ArgumentParser(
        prog="python -m pilot",
        description="Offline product-content audit and description-only export previews. Never uploads to UNAS.",
    )
    result.add_argument("--version", action="version", version=__version__)
    commands = result.add_subparsers(dest="command", required=True)
    audit = commands.add_parser("audit", help="Inspect source references, fields and blockers.")
    audit.add_argument("--input", required=True, type=Path)
    audit.add_argument("--out", type=Path, help="Optional JSON report; defaults to stdout.")
    audit.add_argument("--strict", action="store_true", help="Exit 1 if a product is blocked.")
    approve = commands.add_parser("approve", help="Record a named human review of one unchanged product snapshot.")
    approve.add_argument("--input", required=True, type=Path)
    approve.add_argument("--sku", required=True)
    approve.add_argument("--reviewer", required=True)
    approve.add_argument("--out", required=True, type=Path)
    approve.add_argument("--confirm-source-review", action="store_true", help="Confirm a person reviewed the original sources, exact variant and draft text.")
    export = commands.add_parser("export", help="Write only approved description changes to local preview files.")
    export.add_argument("--input", required=True, type=Path)
    export.add_argument("--approvals", required=True, type=Path)
    export.add_argument("--out-dir", required=True, type=Path)
    supplier = commands.add_parser("match-supplier", help="Match supplier CSV keys exactly; do not change proposals or approvals.")
    supplier.add_argument("--input", required=True, type=Path)
    supplier.add_argument("--supplier-csv", required=True, type=Path)
    supplier.add_argument("--delimiter", choices=[",", ";", "\t"], default=",")
    supplier.add_argument("--out", type=Path)
    return result


def _report(report, out):
    content = json_text(report)
    if out:
        write_text_atomic(out, content)
        print(f"Written: {out}")
    else:
        print(content, end="")


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        dataset = load_dataset(args.input)
        # Never overwrite the source dataset with a report or local approval.
        if getattr(args, "out", None) and args.out.resolve() == args.input.resolve():
            raise PilotError("Output must not overwrite the source dataset.")
        if args.command == "audit":
            report = audit_dataset(dataset)
            _report(report, args.out)
            return 1 if args.strict and report["summary"]["blocked"] else 0
        if args.command == "approve":
            existing = load_approvals(args.out) if args.out.exists() else {"schema_version": 1, "approvals": []}
            updated = approve_product(dataset, existing, args.sku, args.reviewer, source_review_confirmed=args.confirm_source_review)
            write_text_atomic(args.out, json_text(updated))
            print(f"Recorded review for {args.sku}: {args.out}. No shop upload performed.")
            return 0
        if args.command == "export":
            protected_paths = {args.input.resolve(), args.approvals.resolve()}
            if any((args.out_dir / name).resolve() in protected_paths for name in EXPORT_FILENAMES):
                raise PilotError("Export destination must not overwrite the input dataset or approvals.")
            paths = export_to_directory(dataset, load_approvals(args.approvals), args.out_dir)
            print("Offline previews created; no shop upload performed:")
            for path in paths:
                print(path)
            return 0
        if args.command == "match-supplier":
            if args.out and args.out.resolve() == args.supplier_csv.resolve():
                raise PilotError("Output must not overwrite the supplier CSV.")
            _report(match_supplier(dataset, args.supplier_csv, args.delimiter), args.out)
            return 0
    except (PilotError, OSError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
