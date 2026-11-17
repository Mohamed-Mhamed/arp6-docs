/* ===========================================================================
   ARP 6 documentation — content map
   ---------------------------------------------------------------------------
   The only file you need to edit to add, remove or re-point a transition.

   A node is one illustration:

     title     text shown in the breadcrumb
     svg       path to the drawing, under assets/
     viewBox   [width, height] exactly as in the SVG's own viewBox attribute
     frame     OPTIONAL. The rectangle inside this drawing that the parent's
               hotspot grows into — normally the main panel or board. Omit it
               and the whole drawing is used, which reads as a zoom.
     sections  OPTIONAL. Named regions of a tall drawing. A node with sections
               gets a zoom control, and the reader can scroll or use the arrow
               keys to move from one to the next.
     hotspots  Clickable rectangles, in this drawing's own coordinates:
                 target  — open another node
                 action  — "zoom" magnifies the rectangle in place, for a
                           detail that has no illustration of its own yet
                 style   — "button" draws a visible orange circled arrow
                           instead of an invisible region

   Coordinates come out of the drawings rather than being measured by hand:

       python tools/svg_groups.py  assets/foo.svg     (drawings with named groups)
       python tools/find_shapes.py assets/foo.svg     (drawings converted from .ai,
                                                       where the names were lost)

   Check every edit with:  python tools/validate.py
   =========================================================================== */

