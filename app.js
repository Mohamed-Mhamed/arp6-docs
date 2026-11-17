/* ===========================================================================
   ARP 6 documentation — navigation and transition engine
   ---------------------------------------------------------------------------
   Reads window.ARP_DOCS (see data.js) and turns it into a browsable set of
   illustrations where clicking a hotspot animates into the target drawing:
   the target starts scaled and positioned so its frame sits exactly on the
   hotspot that was clicked, then grows to full size, while the drawing left
   behind pushes in toward that same hotspot and dissolves.

   Design notes, in case you are the next person editing this:

   * Layout is computed in pixels on every navigation and every resize, rather
     than expressed as CSS percentages, because the drawings do not share a
     coordinate space -- one may be 1920x1080 and the next 1080x1920. Each
     drawing is fitted into the stage on its own terms, so the geometry of the
     morph has to be resolved against measured boxes.

   * Animation is same-document (Web Animations API), not a cross-document
     view transition. That keeps the whole site on one URL, which is what lets
     a single link be pasted into the wiki, and it behaves the same in every
     current browser.

   * Routing assigns location.hash rather than calling history.pushState,
     because pushState is rejected on file:// origins and this page must also
     work when opened straight from a disk or a network share.
   =========================================================================== */

(function () {
  "use strict";

  var DOCS = window.ARP_DOCS;
  if (!DOCS || !DOCS.nodes) {
    document.body.setAttribute("data-error", "1");
    return;
  }

  var DURATION = 620;                               /* ms */
  var EASE = "cubic-bezier(.22,.61,.24,1)";
  var ZOOM_MIN = 1.35, ZOOM_MAX = 2.2;              /* parent push-in limits */

  var stage = document.getElementById("stage");
  var crumbs = document.getElementById("crumbs");
  var backBtn = document.getElementById("back");
  var body = document.body;

  var layers = {};        /* node key -> { el, img, node, hotspots: [el] } */
  var trail = [];         /* node keys, root first: the breadcrumb path */
  var current = null;     /* node key on screen */
  var busy = false;
  var pending = null;     /* a hash change that arrived mid-animation */
  var steppedIn = false;  /* did this visit navigate here, or land on a deep link? */

  /* ---------------------------------------------------------------- helpers */

  function node(key) { return DOCS.nodes[key]; }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function duration() { return reducedMotion() ? 0 : DURATION; }

  /* The node whose hotspot points at `key`, or null for a root. Lets a visitor
     arriving on a deep link still get a full breadcrumb. */
  function parentOf(key) {
    var keys = Object.keys(DOCS.nodes);
    for (var i = 0; i < keys.length; i++) {
      var hs = DOCS.nodes[keys[i]].hotspots || [];
      for (var j = 0; j < hs.length; j++) {
        if (hs[j].target === key) return keys[i];
      }
    }
    return null;
  }

  function pathTo(key) {
    var out = [], guard = 0;
    while (key && guard++ < 32) { out.unshift(key); key = parentOf(key); }
    return out;
  }

  function hotspotTo(fromKey, toKey) {
    var hs = (node(fromKey) || {}).hotspots || [];
    for (var i = 0; i < hs.length; i++) if (hs[i].target === toKey) return hs[i];
    return null;
  }

  /* ----------------------------------------------------------------- layout */

  /* The drawing's rendered box inside the stage: contain-fit, centred. */
  function fit(key) {
    var n = node(key);
    var sw = stage.clientWidth, sh = stage.clientHeight;
    var vw = n.viewBox[0], vh = n.viewBox[1];
    var scale = Math.min(sw / vw, sh / vh);
    var w = vw * scale, h = vh * scale;
    return { left: (sw - w) / 2, top: (sh - h) / 2, width: w, height: h, scale: scale };
  }

  function applyFit(key) {
    var L = layers[key];
    if (!L) return;
    var f = fit(key);
    L.el.style.left = f.left + "px";
    L.el.style.top = f.top + "px";
    L.el.style.width = f.width + "px";
    L.el.style.height = f.height + "px";
    L.fitted = f;
  }

  /* A rectangle given in a drawing's own units, as pixels relative to stage. */
  function rectInStage(key, r) {
    var n = node(key), f = layers[key].fitted || fit(key);
    var sx = f.width / n.viewBox[0], sy = f.height / n.viewBox[1];
    return {
      left: f.left + r.x * sx,
      top: f.top + r.y * sy,
      width: r.w * sx,
      height: r.h * sy
    };
  }

  function frameOf(key) {
    var n = node(key);
    return n.frame || { x: 0, y: 0, w: n.viewBox[0], h: n.viewBox[1] };
  }

  /* ------------------------------------------------------------------ mount */

  function mount(key) {
    if (layers[key]) return layers[key];

    var n = node(key);
    var el = document.createElement("div");
    el.className = "layer";
    el.setAttribute("data-node", key);

    var img = document.createElement("img");
    img.src = n.svg;
    img.alt = n.alt || n.title;
    img.draggable = false;
    el.appendChild(img);

    var spots = [];
    (n.hotspots || []).forEach(function (h) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "hotspot";
      b.setAttribute("aria-label", h.label || ("Open " + (node(h.target) || {}).title));

      /* percentages of this drawing, so hotspots track the fit for free */
      b.style.left = (h.x / n.viewBox[0] * 100) + "%";
      b.style.top = (h.y / n.viewBox[1] * 100) + "%";
      b.style.width = (h.w / n.viewBox[0] * 100) + "%";
      b.style.height = (h.h / n.viewBox[1] * 100) + "%";
      if (h.radius != null) b.style.borderRadius = h.radius + "px";

      var tip = document.createElement("span");
      tip.className = "tip";
      tip.textContent = h.label || (node(h.target) || {}).title || "Open";
      b.appendChild(tip);

      b.addEventListener("click", function () { go(h.target); });
      el.appendChild(b);
      spots.push(b);
    });

    stage.appendChild(el);
    layers[key] = { el: el, img: img, hotspots: spots };
    applyFit(key);
    return layers[key];
  }

  /* Fetch the drawings one click away, so a transition never waits on a load. */
  function preload(key) {
    (node(key).hotspots || []).forEach(function (h) {
      var t = node(h.target);
      if (t && !layers[h.target]) { var i = new Image(); i.src = t.svg; }
    });
  }

  /* -------------------------------------------------------------- transition */

  /* Transform that places `childKey` so its frame covers `hotspot` of `fromKey`. */
  function nestedTransform(fromKey, hotspot, childKey) {
    var hs = rectInStage(fromKey, { x: hotspot.x, y: hotspot.y, w: hotspot.w, h: hotspot.h });
    var fr = rectInStage(childKey, frameOf(childKey));
    var f = layers[childKey].fitted;

    var s = hs.width / fr.width;

    /* transform-origin at the frame's centre, in the layer's own pixels */
    var ox = fr.left + fr.width / 2 - f.left;
    var oy = fr.top + fr.height / 2 - f.top;

    var dx = (hs.left + hs.width / 2) - (fr.left + fr.width / 2);
    var dy = (hs.top + hs.height / 2) - (fr.top + fr.height / 2);

    return {
      origin: ox + "px " + oy + "px",
      transform: "translate(" + dx + "px," + dy + "px) scale(" + s + ")",
      zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, 1 / s)),
      hotspotCentre: [hs.left + hs.width / 2 - (layers[fromKey].fitted.left),
                      hs.top + hs.height / 2 - (layers[fromKey].fitted.top)]
    };
  }

  function animate(el, frames, ms) {
    if (!el.animate) return Promise.resolve();
    return el.animate(frames, { duration: ms, easing: EASE }).finished
      .catch(function () { /* interrupted: the then() still cleans up */ });
  }

  var IDENTITY = "translate(0px,0px) scale(1)";

  function show(key) {
    var L = mount(key);
    L.el.hidden = false;
    L.el.style.transform = IDENTITY;
    L.el.style.opacity = "1";
    L.el.classList.add("is-current");
  }

  function hide(key) {
    var L = layers[key];
    if (!L) return;
    L.el.hidden = true;
    L.el.style.transform = "";
    L.el.style.opacity = "";
    L.el.classList.remove("is-current");
  }

  /* Forward: `from` --(hotspot)--> `to` */
  function transitionIn(fromKey, toKey) {
    var hotspot = hotspotTo(fromKey, toKey);
    mount(toKey);
    applyFit(fromKey); applyFit(toKey);

    if (!hotspot || duration() === 0) {        /* no geometry, or motion off */
      hide(fromKey); show(toKey);
      return Promise.resolve();
    }

    var g = nestedTransform(fromKey, hotspot, toKey);
    var from = layers[fromKey], to = layers[toKey];

    to.el.hidden = false;
    to.el.style.transformOrigin = g.origin;
    to.el.style.transform = g.transform;
    to.el.style.opacity = "0";
    to.el.classList.add("is-current");

    from.el.style.transformOrigin = g.hotspotCentre[0] + "px " + g.hotspotCentre[1] + "px";
    from.el.classList.remove("is-current");

    var ms = duration();

    return Promise.all([
      animate(from.el, [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(" + g.zoom + ")", opacity: 0 }
      ], ms),
      animate(to.el, [
        { transform: g.transform, opacity: 0 },
        { transform: g.transform, opacity: 1, offset: 0.28 },
        { transform: IDENTITY, opacity: 1 }
      ], ms)
    ]).then(function () {
      hide(fromKey);
      show(toKey);
    });
  }

  /* Backward: the reverse of the same animation */
  function transitionOut(fromKey, toKey) {
    var hotspot = hotspotTo(toKey, fromKey);
    mount(toKey);
    applyFit(fromKey); applyFit(toKey);

    if (!hotspot || duration() === 0) {
      hide(fromKey); show(toKey);
      return Promise.resolve();
    }

    var g = nestedTransform(toKey, hotspot, fromKey);
    var from = layers[fromKey], to = layers[toKey];

    to.el.hidden = false;
    to.el.style.transformOrigin = g.hotspotCentre[0] + "px " + g.hotspotCentre[1] + "px";
    to.el.style.opacity = "0";

    from.el.style.transformOrigin = g.origin;
    from.el.classList.remove("is-current");

    var ms = duration();

    return Promise.all([
      animate(from.el, [
        { transform: IDENTITY, opacity: 1 },
        { transform: g.transform, opacity: 1, offset: 0.72 },
        { transform: g.transform, opacity: 0 }
      ], ms),
      animate(to.el, [
        { transform: "scale(" + g.zoom + ")", opacity: 0 },
        { transform: "scale(1)", opacity: 1 }
      ], ms)
    ]).then(function () {
      hide(fromKey);
      show(toKey);
    });
  }

  /* ------------------------------------------------------------- breadcrumb */

  function renderCrumbs() {
    crumbs.textContent = "";

    trail.forEach(function (key, i) {
      var last = (i === trail.length - 1);

      if (i > 0) {
        var sep = document.createElement("span");
        sep.className = "sep";
        sep.textContent = "/";
        crumbs.appendChild(sep);
      }

      if (last) {
        var here = document.createElement("span");
        here.className = "here";
        here.textContent = node(key).title;
        here.setAttribute("aria-current", "page");
        crumbs.appendChild(here);
      } else {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = node(key).title;
        b.addEventListener("click", function () { go(key); });
        crumbs.appendChild(b);
      }
    });

    body.dataset.depth = String(trail.length - 1);
    backBtn.hidden = trail.length < 2;
    if (trail.length > 1) {
      backBtn.querySelector(".back-label").textContent =
        "Back to " + node(trail[trail.length - 2]).title;
    }
  }

  /* ---------------------------------------------------------------- routing */

  function keyFromHash() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    return (h && DOCS.nodes[h]) ? h : DOCS.start;
  }

  function go(key) {
    if (!DOCS.nodes[key] || key === current) return;
    var target = (key === DOCS.start) ? "" : "#" + key;
    if ((location.hash || "") === target) render(key);
    else {
      steppedIn = true;               /* there is now a history entry to pop */
      location.hash = target;         /* fires hashchange -> render() */
    }
  }

  function render(key) {
    if (busy) { pending = key; return; }
    if (key === current) return;

    var from = current;
    busy = true;

    var forward = from && hotspotTo(from, key);
    var backward = from && hotspotTo(key, from);

    var done;
    if (!from) { show(key); done = Promise.resolve(); }
    else if (forward) done = transitionIn(from, key);
    else if (backward) done = transitionOut(from, key);
    else {                                  /* a jump across the tree */
      hide(from); show(key); done = Promise.resolve();
    }

    current = key;
    trail = pathTo(key);
    renderCrumbs();
    preload(key);

    done.then(function () {
      busy = false;
      /* keep only the current drawing live, so hotspots cannot be hit through
         a hidden layer and the browser is not compositing idle artwork */
      Object.keys(layers).forEach(function (k) { if (k !== current) hide(k); });

      var next = pending; pending = null;
      if (next && next !== current) render(next);
      else focusCurrent();
    });
  }

  function focusCurrent() {
    if (trail.length > 1 && !backBtn.hidden) backBtn.focus({ preventScroll: true });
  }

  function back() {
    if (trail.length < 2) return;
    /* Pop a real history entry when the visitor clicked their way here, so the
       forward button works too. Someone who opened a deep link has no entry to
       pop -- going back would leave the site -- so move up the trail instead. */
    if (steppedIn) window.history.back();
    else go(trail[trail.length - 2]);
  }

  backBtn.addEventListener("click", back);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") back();
  });

  window.addEventListener("hashchange", function () { render(keyFromHash()); });

  /* ------------------------------------------------------------------ resize */

  function relayout() {
    Object.keys(layers).forEach(applyFit);
    if (current && layers[current]) {
      layers[current].el.style.transform = IDENTITY;
    }
  }

  if (window.ResizeObserver) new ResizeObserver(relayout).observe(stage);
  else window.addEventListener("resize", relayout);

  /* -------------------------------------------------------------------- boot */

  render(keyFromHash());
  body.dataset.ready = "1";
})();
