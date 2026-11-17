# ARP 6 — interactive documentation

A static page that presents the ARP 6 system architecture and lets a reader click
into a block to see that block's detail drawing, with an animated transition
rather than a hard page jump.

**Live:** https://mohamed-mhamed.github.io/arp6-docs/

## What is here

| File | Purpose |
| --- | --- |
| `index.html` | The whole page: markup, styles and transition logic. No dependencies, no build step. |
| `assets/arp6-system-architecture-flat.svg` | Overview drawing. The `ADAU1787_L` group is the clickable block. |
| `assets/adau1787-left-codec-new.svg` | Detail drawing for the left ADAU1787 codec. |

## How the transition works

Both drawings share a 1920x1080 user space, which is what makes the effect possible:

| | position | size | centre |
| --- | --- | --- | --- |
| `ADAU1787_L` block (overview) | 650, 400 | 340 x 190 | 820, 495 |
| `Codec_frame` (detail) | 430, 260 | 1150 x 730 | 1005, 625 |

On click, the detail drawing is placed at `scale(340/1150)` = 0.29565 and offset so
its codec frame lands exactly on the blue block, then animated to its natural size,
while the overview pushes in toward that block and dissolves. The block appears to
open into the diagram. Reversing the same animation returns to the overview.

The animation is same-document (Web Animations API), not a cross-document view
transition, so it behaves identically in every current browser including Firefox,
and the whole thing stays on one URL — which is what makes it safe to link from a
wiki page.

## Behaviour

- Hover highlight and tooltip on the clickable block; it pulses three times on first load.
- Return via the back button in the header, `Esc`, or the browser's back button.
- `#adau1787-left` deep links straight to the detail view.
- Routing uses hash assignment rather than `history.pushState`, so the page also works
  opened directly from disk or a network share, where `pushState` is rejected.
- Honours `prefers-reduced-motion`: the views switch without animation.

## Adding another clickable block

1. Find the target group's rect in the overview SVG and note x / y / width / height.
2. Add a `.hotspot` button inside `#arch`, converting those to percentages of 1920 x 1080.
3. Add a layer holding the detail SVG, and give it the scale and offset that map its
   main frame onto the overview block, following the two constants in the script.

## Local preview

Open `index.html` directly, or serve the folder:

```
python -m http.server 8787
```

then visit http://127.0.0.1:8787/
