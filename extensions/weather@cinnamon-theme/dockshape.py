#!/usr/bin/env python3
# Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
# Gibt die Klickfläche (X-Input-Shape) eines Fensters aus: "x y breite höhe",
# relativ zum Fenster. Plank begrenzt sie genau auf die sichtbare Leiste.
import ctypes as C
import sys


class Rect(C.Structure):
    _fields_ = [("x", C.c_short), ("y", C.c_short), ("w", C.c_ushort), ("h", C.c_ushort)]


def main():
    xid = int(sys.argv[1], 0)
    x11 = C.CDLL("libX11.so.6")
    xext = C.CDLL("libXext.so.6")
    x11.XOpenDisplay.restype = C.c_void_p
    xext.XShapeGetRectangles.restype = C.POINTER(Rect)
    d = x11.XOpenDisplay(None)
    if not d:
        return
    n, order = C.c_int(), C.c_int()
    r = xext.XShapeGetRectangles(C.c_void_p(d), C.c_ulong(xid), 2, C.byref(n), C.byref(order))  # ShapeInput
    rs = [(r[i].x, r[i].y, r[i].w, r[i].h) for i in range(n.value)]
    if rs:
        x1 = min(a[0] for a in rs); y1 = min(a[1] for a in rs)
        x2 = max(a[0] + a[2] for a in rs); y2 = max(a[1] + a[3] for a in rs)
        print(x1, y1, x2 - x1, y2 - y1)
    x11.XCloseDisplay(C.c_void_p(d))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
