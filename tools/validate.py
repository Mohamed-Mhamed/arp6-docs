#!/usr/bin/env python3
"""Check data.js against the SVG files on disk.

Run this after every edit to data.js, before committing:

    python tools/validate.py

It reports, as errors:
  * a node whose svg file is missing
  * a viewBox in data.js that disagrees with the SVG file
  * a hotspot pointing at a node key that does not exist
  * a hotspot or frame rectangle outside its drawing, or with no area
  * a start node that does not exist

and, as warnings:
  * a node nothing links to and that is not the start node (unreachable)
  * a hotspot smaller than 24 units, which is hard to hit
  * hotspots that overlap each other
  * a detail node with no frame (the transition becomes a plain zoom)

Exit status is 1 if there are errors, else 0, so it can gate a commit.
"""

import json
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def load_data_js(path):
    """Pull the object literal out of data.js and read it as JSON.

    data.js is written for humans -- comments, trailing commas, unquoted keys --
    so it is normalised here rather than parsed as JavaScript.
    """
    src = open(path, encoding="utf-8").read()

    m = re.search(r"window\.ARP_DOCS\s*=\s*", src)
    if not m:
        err("data.js: no `window.ARP_DOCS = ...` assignment found")
        return None

    # take from the first { after the assignment to its matching }
    start = src.index("{", m.end())
    depth, i, in_str, quote, in_line, in_block = 0, start, False, "", False, False
    while i < len(src):
        c, nxt = src[i], src[i + 1:i + 2]
        if in_line:
            if c == "\n":
                in_line = False
        elif in_block:
            if c == "*" and nxt == "/":
                in_block = False
                i += 1
        elif in_str:
            if c == "\\":
                i += 1
            elif c == quote:
                in_str = False
        elif c == "/" and nxt == "/":
            in_line = True
            i += 1
        elif c == "/" and nxt == "*":
            in_block = True
            i += 1
        elif c in "\"'":
            in_str, quote = True, c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                body = src[start:i + 1]
                break
        i += 1
    else:
        err("data.js: unbalanced braces")
        return None

    # strip comments
    out, i, in_str, quote = [], 0, False, ""
    while i < len(body):
        c, nxt = body[i], body[i + 1:i + 2]
        if in_str:
            out.append(c)
            if c == "\\" and nxt:
                out.append(nxt)
                i += 2
                continue
            if c == quote:
                in_str = False
        elif c in "\"'":
            in_str, quote = True, c
            out.append(c)
        elif c == "/" and nxt == "/":
            while i < len(body) and body[i] != "\n":
                i += 1
            continue
        elif c == "/" and nxt == "*":
            i = body.find("*/", i)
            if i < 0:
                break
            i += 2
            continue
        else:
            out.append(c)
        i += 1

    text = "".join(out)
    text = re.sub(r"'([^'\\]*)'", r'"\1"', text)              # single -> double
    text = re.sub(r"([{,]\s*)([A-Za-z_$][\w$]*)\s*:", r'\1"\2":', text)
    text = re.sub(r",(\s*[}\]])", r"\1", text)                # trailing commas

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        err("data.js: could not be parsed after normalising (%s)" % e)
        return None


def svg_viewbox(path):
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError) as e:
        return None, str(e)
    v = [float(n) for n in re.findall(r"-?\d*\.?\d+", root.get("viewBox") or "")]
    if len(v) != 4:
        return None, "no usable viewBox attribute"
    return (v[2], v[3]), None


def rect_of(h):
    return (float(h.get("x", 0)), float(h.get("y", 0)),
            float(h.get("w", 0)), float(h.get("h", 0)))


def contains(outer, inner):
    ox, oy, ow, oh = outer
    ix, iy, iw, ih = inner
    return (ix >= ox - 1 and iy >= oy - 1
            and ix + iw <= ox + ow + 1 and iy + ih <= oy + oh + 1)


