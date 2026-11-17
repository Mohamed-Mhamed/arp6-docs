#!/usr/bin/env python3
"""List the filled shapes in an SVG with their boxes, biggest first.

tools/svg_groups.py reads boxes out of *named* groups. The drawings converted
from Illustrator have no names left -- the text was outlined before export --
so hotspots in those have to be found a different way: by looking for the
coloured rectangle that is the block you want to click.

    python tools/find_shapes.py assets/arp6-system-architecture.svg --min-area 8000
    python tools/find_shapes.py assets/critias-VE.svg --fill "#f0821e"

Unlike svg_groups.py this resolves full transform matrices, because the
converter wraps the drawing in one to flip the Y axis.
"""

import argparse
import math
import re
import sys
import xml.etree.ElementTree as ET

SVG = "http://www.w3.org/2000/svg"
NUM = re.compile(r"-?\d*\.?\d+(?:[eE][-+]?\d+)?")
PATH_CMD = re.compile(r"([MmLlHhVvCcSsQqTtAaZz])")
ARGC = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}

IDENT = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def nums(s):
    return [float(n) for n in NUM.findall(s or "")]


def mat_mul(m, n):
    a, b, c, d, e, f = m
    a2, b2, c2, d2, e2, f2 = n
    return (a * a2 + c * b2, b * a2 + d * b2,
            a * c2 + c * d2, b * c2 + d * d2,
            a * e2 + c * f2 + e, b * e2 + d * f2 + f)


def apply(m, x, y):
    a, b, c, d, e, f = m
    return a * x + c * y + e, b * x + d * y + f


def parse_transform(s):
    """Resolve a transform attribute into one matrix."""
    m = IDENT
    for name, args in re.findall(r"(matrix|translate|scale|rotate)\s*\(([^)]*)\)", s or ""):
        v = nums(args)
        if name == "matrix" and len(v) == 6:
            t = tuple(v)
        elif name == "translate":
            t = (1, 0, 0, 1, v[0] if v else 0, v[1] if len(v) > 1 else 0)
        elif name == "scale":
            sx = v[0] if v else 1
            sy = v[1] if len(v) > 1 else sx
            t = (sx, 0, 0, sy, 0, 0)
        elif name == "rotate":
            ang = math.radians(v[0] if v else 0)
            cs, sn = math.cos(ang), math.sin(ang)
            t = (cs, sn, -sn, cs, 0, 0)
        else:
            continue
        m = mat_mul(m, t)
    return m


def path_points(d):
    tokens = [t for t in PATH_CMD.split(d) if t.strip()]
    pts = []
    cx = cy = sx = sy = 0.0
    i = 0
    while i < len(tokens):
        cmd = tokens[i]
        if cmd not in ARGC:
            i += 1
            continue
        i += 1
        args = nums(tokens[i]) if i < len(tokens) and tokens[i] not in ARGC else []
        if args:
            i += 1
        up, rel, n = cmd.upper(), cmd.islower(), ARGC[cmd.upper()]

        if n == 0:
            cx, cy = sx, sy
            pts.append((cx, cy))
            continue
        if not args:
            continue

        for k in range(0, len(args) - n + 1, n):
            a = args[k:k + n]
            if up == "H":
                cx = cx + a[0] if rel else a[0]
            elif up == "V":
                cy = cy + a[0] if rel else a[0]
            elif up == "A":
                cx, cy = (cx + a[5], cy + a[6]) if rel else (a[5], a[6])
            else:
                for j in range(0, n, 2):
                    px = cx + a[j] if rel else a[j]
                    py = cy + a[j + 1] if rel else a[j + 1]
                    pts.append((px, py))
                cx, cy = px, py
            pts.append((cx, cy))
            if up == "M" and k == 0:
                sx, sy = cx, cy
    return pts


def shape_points(el):
    t = el.tag.split("}", 1)[-1]
    g = el.get
    try:
        if t == "rect":
            x, y = float(g("x", 0)), float(g("y", 0))
            w, h = float(g("width", 0)), float(g("height", 0))
            return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)], w * h
        if t == "path":
            pts = path_points(g("d") or "")
            return pts, None
        if t in ("polygon", "polyline"):
            v = nums(g("points"))
            return list(zip(v[0::2], v[1::2])), None
        if t in ("circle", "ellipse"):
            cx, cy = float(g("cx", 0)), float(g("cy", 0))
            rx = float(g("r", g("rx", 0)))
            ry = float(g("r", g("ry", 0)))
            return [(cx - rx, cy - ry), (cx + rx, cy + ry)], None
    except (TypeError, ValueError):
        pass
    return [], None


def walk(el, m, out, inherited_fill=None):
    m = mat_mul(m, parse_transform(el.get("transform")))
    fill = el.get("fill") or inherited_fill
    style = el.get("style") or ""
    sm = re.search(r"fill\s*:\s*([^;]+)", style)
    if sm:
        fill = sm.group(1).strip()

    pts, _ = shape_points(el)
    if pts:
        tp = [apply(m, x, y) for x, y in pts]
        xs = [p[0] for p in tp]
        ys = [p[1] for p in tp]
        out.append({
            "tag": el.tag.split("}", 1)[-1],
            "fill": (fill or "none").lower(),
            "x": min(xs), "y": min(ys),
            "w": max(xs) - min(xs), "h": max(ys) - min(ys),
        })

    for child in el:
        walk(child, m, out, fill)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("svg")
    ap.add_argument("--min-area", type=float, default=5000.0)
    ap.add_argument("--fill", help="only shapes with this fill, e.g. #f0821e")
    ap.add_argument("--limit", type=int, default=40)
    args = ap.parse_args()

    root = ET.parse(args.svg).getroot()
    vb = nums(root.get("viewBox") or "")
    out = []
    walk(root, IDENT, out)

    rows = [s for s in out
            if s["w"] * s["h"] >= args.min_area
            and s["fill"] not in ("none",)
            and (not args.fill or s["fill"] == args.fill.lower())]
    rows.sort(key=lambda s: -(s["w"] * s["h"]))

    print("%s   viewBox %s" % (args.svg, " ".join("%g" % v for v in vb)))
    print("  %-9s %-10s %8s %8s %8s %8s %12s"
          % ("tag", "fill", "x", "y", "w", "h", "area"))
    print("  " + "-" * 72)
    for s in rows[:args.limit]:
        print("  %-9s %-10s %8.1f %8.1f %8.1f %8.1f %12.0f"
              % (s["tag"], s["fill"], s["x"], s["y"], s["w"], s["h"],
                 s["w"] * s["h"]))


if __name__ == "__main__":
    main()
