#!/usr/bin/env python3
# Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
"""Erzeugt den Mauszeiger „Nebel-Cursor“: Bibata-Modern-Classic mit dunkelgrauer
statt schwarzer Füllung (weißer Rand bleibt), zusätzlich in 16/18/20 px. Quelle: Paket mint-cursor-themes.

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


SMALL = (16, 18, 20)  # Bibata hat erst ab 22 px; kleinere Stufen aus der größten heruntergerechnet


def area_matrix(n_in, n_out):
    """Flächengewichte für das Verkleinern n_in -> n_out (Box-Filter)."""
    m = np.zeros((n_out, n_in), np.float64)
    r = n_in / n_out
    for o in range(n_out):
        a, b = o * r, (o + 1) * r
        for i in range(int(a), min(n_in, int(np.ceil(b)))):
            m[o, i] = max(0.0, min(b, i + 1) - max(a, i))
    return m / r


def shrink_box(px, w, h, nw, nh):
    img = px.reshape(h, w)
    my, mx = area_matrix(h, nh), area_matrix(w, nw)
    out = 0
    for sh in (24, 16, 8, 0):  # premultiplied ARGB: Kanäle einzeln mitteln
        ch = ((img >> sh) & 0xFF).astype(np.float64)
        v = np.clip(np.rint(my @ ch @ mx.T), 0, 255).astype(np.uint32)
        out = out | (v << sh)
    return out.reshape(-1)


def shrink(px, w, h, nw, nh):
    """Verkleinern mit 1 px dickerem weißen Rand (sonst verwischt er) und Lanczos-Filter."""
    try:
        from PIL import Image, ImageFilter
    except ImportError:
        return shrink_box(px, w, h, nw, nh)
    a = px.reshape(h, w)
    rgba = np.stack([(a >> 16) & 255, (a >> 8) & 255, a & 255, (a >> 24) & 255], -1).astype(np.uint8)
    im = Image.frombuffer("RGBa", (w, h), rgba.tobytes(), "raw", "RGBa", 0, 1).convert("RGBA")
    rim = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    rim.putalpha(im.getchannel("A").filter(ImageFilter.MaxFilter(3)))
    rim.alpha_composite(im)
    small = np.asarray(rim.resize((nw, nh), Image.LANCZOS, reducing_gap=None)).astype(np.float32)
    # Lanczos schwingt über: keine Farbe dunkler als das Nebel-Grau, Alpha 0…255
    al = np.clip(small[..., 3], 0, 255)
    rgb = np.clip(small[..., :3], GREY, 255) * al[..., None] / 255.0
    v = np.rint(np.concatenate([rgb, al[..., None]], -1)).astype(np.uint32)
    return ((v[..., 3] << 24) | (v[..., 0] << 16) | (v[..., 1] << 8) | v[..., 2]).reshape(-1)


def convert(data):
    _, hdr, _, ntoc = struct.unpack_from("<4sIII", data, 0)
    chunks = []  # (typ, subtyp, bytes)
    images = {}  # Nennmaß -> [(w, h, xhot, yhot, delay, pixel)]
    for i in range(ntoc):
        typ, sub, pos = struct.unpack_from("<III", data, hdr + i * 12)
        if typ != IMAGE:
            chdr, _t, _s, _v, ln = struct.unpack_from("<5I", data, pos)
            chunks.append((typ, sub, data[pos:pos + chdr + ln]))
            continue
        chdr, _t, _s, ver, w, h, xh, yh, delay = struct.unpack_from("<9I", data, pos)
        start = pos + chdr
        px = recolor(np.frombuffer(data[start:start + w * h * 4], dtype="<u4").astype(np.uint32))
        images.setdefault(sub, []).append((w, h, xh, yh, delay, px))
    for size in SMALL:
        if size in images or not images:
            continue
        src = max(images)
        f = size / src
        frames = []
        for w, h, xh, yh, delay, px in images[src]:
            nw, nh = max(1, round(w * f)), max(1, round(h * f))
            frames.append((nw, nh, min(nw - 1, round(xh * f)), min(nh - 1, round(yh * f)),
                           delay, shrink(px, w, h, nw, nh)))
        images[size] = frames
    for sub in sorted(images):
        for w, h, xh, yh, delay, px in images[sub]:
            body = struct.pack("<9I", 36, IMAGE, sub, 1, w, h, xh, yh, delay) + px.astype("<u4").tobytes()
            chunks.append((IMAGE, sub, body))
    head = struct.pack("<4sIII", b"Xcur", 16, 0x10000, len(chunks))
    pos = 16 + 12 * len(chunks)
    toc, body = b"", b""
    for typ, sub, b in chunks:
        toc += struct.pack("<III", typ, sub, pos + len(body))
        body += b
    return head + toc + body


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
