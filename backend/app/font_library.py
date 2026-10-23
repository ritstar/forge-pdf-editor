"""The fonts installed on the server, and matching of PDF font names to them.

PDFs name their fonts ("ABCDEF+Calibri-Bold", "TimesNewRomanPSMT", "Arial,Bold"). When the
embedded copy can't draw an edit, the same family is used if it is installed; otherwise a
metric-compatible look-alike (Arial -> Arimo, Calibri -> Carlito, ...); otherwise the closest
generic family. The Docker image installs the open-source families listed in the Dockerfile;
locally the operating system's fonts are indexed too.
"""

from __future__ import annotations

import io
import logging
import os
import re
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTCollection, TTFont

logger = logging.getLogger(__name__)

BUNDLED_DIR = Path(__file__).with_name("fonts")
FONT_SUFFIXES = {".ttf", ".otf", ".ttc"}

# Words that end a PDF font name but are not part of the family ("ArialMT", "Calibri-Bold").
STYLE_SUFFIX = re.compile(
    r"(?:psmt|mt|ps|std|regular|normal|bold|semibold|demibold|demi|extrabold|ultrabold|"
    r"black|heavy|medium|light|extralight|thin|italic|oblique|condensed|cond)$"
)
DEVANAGARI_PROBE = 0x0915  # क

# PDF family -> open families with the same metrics or look, best first.
ALIASES = {
    "arial": ["Arimo", "Liberation Sans", "Nimbus Sans"],
    "helvetica": ["Nimbus Sans", "Arimo", "Liberation Sans"],
    "helveticaneue": ["Nimbus Sans", "Arimo", "Liberation Sans"],
    "arialnarrow": ["Liberation Sans Narrow", "Nimbus Sans Narrow"],
    "timesnewroman": ["Tinos", "Liberation Serif", "Nimbus Roman"],
    "times": ["Nimbus Roman", "Tinos", "Liberation Serif"],
    "couriernew": ["Cousine", "Liberation Mono", "Nimbus Mono PS"],
    "courier": ["Nimbus Mono PS", "Cousine", "Liberation Mono"],
    "calibri": ["Carlito"],
    "cambria": ["Caladea"],
    "verdana": ["DejaVu Sans"],
    "tahoma": ["DejaVu Sans"],
    "segoeui": ["Open Sans", "Noto Sans"],
    "georgia": ["Noto Serif", "Tinos"],
    "garamond": ["EB Garamond"],
    "ebgaramond": ["EB Garamond"],
    "palatino": ["P052"],
    "palatinolinotype": ["P052"],
    "bookantiqua": ["P052"],
    "bookman": ["URW Bookman"],
    "bookmanoldstyle": ["URW Bookman"],
    "centuryschoolbook": ["C059"],
    "newcenturyschlbk": ["C059"],
    "century": ["C059"],
    "avantgarde": ["URW Gothic"],
    "centurygothic": ["URW Gothic"],
    "zapfchancery": ["Z003"],
    "myriad": ["Source Sans 3", "Open Sans"],
    "myriadpro": ["Source Sans 3", "Open Sans"],
    "consolas": ["DejaVu Sans Mono", "Cousine"],
    "lucidaconsole": ["DejaVu Sans Mono", "Cousine"],
    "symbol": ["Standard Symbols PS"],
    "mangal": ["Noto Sans Devanagari"],
    "aparajita": ["Noto Serif Devanagari"],
    "kokila": ["Noto Serif Devanagari"],
    "utsaah": ["Noto Sans Devanagari"],
    "nirmalaui": ["Noto Sans Devanagari"],
}

# Last resort per kind of font, best first.
GENERIC = {
    "sans": ["Arimo", "Liberation Sans", "Noto Sans", "DejaVu Sans", "Helvetica", "Arial"],
    "serif": ["Tinos", "Liberation Serif", "Noto Serif", "DejaVu Serif", "Times New Roman", "Times"],
    "mono": ["Cousine", "Liberation Mono", "Noto Sans Mono", "DejaVu Sans Mono", "Courier New", "Courier"],
    "devanagari-sans": ["Noto Sans Devanagari", "Lohit Devanagari", "Kohinoor Devanagari", "Devanagari Sangam MN"],
    "devanagari-serif": ["Noto Serif Devanagari", "Noto Sans Devanagari", "Lohit Devanagari"],
}

# Noto ships one family per script; only these are worth offering in the font picker.
NOTO_PICKER = {"Noto Sans", "Noto Serif", "Noto Sans Mono", "Noto Sans Devanagari", "Noto Serif Devanagari"}


