#!/usr/bin/env python3
# Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
"""Erzeugt den Mauszeiger „Nebel-Cursor“: Bibata-Modern-Classic mit dunkelgrauer
statt schwarzer Füllung (weißer Rand bleibt). Quelle: Paket mint-cursor-themes.

    python3 tools/build-nebel-cursor.py [ziel]   (Standard: ~/.icons/Nebel-Cursor)
"""
import os
import shutil
import struct
import sys
from pathlib import Path

import numpy as np

SRC = Path("/usr/share/icons/Bibata-Modern-Classic")
DST = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / ".icons" / "Nebel-Cursor"
GREY = 0x3c  # Schwarz wird zu #3c3c3c, Weiß bleibt Weiß
IMAGE = 0xFFFD0002


def recolor(pixels):
    a = (pixels >> 24) & 0xFF
    rgb = np.stack([(pixels >> s) & 0xFF for s in (16, 8, 0)]).astype(np.float32)
    af = a.astype(np.float32)
    with np.errstate(divide="ignore", invalid="ignore"):
        straight = np.where(af > 0, rgb * 255.0 / af, 0)       # Premultiplied -> normal
    straight = GREY + straight * (255 - GREY) / 255.0
    pre = np.clip(np.rint(straight * af / 255.0), 0, 255).astype(np.uint32)
    return (a << 24) | (pre[0] << 16) | (pre[1] << 8) | pre[2]


def convert(data):
    data = bytearray(data)
    _, hdr, _, ntoc = struct.unpack_from("<4sIII", data, 0)
    for i in range(ntoc):
        typ, _, pos = struct.unpack_from("<III", data, hdr + i * 12)
        if typ != IMAGE:
            continue
        chdr, _, _, _, w, h = struct.unpack_from("<6I", data, pos)
        start = pos + chdr
        px = np.frombuffer(bytes(data[start:start + w * h * 4]), dtype="<u4").astype(np.uint32)
        data[start:start + w * h * 4] = recolor(px).astype("<u4").tobytes()
    return bytes(data)


def main():
    if not SRC.is_dir():
        sys.exit(f"{SRC} fehlt (Paket mint-cursor-themes installieren)")
    if DST.exists():
        shutil.rmtree(DST)
    (DST / "cursors").mkdir(parents=True)
    for f in sorted((SRC / "cursors").iterdir()):
        out = DST / "cursors" / f.name
        if f.is_symlink():
            os.symlink(os.readlink(f), out)
        else:
            out.write_bytes(convert(f.read_bytes()))
    theme = ("[Icon Theme]\nName=Nebel-Cursor\n"
             "Comment=Bibata Modern Classic in Dunkelgrau (Cinnamon_Theme)\nInherits=Bibata-Modern-Classic\n")
    (DST / "index.theme").write_text(theme)
    (DST / "cursor.theme").write_text("[Icon Theme]\nInherits=Nebel-Cursor\n")
    print("Mauszeiger erzeugt:", DST)


if __name__ == "__main__":
    main()
