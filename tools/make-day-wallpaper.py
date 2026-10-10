#!/usr/bin/env python3
"""Erzeugt aus den Nebel-Wallpapern eine hellere Tag-Variante (*_Tag.jpg)."""
from pathlib import Path
from PIL import Image, ImageEnhance

WP = Path(__file__).resolve().parent.parent / "wallpapers"
for src in sorted(WP.glob("Linux_Mint_Nebel_*x*.jpg")):
    if src.stem.endswith("_Tag"):
        continue
    img = Image.open(src).convert("RGB")
    img = ImageEnhance.Brightness(img).enhance(1.45)
    img = ImageEnhance.Contrast(img).enhance(0.88)
    img = ImageEnhance.Color(img).enhance(1.05)
    dst = src.with_name(src.stem + "_Tag.jpg")
    img.save(dst, quality=92, optimize=True, progressive=True)
    print(dst.name)