def overlaps(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah


def main():
    data = load_data_js(os.path.join(ROOT, "data.js"))
    if data is None:
        report()
        return

    nodes = data.get("nodes") or {}
    start = data.get("start")

    if not nodes:
        err("data.js: no nodes defined")
    if start not in nodes:
        err("data.js: start node %r is not in nodes" % start)

    linked = set()

    for key, n in nodes.items():
        where = "node %r" % key
        title = n.get("title")
        if not title:
            warn("%s: no title, the breadcrumb will be blank" % where)

        # ---- the drawing
        rel = n.get("svg")
        vb = n.get("viewBox")
        if not rel:
            err("%s: no svg path" % where)
        else:
            path = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.isfile(path):
                err("%s: svg not found: %s" % (where, rel))
            else:
                actual, problem = svg_viewbox(path)
                if problem:
                    err("%s: %s (%s)" % (where, problem, rel))
                elif not (isinstance(vb, list) and len(vb) == 2):
                    err("%s: viewBox must be [width, height]; the file is %g x %g"
                        % (where, actual[0], actual[1]))
                elif abs(vb[0] - actual[0]) > 0.5 or abs(vb[1] - actual[1]) > 0.5:
                    err("%s: viewBox is [%g, %g] but %s is %g x %g -- hotspots "
                        "will be misplaced" % (where, vb[0], vb[1], rel,
                                               actual[0], actual[1]))
                else:
                    vb = [actual[0], actual[1]]

        if not (isinstance(vb, list) and len(vb) == 2):
            continue                                   # cannot check geometry

        w, h = vb

        # ---- frame
        fr = n.get("frame")
        if fr:
            x, y, fw, fh = rect_of(fr)
            if fw <= 0 or fh <= 0:
                err("%s: frame has no area" % where)
            elif x < -1 or y < -1 or x + fw > w + 1 or y + fh > h + 1:
                err("%s: frame %g,%g %gx%g falls outside the %gx%g drawing"
                    % (where, x, y, fw, fh, w, h))

        # ---- sections
        for i, sec in enumerate(n.get("sections") or []):
            stag = "%s section %d" % (where, i + 1)
            sx, sy, sw, sh = rect_of(sec)
            if sw <= 0 or sh <= 0:
                err("%s: rectangle has no area" % stag)
            elif sx < -1 or sy < -1 or sx + sw > w + 1 or sy + sh > h + 1:
                err("%s: %g,%g %gx%g falls outside the %gx%g drawing"
                    % (stag, sx, sy, sw, sh, w, h))
            if not sec.get("title"):
                warn("%s: no title, the section bar will be blank" % stag)

        # ---- hotspots
        spots = n.get("hotspots") or []
        boxes = []
        for i, hs in enumerate(spots):
            tag = "%s hotspot %d" % (where, i + 1)
            target = hs.get("target")

            action = hs.get("action")
            if not target and not action:
                err("%s: has neither a target nor an action" % tag)
            elif action and action not in ("zoom",):
                err("%s: unknown action %r" % (tag, action))
            elif not target:
                pass                       # an in-place action, nothing to resolve
            elif target not in nodes:
                err("%s: target %r does not exist" % (tag, target))
            elif target == key:
                err("%s: targets its own node" % tag)
            else:
                linked.add(target)

            x, y, hw, hh = rect_of(hs)
            if hw <= 0 or hh <= 0:
                err("%s: rectangle has no area (w/h missing?)" % tag)
                continue
            if x < -1 or y < -1 or x + hw > w + 1 or y + hh > h + 1:
                err("%s: %g,%g %gx%g falls outside the %gx%g drawing"
                    % (tag, x, y, hw, hh, w, h))
            if min(hw, hh) < 24:
                warn("%s: only %gx%g units, which is hard to click" % (tag, hw, hh))

            for j, prev in boxes:
                if not overlaps((x, y, hw, hh), prev):
                    continue
                if contains(prev, (x, y, hw, hh)):
                    continue               # nested on purpose: inner wins, as intended
                warn("%s overlaps hotspot %d without being inside it: "
                     "the upper one wins the click" % (tag, j + 1))
            boxes.append((i, (x, y, hw, hh)))

            if not hs.get("label"):
                warn("%s: no label, the tooltip falls back to the target's title" % tag)

    # ---- reachability and frames
    for key, n in nodes.items():
        if key != start and key not in linked:
            warn("node %r: nothing links to it; only a direct #%s link reaches it"
                 % (key, key))
        if key in linked and not n.get("frame") and key != start:
            warn("node %r: no frame, so the transition zooms the whole drawing "
                 "instead of opening a panel" % key)

    report(len(nodes), sum(len(n.get("hotspots") or []) for n in nodes.values()))


def report(n_nodes=None, n_spots=None):
    for w in warnings:
        print("warning: %s" % w)
    for e in errors:
        print("ERROR:   %s" % e)

    if n_nodes is not None:
        print("\n%d node(s), %d hotspot(s) checked." % (n_nodes, n_spots))
    print("%d error(s), %d warning(s)." % (len(errors), len(warnings)))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
