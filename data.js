/* ===========================================================================
   ARP 6 documentation — content map
   ---------------------------------------------------------------------------
   This is the only file you need to edit to add, remove or re-point a
   transition. No layout or animation code lives here.

   One entry per illustration ("node"). A node declares:

     title     text shown in the breadcrumb
     svg       path to the drawing, under assets/
     viewBox   [width, height] exactly as in the SVG's own viewBox attribute
     frame     OPTIONAL. The rectangle inside this drawing that the parent's
               hotspot should grow into -- normally the main panel or board.
               Omit it and the whole drawing is used, which reads as a zoom
               rather than a block opening up.
     hotspots  OPTIONAL. Clickable rectangles, in this drawing's own
               coordinates. Each one points at another node by key.

   To get x / y / w / h for a hotspot or a frame, read them out of the SVG
   instead of measuring by hand:

       python tools/svg_groups.py --min-size 60 assets/your-drawing.svg

   That prints every named group with its box. Copy the numbers across, then
   check your work with:

       python tools/validate.py

   Nodes may nest as deeply as you like: a hotspot can lead to a node that has
   hotspots of its own, and the breadcrumb follows automatically.
   =========================================================================== */

window.ARP_DOCS = {

  /* the node shown when the page opens */
  start: "architecture",

  nodes: {

    architecture: {
      title: "ARP 6 system architecture",
      svg: "assets/arp6-system-architecture-flat.svg",
      viewBox: [1920, 1080],
      hotspots: [
        {
          target: "adau1787-left",
          label: "ADAU1787 (L) — view signal flow",
          group: "ADAU1787_L",           /* for reference; not used at runtime */
          x: 650, y: 400, w: 340, h: 196
        }

        /* ---------------------------------------------------------------
           A second hotspot looks exactly like the one above. Uncomment and
           point it at a node you have added below:

        ,{
          target: "adau1787-right",
          label: "ADAU1787 (R) — view signal flow",
          group: "ADAU1787_R",
          x: 650, y: 650, w: 340, h: 196
        }

           Boxes available in this drawing, from tools/svg_groups.py:

             Platform_boundary         560  240  1180  700
             VE_board                  592  300   438  606
             Raspberry_Pi_and_AI_HAT  1180  300   400  606
             Raspberry_Pi_5           1180  300   400  236
             AI_HAT                   1180  670   400  236
             Wifi_and_Smartphone      1604  300   296  246
             Smartphone               1770  300   130  246
             Earphones                  46  336   548  629
             Earphone_left              46  336   134  332
             Earphone_right            216  336   134  332
             Bus_I2C                   990  386   190  309
             Bus_I2S                   990  456   190  309
             Link_PCIe                1380  544   126  120
             ADAU1787_L                650  400   340  196
             ADAU1787_R                650  650   340  196
           --------------------------------------------------------------- */
      ]
    },

    "adau1787-left": {
      title: "ADAU1787 (L) — codec signal flow",
      svg: "assets/adau1787-left-codec-new.svg",
      viewBox: [1920, 1080],
      /* the white codec board: what the blue block opens into */
      frame: { x: 430, y: 260, w: 1150, h: 730 },
      hotspots: [
        /* This drawing can link onward in turn. Its named groups are:
             Codec_frame    430  260  1150  730
             Capture_lane, Playback_lane, Earpiece_in, Earpiece_out,
             Raspberry_Pi_top, Raspberry_Pi_bottom
           Run tools/svg_groups.py on it for exact boxes. */
      ]
    }

    /* -------------------------------------------------------------------
       A new detail page, as a template:

    ,"adau1787-right": {
      title: "ADAU1787 (R) — codec signal flow",
      svg: "assets/adau1787-right-codec.svg",
      viewBox: [1920, 1080],
      frame: { x: 430, y: 260, w: 1150, h: 730 },
      hotspots: []
    }

       Drawings do not need to share a shape. A portrait or oversized
       drawing works as long as its viewBox here matches the file, for
       example [1080, 1920] or [2800, 1740] -- the page fits each one and
       animates between differently shaped drawings correctly.
       ------------------------------------------------------------------- */
  }
};