window.ARP_DOCS = {

  start: "timeline",

  nodes: {

    /* 1 ------------------------------------------------------------------ */
    timeline: {
      title: "Hardware evolution",
      svg: "assets/arp-evolution-timeline.svg",
      viewBox: [1436.92, 810],
      hotspots: [
        {
          target: "introduction",
          label: "ARP 6.0 — the current platform",
          x: 1083, y: 349.5, w: 147, h: 100.5
        }
      ]
    },

    /* 2 ------------------------------------------------------------------ */
    introduction: {
      title: "Introducing ARP 6",
      svg: "assets/arp6-introduction.svg",
      viewBox: [1920, 1080],
      hotspots: [
        {
          target: "components",
          label: "Related hardware",
          x: 920, y: 910, w: 80, h: 86
        }
      ]
    },

    /* 3 ------------------------------------------------------------------ */
    components: {
      title: "Related components",
      svg: "assets/arp6-related-components.svg",
      viewBox: [1920, 1080],
      hotspots: [
        /* Each card magnifies in place. When a component gets an illustration
           of its own, swap `action: "zoom"` for `target: "<node>"` and nothing
           else has to change. */
        { action: "zoom", label: "Virtuose Elite (VE) 0.3", x: 100, y: 250, w: 400, h: 322 },
        { action: "zoom", label: "Raspberry Pi 5",          x: 540, y: 250, w: 400, h: 322 },
        { action: "zoom", label: "AI HAT for Raspberry Pi 5", x: 980, y: 250, w: 400, h: 322 },
        { action: "zoom", label: "Earphones · SHURE SE846", x: 1420, y: 250, w: 400, h: 322 },
        { action: "zoom", label: "Raspberry Pi 4",          x: 100, y: 600, w: 400, h: 322 },
        { action: "zoom", label: "ESP32 P4 controller",     x: 540, y: 600, w: 400, h: 322 },
        { action: "zoom", label: "ESP32 WROVER controller", x: 980, y: 600, w: 400, h: 322 },
        { action: "zoom", label: "3M PIC100 earpieces",     x: 1420, y: 600, w: 400, h: 322 },
        {
          target: "matrix",
          label: "Platform combinations",
          x: 920, y: 945, w: 80, h: 86
        }
      ]
    },

    /* 4 ------------------------------------------------------------------ */
    matrix: {
      title: "Platform combinations",
      svg: "assets/arp6-platform-matrix.svg",
      viewBox: [1920, 1080],
      hotspots: [
        { target: "deployment", label: "Deployment", x: 920, y: 920, w: 80, h: 86 }
      ]
    },

    /* 5 ------------------------------------------------------------------ */
    deployment: {
      title: "Platform deployment",
      svg: "assets/arp6-platform-deployment.svg",
      viewBox: [1920, 1080],
      hotspots: [
        { target: "critias", label: "Technology stack", x: 920, y: 912, w: 80, h: 86 }
      ]
    },

    /* 6 ------------------------------------------------------------------ */
    critias: {
      title: "How CRITIAS built on Virtuose Elite",
      svg: "assets/critias-VE.svg",
      viewBox: [1080, 1920],
      /* A tall drawing: it is read a section at a time rather than all at once */
      sections: [
        { title: "01 · User interface", x: 24, y: 138, w: 1034, h: 304 },
        { title: "02 · Application",    x: 24, y: 452, w: 1034, h: 378 },
        { title: "03 · Core services",  x: 24, y: 847, w: 1034, h: 378 },
        { title: "04 · Firmware",       x: 24, y: 1225, w: 1034, h: 246 },
        { title: "05 · Hardware",       x: 24, y: 1481, w: 1034, h: 378 }
      ],
      hotspots: [
        {
          target: "architecture",
          label: "ARP 6 — the research platform",
          x: 62.2, y: 1556.5, w: 980.2, h: 261.5
        }
      ]
    },

    /* 7 ------------------------------------------------------------------ */
    architecture: {
      title: "System architecture",
      svg: "assets/arp6-system-architecture.svg",
      viewBox: [1439.6, 810.003],
      /* the dashed platform boundary: what the CRITIAS hardware block opens into */
      frame: { x: 401.6, y: 171.9, w: 887.3, h: 527.2 },
      hotspots: [
        /* The platform boundary is listed first so the blocks inside it sit on
           top: clicking a block opens that block, clicking the space around
           them opens the signal flow. */
        {
          target: "signalflow",
          label: "How the signal flows through the platform",
          x: 401.6, y: 171.9, w: 887.3, h: 527.2
        },
        { target: "codec", label: "ADAU 1787 L", x: 470.2, y: 293, w: 255, h: 142.5 },
        { target: "codec", label: "ADAU 1787 R", x: 470.2, y: 480.5, w: 255, h: 142.5 },
        { target: "pi5", label: "Raspberry Pi 5", x: 867.7, y: 218, w: 300, h: 172.5 },
        { target: "hat", label: "AI HAT+2", x: 867.7, y: 495.5, w: 300, h: 172.5 },
        {
          target: "vision",
          label: "Vision project",
          style: "button",
          x: 690, y: 722, w: 60, h: 60
        }
      ]
    },

    /* 8 ------------------------------------------------------------------ */
    signalflow: {
      title: "Signal and algorithm flow",
      svg: "assets/arp6-signal-flow.svg",
      viewBox: [1920, 1080],
      hotspots: [
        { target: "codec", label: "Inside the ADAU 1787", x: 518, y: 134, w: 44, h: 44 }
      ]
    },

    /* 9 ------------------------------------------------------------------ */
    codec: {
      title: "ADAU 1787 L · SigmaStudio",
      svg: "assets/adau1787-left-codec.svg",
      viewBox: [1438.28, 779.25],
      frame: { x: 320.8, y: 164.2, w: 862.5, h: 547.5 }
    },

    /* 10 ----------------------------------------------------------------- */
    pi5: {
      title: "Raspberry Pi 5 processing",
      svg: "assets/raspberry-pi5-processing.svg",
      viewBox: [1920, 1080],
      frame: { x: 440, y: 262, w: 1100, h: 736 }
    },

    /* 11 ----------------------------------------------------------------- */
    hat: {
      title: "AI HAT+2 inference",
      svg: "assets/ai-hat2-inference.svg",
      viewBox: [1920, 1080],
      frame: { x: 440, y: 262, w: 1100, h: 736 }
    },

    /* 12 ----------------------------------------------------------------- */
    vision: {
      title: "Vision project",
      svg: "assets/arp6-vision-project.svg",
      viewBox: [1920, 1080]
    }
  }
};
