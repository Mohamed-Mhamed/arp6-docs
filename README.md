# ARP 6 — interactive documentation

A static site that presents an ARP 6 illustration and lets the reader click a
block to open that block's detail drawing, with the block animating open into
the detail rather than the page jumping. Any number of drawings can be chained,
to any depth.

The whole site stays on **one URL**, which is what makes it safe to link from a
Group-Office wiki page: the link never changes, wherever the reader navigates to.

---

## Files

| Path | What it is | Edit it? |
| --- | --- | --- |
| `data.js` | **The content map.** Which drawings exist, and which block leads where. | **Yes — this is the file you edit.** |
| `assets/*.svg` | The drawings, used unmodified. | Add new ones here. |
| `index.html` | Page shell and styling. | Only for look and feel. |
| `app.js` | Navigation and transition engine. | Rarely. |
| `tools/svg_groups.py` | Reads hotspot coordinates out of an SVG. | No. |
| `tools/validate.py` | Checks `data.js` against the files on disk. | No. |

No build step, no dependencies, no server-side code. The Python tools are
authoring aids only — the published site is just HTML, CSS, JS and SVG.

---

## Adding a transition

Say you want the `ADAU1787_R` block in the architecture drawing to open a new
drawing `adau1787-right-codec.svg`.

**1. Put the drawing in `assets/`.**

```
cp ~/wherever/adau1787-right-codec.svg assets/
```

**2. Read out the coordinates** of the block to click, and of the panel in the
new drawing that it should open into:

```
python tools/svg_groups.py --min-size 60 assets/arp6-system-architecture-flat.svg
python tools/svg_groups.py --min-size 60 assets/adau1787-right-codec.svg
```

Each line is a named group with its box — `x`, `y`, `w`, `h` in that drawing's
own coordinates. This is why the SVGs should keep their group names (`ADAU1787_L`,
`Codec_frame`, `arp-3-0-card` and so on); without them there is nothing to
measure against.

**3. Add a node** for the new drawing in `data.js`, with `frame` set to the panel
it should grow from:

```js
"adau1787-right": {
  title: "ADAU1787 (R) — codec signal flow",
  svg: "assets/adau1787-right-codec.svg",
  viewBox: [1920, 1080],              // must match the file's own viewBox
  frame: { x: 430, y: 260, w: 1150, h: 730 },
  hotspots: []                        // it can lead onward in turn
}
```

**4. Add a hotspot** to the drawing it is reached from:

```js
{
  target: "adau1787-right",
  label: "ADAU1787 (R) — view signal flow",
  group: "ADAU1787_R",                // reference only, not used at runtime
  x: 650, y: 650, w: 340, h: 196
}
```

**5. Check it:**

```
python tools/validate.py
```

It fails loudly on a missing file, a `viewBox` that disagrees with the SVG, a
hotspot pointing at a node that does not exist, or a rectangle outside its
drawing — the four mistakes that are otherwise hard to spot. Warnings cover
hotspots that overlap, are too small to click, or drawings nothing links to.

**6. Look at it** (see *Local preview* below), then commit.

### Notes on the content map

- Nesting is unlimited: a detail drawing can have hotspots of its own, and the
  breadcrumb follows automatically.
- Drawings need not share a shape. Portrait and oversized drawings work, as long
  as each node's `viewBox` matches its file — the page fits each drawing on its
  own terms and animates correctly between differently shaped ones.
- Omitting `frame` makes the transition zoom the whole drawing instead of opening
  one panel. That is the right choice when the target has no obvious main panel.
- Every node is reachable at `…/#node-key`, so a single device page can be linked
  directly from a wiki page when that is more useful than the overview.

---

## How the transition works

Each drawing is fitted into the stage and measured in pixels. On a click, the
target drawing is placed so its `frame` lands exactly on the hotspot that was
clicked — scaled by `hotspot width / frame width` and offset so the two centres
coincide — then animated to its natural size, while the drawing being left
behind pushes in toward that same hotspot and dissolves. Going back runs the
same animation in reverse.

Two deliberate choices, both about robustness rather than elegance:

- **Same-document animation** (Web Animations API), not cross-document view
  transitions. Cross-document transitions would be less code, but Firefox does
  not support them yet, and they would put each drawing on its own URL — so the
  wiki link would only ever land on the overview. This way the behaviour is
  identical in every current browser.
- **Routing by `location.hash`**, not `history.pushState`. `pushState` is
  rejected on `file://` origins, and this page is also meant to work opened
  straight from a disk or a network share, not only over HTTP.

Layout is recomputed on resize, so the page is correct at any window size and on
a projector.

Accessibility: hotspots are real buttons, reachable by <kbd>Tab</kbd> and
activated by <kbd>Enter</kbd>; `Esc` and the browser's back button both go up a
level; `prefers-reduced-motion` switches views without animation.

---

## Local preview

Open `index.html` directly in a browser, or serve the folder:

```
python -m http.server 8787
```

then visit <http://127.0.0.1:8787/>.

---

## Publishing

The site is static, so anything that serves files will do. Two routes:

### GitHub Pages (public URL)

From the repository root, once it is on the lab's GitHub account:

1. **Settings → Pages**
2. **Source:** *Deploy from a branch*
3. **Branch:** `main`, folder `/ (root)`, then **Save**

The URL is `https://<account>.github.io/<repo>/`, live about a minute later, and
rebuilt automatically on every push. It needs no workflow file and no
configuration beyond those three settings.

Two things to know before choosing this:

- On the free plan the repository must be **public** for Pages to serve, so the
  drawings become publicly viewable and search-indexable. A private repository
  needs GitHub Team or Enterprise.
- The URL contains the account and repository names, so **renaming either one
  breaks every link already pasted into the wiki**. If the link is going to
  spread, point a domain at the site instead (`docs.<lab-domain>`, one DNS record
  and one setting), and the link survives any later move.

### Internally (no public exposure)

Copy the folder onto the web root of a server the lab already runs — including
the Group-Office server itself — and link to it on the LAN. No domain, no
GitHub, nothing exposed outside. The site is self-contained and needs no PHP,
database or configuration.

### What Pages cannot do

Static hosting serves files only: no PHP, no database, no server-side code.
Client-side JavaScript is unrestricted, so transitions, interactive diagrams,
search and filtering are all fine. The limit only bites for things like user
accounts or form submissions.

---

## Repository history

This folder began as a test of whether the transition was feasible at all,
published briefly from a personal GitHub account. That page has been taken down.
The intended home is the lab's GitHub account; nothing in the code or the content
map depends on which account hosts it.