def family_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def pdf_family_key(font_name: str) -> str:
    """'ABCDEF+TimesNewRomanPS-BoldItalicMT' -> 'timesnewroman'."""
    name = re.sub(r"^[A-Z]{6}\+", "", font_name or "")
    name = re.split(r"[-,]", name, maxsplit=1)[0]
    key = family_key(name)
    while True:
        trimmed = STYLE_SUFFIX.sub("", key)
        if trimmed == key or len(trimmed) < 3:
            return key
        key = trimmed


@dataclass
class Face:
    path: str
    index: int
    family: str
    weight: int
    italic: bool
    category: str  # sans | serif | mono | display
    latin: bool
    devanagari: bool
    weight_axis: Optional[tuple[float, float]] = None
    _cmap: Optional[frozenset[int]] = field(default=None, repr=False)

    @property
    def bold(self) -> bool:
        return self.weight >= 600

    def cmap(self) -> frozenset[int]:
        if self._cmap is None:
            try:
                with TTFont(self.path, fontNumber=self.index, lazy=True) as font:
                    self._cmap = frozenset((font.getBestCmap() or {}).keys())
            except Exception:
                self._cmap = frozenset()
        return self._cmap

    def covers(self, text: str) -> bool:
        cmap = self.cmap()
        return all(ord(ch) in cmap for ch in text if not ch.isspace())

    def program(self, text: str, bold: bool) -> bytes:
        """A standalone TrueType/OpenType file with just the glyphs `text` needs.

        Variable fonts are pinned to regular or bold. Layout features stay, so complex
        scripts still shape correctly in MuPDF's HTML engine."""
        font = TTFont(self.path, fontNumber=self.index)
        if self.weight_axis:
            from fontTools.varLib import instancer

            low, high = self.weight_axis
            font = instancer.instantiateVariableFont(font, {"wght": min(max(700 if bold else 400, low), high)})
        options = Options()
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.notdef_outline = True
        options.hinting = False
        options.desubroutinize = True
        # Embedded bitmaps and color glyphs are unused in PDFs and often malformed in system fonts.
        options.drop_tables += ["EBDT", "EBLC", "EBSC", "bdat", "bloc", "CBDT", "CBLC", "sbix", "SVG ", "DSIG"]
        subsetter = Subsetter(options)
        subsetter.populate(text=text + " ")
        subsetter.subset(font)
        font.flavor = None
        out = io.BytesIO()
        font.save(out)
        return out.getvalue()


@dataclass
class Match:
    face: Face
    exact: bool  # the PDF's own family, not a look-alike


def _font_dirs() -> list[Path]:
    custom = os.getenv("FONT_DIRS")
    if custom:
        return [Path(p) for p in custom.split(os.pathsep) if p]
    dirs = [BUNDLED_DIR, Path("/usr/share/fonts"), Path("/usr/local/share/fonts"), Path.home() / ".fonts"]
    if sys.platform == "darwin":
        dirs += [Path("/System/Library/Fonts"), Path("/Library/Fonts"), Path.home() / "Library/Fonts"]
    return dirs


def _name(font: TTFont, *ids: int) -> str:
    table = font["name"]
    for name_id in ids:
        value = table.getDebugName(name_id)
        if value:
            return value.strip()
    return ""


def _category(font: TTFont, family: str) -> str:
    lowered = family.lower()
    post = font.get("post")
    os2 = font.get("OS/2")
    panose = getattr(os2, "panose", None)
    if (post and post.isFixedPitch) or (panose and panose.bFamilyType == 2 and panose.bProportion == 9):
        return "mono"
    if any(k in lowered for k in ("mono", "courier", "code", "consol")):
        return "mono"
    if panose and panose.bFamilyType in (3, 4):
        return "display"
    if "sans" in lowered or "gothic" in lowered:
        return "sans"
    if "serif" in lowered or any(k in lowered for k in ("times", "roman", "garamond", "georgia", "book", "century", "caladea", "tinos")):
        return "serif"
    if panose and panose.bFamilyType == 2:
        return "sans" if panose.bSerifStyle in (11, 12, 13, 14, 15) else "serif" if 2 <= panose.bSerifStyle <= 10 else "sans"
    return "sans"


