#!/usr/bin/env python3
"""List the top-level groups of an SVG with their bounding boxes.

Every hotspot in the documentation page needs the x/y/width/height of the group
it covers, in the drawing's own user space. Measuring those by hand is slow and
error prone, so this reads them out of the file instead.

    python tools/svg_groups.py ../arp6-system-architecture-flat.svg
    python tools/svg_groups.py --json ../*.svg

Boxes are approximate for curved paths (control points are included, which can
overstate a box slightly) and exact for rect/line/circle/ellipse/polygon, which
is what these drawings are mostly built from. Text is ignored: a label's box is
not a useful click target.
"""

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

SVG = "http://www.w3.org/2000/svg"
NUM = re.compile(r"-?\d*\.?\d+(?:[eE][-+]?\d+)?")


def tag(el):
    return el.tag.split("}", 1)[-1]


def nums(s):
    return [float(n) for n in NUM.findall(s or "")]


def translate_of(el):
    """Only translate(...) is handled: these drawings use nothing else."""
    t = el.get("transform") or ""
    m = re.search(r"translate\(([^)]*)\)", t)
    if not m:
        return 0.0, 0.0
    v = nums(m.group(1))
    return (v[0] if v else 0.0), (v[1] if len(v) > 1 else 0.0)


PATH_CMD = re.compile(r"([MmLlHhVvCcSsQqTtAaZz])")

# how many numbers each command takes, per repetition
ARGC = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}


def path_box(d):
    """Bounding box of a path's data, honouring relative commands.

    Control points are included rather than the true curve extrema, so a box can
    be slightly larger than the ink. That is the safe direction for a hotspot.
    """
    tokens = [t for t in PATH_CMD.split(d) if t.strip()]
    xs, ys = [], []
    cx = cy = 0.0          # current point
    sx = sy = 0.0          # sub-path start, for Z
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

        up = cmd.upper()
        rel = cmd.islower()
        n = ARGC[up]

        if n == 0:                                  # Z
            cx, cy = sx, sy
            xs.append(cx); ys.append(cy)
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
                # rx ry rotation large-arc sweep x y -- only the last pair is a point
                ex, ey = a[5], a[6]
                cx, cy = (cx + ex, cy + ey) if rel else (ex, ey)
            else:
                # every pair in the argument list is a point or control point
                for j in range(0, n, 2):
                    px = cx + a[j] if rel else a[j]
                    py = cy + a[j + 1] if rel else a[j + 1]
                    xs.append(px); ys.append(py)
                cx, cy = px, py

            xs.append(cx); ys.append(cy)

            if up == "M" and k == 0:
                sx, sy = cx, cy

    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def own_box(el):
    """Bounding box of a single shape in its parent's coordinates, or None."""
    t = tag(el)
    g = el.get

    try:
        if t == "rect":
            x, y = float(g("x", 0)), float(g("y", 0))
            return x, y, x + float(g("width", 0)), y + float(g("height", 0))

        if t in ("circle", "ellipse"):
            cx, cy = float(g("cx", 0)), float(g("cy", 0))
            if t == "circle":
                rx = ry = float(g("r", 0))
            else:
                rx, ry = float(g("rx", 0)), float(g("ry", 0))
            return cx - rx, cy - ry, cx + rx, cy + ry

        if t == "line":
            xs = [float(g("x1", 0)), float(g("x2", 0))]
            ys = [float(g("y1", 0)), float(g("y2", 0))]
            return min(xs), min(ys), max(xs), max(ys)

        if t in ("polygon", "polyline"):
            v = nums(g("points"))
            if len(v) < 2:
                return None
            xs, ys = v[0::2], v[1::2]
            return min(xs), min(ys), max(xs), max(ys)

        if t == "path":
            return path_box(g("d") or "")
    except (TypeError, ValueError):
        return None

    return None


def union(boxes):
    boxes = [b for b in boxes if b]
    if not boxes:
        return None
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def box_of(el, skip_text=True):
    """Bounding box of an element and its descendants, in parent coordinates."""
    if skip_text and tag(el) in ("text", "tspan", "title", "desc"):
        return None

    boxes = [own_box(el)]
    for child in el:
        boxes.append(box_of(child, skip_text))

    b = union(boxes)
    if b is None:
        return None

    dx, dy = translate_of(el)
    return b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy


def viewbox(root):
    v = nums(root.get("viewBox"))
    if len(v) == 4:
        return v[2], v[3]
    return float(nums(root.get("width", "0") or "0")[0] or 0), \
        float(nums(root.get("height", "0") or "0")[0] or 0)


def groups(path):
    root = ET.parse(path).getroot()
    vw, vh = viewbox(root)
    out = []

    for g in root.iter("{%s}g" % SVG):
        gid = g.get("id")
        if not gid:
            continue
        b = box_of(g)
        if not b:
            continue
        x, y, x2, y2 = b
        w, h = x2 - x, y2 - y
        if w <= 0 or h <= 0:
            continue
        out.append({
            "id": gid,
            "x": round(x, 1), "y": round(y, 1),
            "width": round(w, 1), "height": round(h, 1),
            # ready to paste into the manifest: percentages of the viewBox
            "pct": {
                "left": round(x / vw * 100, 4) if vw else None,
                "top": round(y / vh * 100, 4) if vh else None,
                "width": round(w / vw * 100, 4) if vw else None,
                "height": round(h / vh * 100, 4) if vh else None,
            },
        })

    out.sort(key=lambda r: (r["y"], r["x"]))
    return {"file": os.path.basename(path), "viewBox": [vw, vh], "groups": out}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("svg", nargs="+")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--min-size", type=float, default=0.0,
                    help="hide groups narrower or shorter than this (user units)")
    args = ap.parse_args()

    results = []
    for p in args.svg:
        try:
            r = groups(p)
        except (ET.ParseError, OSError) as e:
            print("!! %s: %s" % (p, e), file=sys.stderr)
            continue
        r["groups"] = [g for g in r["groups"]
                       if g["width"] >= args.min_size and g["height"] >= args.min_size]
        results.append(r)

    if args.json:
        print(json.dumps(results, indent=2))
        return

    for r in results:
        vw, vh = r["viewBox"]
        print("\n%s   viewBox %g x %g" % (r["file"], vw, vh))
        print("  %-32s %8s %8s %8s %8s" % ("group id", "x", "y", "w", "h"))
        print("  " + "-" * 68)
        for g in r["groups"]:
            print("  %-32s %8.1f %8.1f %8.1f %8.1f"
                  % (g["id"], g["x"], g["y"], g["width"], g["height"]))


if __name__ == "__main__":
    main()
