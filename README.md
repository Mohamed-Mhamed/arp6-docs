# ARP 6 — interactive documentation

A static site that presents the ARP 6 illustrations as one navigable set: click
a block and it animates open into the drawing that explains it, instead of the
page jumping. Twelve illustrations, nested as deep as four levels.

The whole site stays on **one URL**, which is what makes it safe to link from a
Group-Office wiki page: the link never changes, wherever the reader navigates to.

---

## The chain

```
1  Hardware evolution            click the ARP 6.0 card
2  Introducing ARP 6             orange arrow
3  Related components            any component card magnifies in place
                                 orange arrow
4  Platform combinations         orange arrow
5  Platform deployment           orange arrow
6  How CRITIAS built on VE       5 sections, zoom and scroll
                                 click the ARP 6 hardware block
7  System architecture           five ways down:
                                   · either ADAU 1787  -> 9
                                   · Raspberry Pi 5    -> 10
                                   · AI HAT+2          -> 11
                                   · the platform area -> 8
                                   · orange arrow      -> 12
8  Signal and algorithm flow     codec column -> 9
9  ADAU 1787 L · SigmaStudio
10 Raspberry Pi 5 processing
11 AI HAT+2 inference
12 Vision project
```

Every drawing below the top level has a **Back to …** control at bottom left,
and `Esc` and the browser's back button both work. The breadcrumb across the top
jumps to any level.

---

## Files

| Path | What it is | Edit it? |
| --- | --- | --- |
| `data.js` | **The content map.** Which drawings exist and what leads where. | **Yes — this is the file you edit.** |
| `assets/*.svg` | The twelve illustrations, used unmodified. | Replace to update a drawing. |
| `index.html` | Page shell and styling. | Only for look and feel. |
| `app.js` | Navigation, transitions, zoom and sections. | Rarely. |
| `tools/svg_groups.py` | Reads boxes out of a drawing's **named groups**. | No. |
| `tools/find_shapes.py` | Finds boxes by **fill colour** — for drawings converted from `.ai`, whose group names were lost. | No. |
| `tools/validate.py` | Checks `data.js` against the files on disk. | No. |

No build step, no dependencies, no server-side code. The Python tools are
authoring aids; the published site is HTML, CSS, JS and SVG.

---

## Editing the map

A node is one illustration:

```js
architecture: {
  title: "System architecture",
  svg: "assets/arp6-system-architecture.svg",
  viewBox: [1439.6, 810.003],        // must match the file's own viewBox
  frame: { x: 401.6, y: 171.9, w: 887.3, h: 527.2 },
  hotspots: [ … ]
}
```

- **`frame`** is the rectangle the parent's hotspot grows into. Omit it and the
  whole drawing is used, which reads as a zoom rather than a panel opening.
- **`hotspots`** are rectangles in that drawing's own coordinates:
  - `target: "<node>"` opens another illustration
  - `action: "zoom"` magnifies the rectangle in place — used for the component
    cards, which have no illustration of their own yet. When one gets a drawing,
    swap `action` for `target` and nothing else changes.
  - `style: "button"` draws a visible orange circled arrow, for a control the
    illustration itself does not show. Used on the architecture → vision link.
- **`sections`** turns a tall drawing into something read one region at a time.
  The reader gets a zoom control, and can scroll or use the arrow keys. CRITIAS/VE
  uses this for its five layers.

**Nesting is deliberate on the architecture node.** The platform boundary is
listed *first* so the blocks inside it sit on top: clicking a block opens that
block, clicking the space around them opens the signal flow. Order matters — the
later hotspot wins the click.

### Getting coordinates

Never measure by hand:

```
python tools/svg_groups.py  --min-size 60 assets/arp6-signal-flow.svg   # named groups
python tools/find_shapes.py assets/arp6-system-architecture.svg --min-area 20000
python tools/find_shapes.py assets/critias-VE.svg --fill "#f08a2f"
```

`find_shapes.py` exists because four of the drawings came from Illustrator with
their text outlined, which also stripped the group names — so a hotspot in those
is found by looking for the coloured rectangle you want to click.

Then check the result:

```
python tools/validate.py
```

It fails on a missing drawing, a `viewBox` that disagrees with the SVG, a
dangling target, a hotspot with neither target nor action, or a rectangle outside
its drawing. Warnings cover overlaps that are not deliberate nesting, hotspots too
small to hit, and drawings nothing links to.

---

## How the transition works

Each drawing is fitted into the stage and measured in pixels. On a click, the
target is placed so its `frame` lands exactly on the hotspot that was clicked —
scaled by `hotspot width / frame width`, offset so the centres coincide — then
animated to its natural size, while the drawing being left behind pushes in
toward that same hotspot and dissolves. Going back runs it in reverse.

Two deliberate choices, both about robustness:

- **Same-document animation** (Web Animations API), not cross-document view
  transitions. Those would be less code, but Firefox does not support them yet,
  and they would put each drawing on its own URL — so the wiki link would only
  ever land on the first page.
- **Routing by `location.hash`**, not `history.pushState`, which is rejected on
  `file://` origins. The page works opened straight from a disk or a share.

Layout is recomputed on resize, so the page is correct at any window size and on
a projector. The drawings do not share a coordinate space — 1920×1080,
1438×779, portrait 1080×1920 — which is why geometry is resolved at runtime
rather than baked in.

Accessibility: hotspots are real buttons, reachable by <kbd>Tab</kbd>; `Esc` and
the browser's back button go up a level; `prefers-reduced-motion` switches views
without animation.

---

## Local preview

```
python -m http.server 8799
```

then <http://127.0.0.1:8799/>. Opening `index.html` directly works too.

Every node is reachable at `…/#node-key` — `#architecture`, `#codec`, `#vision`
and so on — so a single illustration can be linked from a wiki page directly.

---

## Publishing

Static, so anything that serves files will do.

### GitHub Pages

**Settings → Pages → Source:** *Deploy from a branch* → **`main` / `/ (root)`**.
Live about a minute later, rebuilt on every push, no workflow file needed.

Two things to know: on the free plan the repository must be **public** for Pages
to serve, and the URL contains the account and repository names — so renaming
either breaks every link already pasted into the wiki. If the link will spread,
point a domain at it instead.

### Internally

Copy the folder onto the web root of a server the lab already runs, including the
Group-Office server itself, and link to it on the LAN. No domain, nothing exposed
outside, no PHP or database needed.
