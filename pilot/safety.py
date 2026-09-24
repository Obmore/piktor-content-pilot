"""Small, explicit safety boundaries shared by audit and export."""

from html.parser import HTMLParser
import re
from urllib.parse import urlsplit


class PilotError(ValueError):
    """An input or review boundary was not satisfied."""


BRANDS = {"schuller": "Schuller", "abraboro": "Abraboro", "festa": "Festa"}
SKU_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,79}\Z")
SAFE_TAGS = {"p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "h2", "h3"}


def canonical_brand(value):
    if not isinstance(value, str) or value.casefold() not in BRANDS:
        raise PilotError("Unsupported brand; expected Schuller, Abraboro or Festa.")
    return BRANDS[value.casefold()]


def validate_sku(value, field="SKU"):
    if not isinstance(value, str) or not SKU_PATTERN.fullmatch(value):
        raise PilotError(f"{field}: invalid SKU; no whitespace or special markup is allowed.")
    return value


def manufacturer_key(brand, shop_sku):
    """Apply the partner's explicit rules exactly once; never fuzzy-match."""
    brand = canonical_brand(brand)
    sku = validate_sku(shop_sku, "shop_sku")
    if brand == "Schuller":
        if not sku.startswith("S"):
            raise PilotError("Schuller shop SKU must start with the added uppercase S.")
        return validate_sku(sku[1:], "normalized manufacturer_sku")
    if brand == "Abraboro":
        if not sku.startswith("ABR"):
            raise PilotError("Abraboro shop SKU must start with the added uppercase ABR.")
        return validate_sku(sku[3:], "normalized manufacturer_sku")
    if not sku.startswith("L"):
        raise PilotError("Festa SKU must retain the manufacturer's uppercase L prefix.")
    return sku


def safe_url(value):
    if not isinstance(value, str) or any(ord(c) < 32 for c in value):
        return False
    try:
        parts = urlsplit(value)
        return (
            parts.scheme in {"http", "https"}
            and bool(parts.hostname)
            and parts.username is None
            and parts.password is None
        )
    except ValueError:
        return False


def xml_text_valid(value):
    return all(
        ord(c) in (9, 10, 13)
        or 0x20 <= ord(c) <= 0xD7FF
        or 0xE000 <= ord(c) <= 0xFFFD
        or 0x10000 <= ord(c) <= 0x10FFFF
        for c in value
    )


class _DescriptionParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.visible = []

    def handle_starttag(self, tag, attrs):
        if tag not in SAFE_TAGS or attrs:
            raise PilotError(f"Unsafe description HTML: <{tag}> or its attributes are not allowed.")
        if tag != "br":
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        if tag != "br" or attrs:
            raise PilotError("Only <br/> is allowed as a self-closing description element.")

    def handle_endtag(self, tag):
        if not self.stack or tag != self.stack[-1]:
            raise PilotError("Description HTML has mismatched or unsupported closing tags.")
        self.stack.pop()

    def handle_data(self, data):
        self.visible.append(data)

    def handle_comment(self, data):
        raise PilotError("Description HTML comments are not allowed.")

    def handle_decl(self, decl):
        raise PilotError("Description declarations are not allowed.")

    def handle_pi(self, data):
        raise PilotError("Description processing instructions are not allowed.")

    def unknown_decl(self, data):
        raise PilotError("Description declarations are not allowed.")


def validate_description(value, field="description"):
    """Reject risky markup rather than silently rewriting the proposed content."""
    if not isinstance(value, str) or not value.strip():
        raise PilotError(f"{field}: empty replacement descriptions cannot be approved or exported.")
    if len(value) > 200_000 or not xml_text_valid(value):
        raise PilotError(f"{field}: description is too long or contains invalid XML characters.")
    # HTMLParser treats unfinished tags as text. Reject those too, while allowing
    # correctly escaped comparison signs such as &lt; and &gt;.
    tokens_removed = re.sub(r"</?(?:p|br|strong|b|em|i|ul|ol|li|h2|h3)\s*/?>", "", value, flags=re.I)
    if "<" in tokens_removed:
        raise PilotError(f"{field}: unknown, attributed or incomplete HTML markup.")
    parser = _DescriptionParser()
    try:
        parser.feed(value)
        parser.close()
    except (ValueError, AssertionError) as exc:
        if isinstance(exc, PilotError):
            raise
        raise PilotError(f"{field}: malformed HTML.") from exc
    if parser.stack:
        raise PilotError(f"{field}: description HTML has unclosed tags.")
    if not "".join(parser.visible).strip():
        raise PilotError(f"{field}: description has no visible text.")
    return value


def spreadsheet_safe(value):
    """Prevent formula execution if a human opens review.csv in a spreadsheet."""
    value = "" if value is None else str(value)
    leading = value.lstrip()
    if (leading and leading[0] in "=+-@") or value.startswith(("\t", "\r", "\n")):
        return "'" + value
    return value