def _read_face(path: Path, index: int, font: TTFont) -> Optional[Face]:
    family = _name(font, 16, 1)
    if not family or family.startswith(".") or "LastResort" in family:
        return None
    cmap = font.getBestCmap() or {}
    latin = all(ord(ch) in cmap for ch in "aeAZ09")
    devanagari = DEVANAGARI_PROBE in cmap
    if not latin and not devanagari:
        return None
    os2 = font.get("OS/2")
    head = font.get("head")
    weight = getattr(os2, "usWeightClass", 400) or 400
    italic = bool(getattr(os2, "fsSelection", 0) & 1) or bool(getattr(head, "macStyle", 0) & 2)
    weight_axis = None
    if "fvar" in font:
        for axis in font["fvar"].axes:
            if axis.axisTag == "wght":
                weight_axis = (axis.minValue, axis.maxValue)
                weight = int(axis.defaultValue)
    return Face(
        path=str(path),
        index=index,
        family=family,
        weight=weight,
        italic=italic,
        category=_category(font, family),
        latin=latin,
        devanagari=devanagari,
        weight_axis=weight_axis,
    )


class FontLibrary:
    def __init__(self, dirs: Optional[list[Path]] = None):
        self.dirs = dirs if dirs is not None else _font_dirs()
        self.families: dict[str, list[Face]] = {}  # family key -> faces
        self.ps_families: dict[str, str] = {}  # PostScript family key -> family key
        self._load()

    def _load(self) -> None:
        # fontTools warns about harmless quirks in many system fonts.
        logging.getLogger("fontTools").setLevel(logging.ERROR)
        seen: set[str] = set()
        for directory in self.dirs:
            if not directory.is_dir():
                continue
            for path in sorted(directory.rglob("*")):
                if path.suffix.lower() not in FONT_SUFFIXES or path.name in seen:
                    continue
                seen.add(path.name)
                try:
                    if path.suffix.lower() == ".ttc":
                        with TTCollection(str(path), lazy=True) as collection:
                            fonts = list(enumerate(collection.fonts))
                            self._add_all(path, fonts)
                    else:
                        with TTFont(str(path), lazy=True) as font:
                            self._add_all(path, [(0, font)])
                except Exception as exc:  # broken or unsupported font files are skipped
                    logger.debug("Skipping font %s: %s", path, exc)
        logger.info("Font library: %d families", len(self.families))

    def _add_all(self, path: Path, fonts) -> None:
        for index, font in fonts:
            face = _read_face(path, index, font)
            if not face:
                continue
            key = family_key(face.family)
            self.families.setdefault(key, []).append(face)
            ps_family = pdf_family_key(_name(font, 6))
            if ps_family and ps_family != key:
                self.ps_families.setdefault(ps_family, key)

    def faces(self, family: str) -> list[Face]:
        key = family_key(family)
        return self.families.get(key) or self.families.get(self.ps_families.get(key, ""), [])

    def face(self, family: str, bold: bool, italic: bool) -> Optional[Face]:
        """The family's face closest to the requested weight and slant."""
        faces = self.faces(family)
        if not faces:
            return None
        target = 700 if bold else 400

        def distance(face: Face) -> tuple:
            weight = target if face.weight_axis and face.weight_axis[0] <= target <= face.weight_axis[1] else face.weight
            return (face.italic != italic, abs(weight - target))

        return min(faces, key=distance)

    def match(
        self,
        pdf_font: str,
        *,
        text: str,
        bold: bool,
        italic: bool,
        serif: bool,
        mono: bool,
        family: str = "",
    ) -> Optional[Match]:
        """Best installed face for drawing `text` in place of `pdf_font` (or in `family`)."""
        key = pdf_family_key(pdf_font)
        candidates: list[tuple[str, bool]] = []
        if family:
            candidates.append((family, False))
        else:
            if key:
                candidates.append((key, True))
                candidates += [(name, False) for name in ALIASES.get(key, [])]
            kind = "mono" if mono else "serif" if serif else "sans"
            if any(0x0900 <= ord(ch) <= 0x097F for ch in text):
                candidates += [(name, False) for name in GENERIC["devanagari-serif" if serif else "devanagari-sans"]]
            candidates += [(name, False) for name in GENERIC[kind]]

        for name, exact in candidates:
            face = self.face(name, bold, italic)
            if face and face.covers(text):
                return Match(face, exact and bool(key))
        return None

    def picker(self) -> list[dict]:
        """Families offered in the editor's font picker."""
        entries = []
        for faces in self.families.values():
            first = faces[0]
            if first.family.startswith("Noto") and first.family not in NOTO_PICKER:
                continue
            entries.append(
                {
                    "name": first.family,
                    "category": "devanagari" if first.devanagari and not first.latin else first.category,
                    "devanagari": any(f.devanagari for f in faces),
                }
            )
        return sorted(entries, key=lambda e: e["name"].lower())


_library: Optional[FontLibrary] = None
_lock = threading.Lock()


def library() -> FontLibrary:
    global _library
    with _lock:
        if _library is None:
            _library = FontLibrary()
        return _library
