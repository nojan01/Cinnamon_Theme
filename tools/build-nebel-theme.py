#!/usr/bin/env python3
# Copyright (c) 2026 Norbert Jander – Skript: MIT-Lizenz; erzeugtes Theme: GPL-3.0 (wie CBlue)
"""Erzeugt das Cinnamon-Theme „Nebel“ aus CBlue (GPL-3.0, Bundy01).

Kopiert CBlue/cinnamon nach Nebel/cinnamon und ersetzt die blaue Farbpalette
durch Grau mit Mint-Grün. Aufruf aus dem Repo-Wurzelverzeichnis:
    python3 tools/build-nebel-theme.py
"""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "CBlue" / "cinnamon"
DST = ROOT / "Nebel" / "cinnamon"

# Akzent: Mint-Grün (wie Desklets #8fc46b, als Fläche etwas dunkler)
ACCENT = (122, 176, 88)        # #7ab058
ACCENT_DARK = (95, 140, 65)    # #5f8c41

RGB_MAP = {
    (82, 148, 226): ACCENT,          # #5294e2 Blau
    (90, 101, 189): ACCENT_DARK,     # #5a65bd Violettblau
    (53, 57, 69): (40, 40, 40),      # bläuliches Dunkelgrau
    (34, 36, 45): (34, 34, 34),      # #22242d
    (45, 48, 65): (45, 45, 45),
    (172, 179, 201): (185, 185, 185),
    (99, 114, 143): (120, 120, 120),
    (75, 81, 98): (80, 80, 80),
    (16, 43, 104): (40, 60, 30),     # #102b68
    (91, 98, 123): (100, 100, 100),  # #5b627b
    (53, 58, 71): (50, 50, 50),      # #353a47
    (186, 195, 207): (195, 195, 195),  # #bac3cf
    (0, 0, 255): ACCENT,             # #0000ff in SVGs
}


def hex_of(rgb):
    return "#%02x%02x%02x" % rgb


def recolor(text):
    for old, new in RGB_MAP.items():
        text = re.sub(re.escape(hex_of(old)), hex_of(new), text, flags=re.I)
        text = re.sub(r"(rgba?\(\s*)%d\s*,\s*%d\s*,\s*%d(\s*[,)])" % old,
                      lambda m: "%s%d, %d, %d%s" % (m.group(1), *new, m.group(2)), text)
    return text


def patch_css(css):
    # Hervorhebung (Desklets, Leiste beim Bearbeiten) grau statt rot
    css = css.replace("background-color: #aa5555;", "background-color: rgba(140, 140, 140, 0.35);")
    # Leiste: Glas wie Dock/Desklets, schmaler
    css = re.sub(r"#panel \{[^}]*\}", """#panel {
	color: #f0f0f0;
	background-color: rgba(30, 30, 30, 0.35);
	box-shadow: 0px 0px 3px 1px rgba(0, 0, 0, 0.45);
	font-size: 10.5pt;
	font-weight: normal;
	height: 34px;
	width: 34px;
}""", css, count=1)
    return css


def main():
    if DST.parent.exists():
        shutil.rmtree(DST.parent)
    shutil.copytree(SRC, DST, ignore=shutil.ignore_patterns("TimeFull", "Wallpaper.png", "dock.theme"))
    for f in DST.rglob("*"):
        if f.suffix in (".css", ".svg"):
            t = recolor(f.read_text(encoding="utf-8"))
            if f.name == "cinnamon.css":
                t = patch_css(t)
            f.write_text(t, encoding="utf-8")
    (DST / "theme.json").write_text(json.dumps({"cinnamon-theme": {
        "name": "Nebel", "author": "Norbert Jander (basiert auf CBlue von Bundy01)",
        "version": "1.0", "type": "custom", "thumbnail": "thumbnail.png", "url": ""}},
        indent=3, ensure_ascii=False) + "\n", encoding="utf-8")
    left = [c for c in ("#5294e2", "#5a65bd", "82, 148, 226", "#aa5555")
            if c in (DST / "cinnamon.css").read_text()]
    print("Nebel erzeugt:", DST, "| verbleibend:", left or "keine")


if __name__ == "__main__":
    main()
