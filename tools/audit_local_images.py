"""Measure supplier image files without modifying them. Requires optional Pillow.

Usage: python tools/audit_local_images.py supplier-images --as-of 2026-09-24
Output is technical evidence only, not identity/copyright/Google acceptance proof.
"""
from __future__ import annotations

import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import warnings


def image_rules(width: int, height: int, size_bytes: int, as_of: date) -> dict:
    minimum = 500 if as_of >= date(2027, 1, 31) else 100
    return {
        "non_apparel_minimum_px_on_date": minimum,
        "meets_minimum_dimensions": width >= minimum and height >= minimum,
        "meets_2027_dimensions": width >= 500 and height >= 500,
        "meets_recommended_dimensions": width >= 1500 and height >= 1500,
        "under_size_limits": width * height <= 64_000_000 and size_bytes <= 16_000_000,
    }


def inspect_file(path: Path, as_of: date) -> dict:
    from PIL import Image

    result = {"file": path.name, "as_of": as_of.isoformat(), "scope": "non_apparel"}
    try:
        size = path.stat().st_size
        if size > 16_000_000:
            raise ValueError("A fájl meghaladja a konzervatív 16 000 000 bájtos korlátot.")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as im:
                width, height = im.size
                fmt = im.format
                if width * height > 64_000_000:
                    raise ValueError("A kép meghaladja a 64 megapixeles korlátot.")
                im.verify()
            with Image.open(path) as im:
                im.load()
        result.update({"readable": True, "format": fmt, "width": width, "height": height,
                       "bytes": size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        result.update(image_rules(width, height, size, as_of))
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        result.update({"readable": False, "error": str(exc)})
    return result


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("directory", type=Path)
    p.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    args = p.parse_args()
    if not args.directory.is_dir():
        p.error("Létező képmappát adj meg.")
    try:
        import PIL  # noqa: F401
    except ImportError:
        p.error("Opcionális függőség szükséges: python -m pip install Pillow")
    files = sorted(x for x in args.directory.iterdir() if x.is_file() and not x.is_symlink()
                   and x.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".bmp"})
    rows = [inspect_file(path, args.as_of) for path in files]
    print(json.dumps({"scope": "Helyi képdekódolás; nem teljes Merchant Center megfelelőségi vizsgálat.",
                      "source": "https://support.google.com/merchants/answer/12159030?hl=en",
                      "files": rows}, ensure_ascii=False, indent=2))
    return 0 if rows and all(x["readable"] for x in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
