/* ===========================================================================
   ARP 6 documentation — navigation and transition engine
   ---------------------------------------------------------------------------
   Reads window.ARP_DOCS (see data.js) and turns it into a browsable set of
   illustrations where clicking a hotspot animates into the target drawing: the
   target starts scaled and positioned so its frame sits exactly on the hotspot
   that was clicked, then grows to full size, while the drawing left behind
   pushes in toward that same hotspot and dissolves.

   Beyond plain navigation it handles two things a set of drawings needs:

     * zoom in place -- a hotspot can magnify its own rectangle instead of
       opening another drawing, for detail that has no illustration yet
     * sections -- a tall drawing is read one region at a time, by button,
       scroll wheel or arrow key

   Design notes, in case you are the next person editing this:

   * Layout is computed in pixels on every navigation and every resize, rather
     than in CSS percentages, because the drawings do not share a coordinate
     space -- one is 1920x1080, the next 1438x779, another portrait 1080x1920.

   * Animation is same-document (Web Animations API), not a cross-document view
     transition. That keeps the whole site on one URL, which is what lets a
     single link be pasted into the wiki, and it behaves the same in every
     current browser.

   * Routing assigns location.hash rather than calling history.pushState,
     because pushState is rejected on file:// origins and this page must also
     work opened straight from a disk or a network share.
   =========================================================================== */

(function () {
  "use strict";

  var DOCS = window.ARP_DOCS;
  if (!DOCS || !DOCS.nodes) {
    document.body.setAttribute("data-error", "1");
    return;
  }

  var DURATION = 620;                     /* navigation, ms */
  var ZOOM_MS = 520;                      /* zoom in place, ms */
  var EASE = "cubic-bezier(.22,.61,.24,1)";
  var ZOOM_MIN = 1.35, ZOOM_MAX = 2.2;    /* how hard the parent pushes in */
  var ZOOM_PAD = 0.94;                    /* breathing room around a zoom */
  var IDENTITY = "translate(0px,0px) scale(1)";

  var stage = document.getElementById("stage");
  var crumbs = document.getElementById("crumbs");
  var backBtn = document.getElementById("back");
  var backFab = document.getElementById("back-fab");
  var bar = document.getElementById("sectionbar");
  var barLabel = document.getElementById("section-label");
  var barPrev = document.getElementById("section-prev");
  var barNext = document.getElementById("section-next");
  var barZoom = document.getElementById("section-zoom");
  var body = document.body;

  var layers = {};        /* node key -> { el, img, hotspots, fitted } */
  var trail = [];         /* node keys, root first */
  var current = null;
  var busy = false;
  var pending = null;
  var steppedIn = false;
  var zoomRect = null;    /* rectangle currently magnified, in node units */
  var section = -1;       /* index into node.sections, -1 = whole drawing */

  /* ---------------------------------------------------------------- helpers */

  function node(key) { return DOCS.nodes[key]; }

  function reduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function duration() { return reduced() ? 0 : DURATION; }

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

  function animate(el, frames, ms) {
    if (!el.animate) return Promise.resolve();
    return el.animate(frames, { duration: ms, easing: EASE }).finished
      .catch(function () { });
  }

  /* ----------------------------------------------------------------- layout */

  function fit(key) {
    var n = node(key);
    var sw = stage.clientWidth, sh = stage.clientHeight;
    var scale = Math.min(sw / n.viewBox[0], sh / n.viewBox[1]);
    var w = n.viewBox[0] * scale, h = n.viewBox[1] * scale;
    return { left: (sw - w) / 2, top: (sh - h) / 2, width: w, height: h };
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

  function rectInStage(key, r) {
    var n = node(key), f = layers[key].fitted || fit(key);
    var sx = f.width / n.viewBox[0], sy = f.height / n.viewBox[1];
    return {
      left: f.left + r.x * sx, top: f.top + r.y * sy,
      width: r.w * sx, height: r.h * sy
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
      b.className = "hotspot" + (h.style === "button" ? " is-button" : "");
      b.setAttribute("aria-label", h.label ||
        ("Open " + ((node(h.target) || {}).title || "detail")));

      b.style.left = (h.x / n.viewBox[0] * 100) + "%";
      b.style.top = (h.y / n.viewBox[1] * 100) + "%";
      b.style.width = (h.w / n.viewBox[0] * 100) + "%";
      b.style.height = (h.h / n.viewBox[1] * 100) + "%";

      if (h.style === "button") {
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M5 9l7 7 7-7"/></svg>';
      }

      var tip = document.createElement("span");
      tip.className = "tip";
      tip.textContent = h.label || (node(h.target) || {}).title || "Open";
      b.appendChild(tip);

      b.addEventListener("click", function (e) {
        e.stopPropagation();
        if (h.target) go(h.target);
        else if (h.action === "zoom") zoomTo(h, true);
      });

      el.appendChild(b);
      spots.push(b);
    });

    stage.appendChild(el);
    layers[key] = { el: el, img: img, hotspots: spots };
    applyFit(key);
    return layers[key];
  }

  function preload(key) {
    (node(key).hotspots || []).forEach(function (h) {
      var t = h.target && node(h.target);
      if (t && !layers[h.target]) { var i = new Image(); i.src = t.svg; }
    });
  }

  /* ------------------------------------------------------- zoom within a node */

  function zoomTo(rect, animated) {
    var L = layers[current];
    if (!L) return;
    var n = node(current), f = L.fitted || fit(current);
    var sw = stage.clientWidth, sh = stage.clientHeight;
    var sx = f.width / n.viewBox[0], sy = f.height / n.viewBox[1];

    var rx = rect.x * sx, ry = rect.y * sy;
    var rw = rect.w * sx, rh = rect.h * sy;
    var k = Math.min(sw / rw, sh / rh) * ZOOM_PAD;

    var tx = sw / 2 - f.left - k * (rx + rw / 2);
    var ty = sh / 2 - f.top - k * (ry + rh / 2);
    var t = "translate(" + tx + "px," + ty + "px) scale(" + k + ")";

    var from = L.el.style.transform || IDENTITY;
    L.el.style.transformOrigin = "0 0";
    if (animated && !reduced()) {
      animate(L.el, [{ transform: from }, { transform: t }], ZOOM_MS);
    }
    L.el.style.transform = t;
    zoomRect = rect;
    body.dataset.zoomed = "1";
  }

  function zoomReset(animated) {
    var L = layers[current];
    zoomRect = null;
    section = -1;
    delete body.dataset.zoomed;
    if (!L) return;
    var from = L.el.style.transform || IDENTITY;
    L.el.style.transformOrigin = "0 0";
    if (animated && !reduced()) {
      animate(L.el, [{ transform: from }, { transform: IDENTITY }], ZOOM_MS);
    }
    L.el.style.transform = IDENTITY;
    renderSectionBar();
  }

  /* -------------------------------------------------------------- sections */

  function sections() { return (node(current) || {}).sections || null; }

  function goSection(i) {
    var s = sections();
    if (!s) return;
    i = Math.max(0, Math.min(s.length - 1, i));
    section = i;
    zoomTo(s[i], true);
    renderSectionBar();
  }

  function renderSectionBar() {
    var s = sections();
    bar.hidden = !s;
    if (!s) return;

    if (section < 0) {
      barLabel.textContent = "Whole diagram · " + s.length + " sections";
      barZoom.textContent = "Zoom in";
      barPrev.disabled = true;
      barNext.disabled = false;
    } else {
      barLabel.textContent = (section + 1) + " / " + s.length + " · " +
        s[section].title;
      barZoom.textContent = "Zoom out";
      barPrev.disabled = (section === 0);
      barNext.disabled = (section === s.length - 1);
    }
  }

  barZoom.addEventListener("click", function () {
    if (section < 0) goSection(0); else zoomReset(true);
  });
  barPrev.addEventListener("click", function () { goSection(section - 1); });
  barNext.addEventListener("click", function () {
    if (section < 0) goSection(0); else goSection(section + 1);
  });

  /* wheel steps through the sections once the reader has zoomed in */
  var wheelLock = 0;
  stage.addEventListener("wheel", function (e) {
    var s = sections();
    if (!s || section < 0) return;
    e.preventDefault();
    var now = Date.now();
    if (now < wheelLock) return;
    wheelLock = now + 420;
    goSection(section + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });

  /* clicking the backdrop leaves a zoom that is not a section */
  stage.addEventListener("click", function () {
    if (zoomRect && section < 0) zoomReset(true);
  });

  /* ------------------------------------------------------------ transitions */

  function nestedTransform(fromKey, hotspot, childKey) {
    var hs = rectInStage(fromKey, hotspot);
    var fr = rectInStage(childKey, frameOf(childKey));
    var f = layers[childKey].fitted;

    var s = hs.width / fr.width;
    var ox = fr.left + fr.width / 2 - f.left;
    var oy = fr.top + fr.height / 2 - f.top;
    var dx = (hs.left + hs.width / 2) - (fr.left + fr.width / 2);
    var dy = (hs.top + hs.height / 2) - (fr.top + fr.height / 2);

    return {
      origin: ox + "px " + oy + "px",
      transform: "translate(" + dx + "px," + dy + "px) scale(" + s + ")",
      zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, 1 / s)),
      hotspotCentre: [hs.left + hs.width / 2 - layers[fromKey].fitted.left,
                      hs.top + hs.height / 2 - layers[fromKey].fitted.top]
    };
  }

  function show(key) {
    var L = mount(key);
    L.el.hidden = false;
    L.el.style.transformOrigin = "0 0";
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

  function transitionIn(fromKey, toKey) {
    var hotspot = hotspotTo(fromKey, toKey);
    mount(toKey);
    applyFit(fromKey); applyFit(toKey);

    if (!hotspot || duration() === 0) {
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

    from.el.style.transformOrigin = g.hotspotCentre[0] + "px " +
      g.hotspotCentre[1] + "px";
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
    ]).then(function () { hide(fromKey); show(toKey); });
  }

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
    to.el.style.transformOrigin = g.hotspotCentre[0] + "px " +
      g.hotspotCentre[1] + "px";
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
    ]).then(function () { hide(fromKey); show(toKey); });
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
    var deep = trail.length > 1;
    if (backBtn) backBtn.hidden = !deep;
    backFab.hidden = !deep;
    if (deep) {
      var up = node(trail[trail.length - 2]).title;
      if (backBtn) backBtn.querySelector(".back-label").textContent = "Back to " + up;
      backFab.setAttribute("aria-label", "Back to " + up);
      backFab.querySelector(".fab-label").textContent = "Back to " + up;
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
      steppedIn = true;
      location.hash = target;
    }
  }

  function render(key) {
    if (busy) { pending = key; return; }
    if (key === current) return;

    if (zoomRect) zoomReset(false);      /* never navigate from a zoomed view */

    var from = current;
    busy = true;

    var forward = from && hotspotTo(from, key);
    var backward = from && hotspotTo(key, from);

    var done;
    if (!from) { show(key); done = Promise.resolve(); }
    else if (forward) done = transitionIn(from, key);
    else if (backward) done = transitionOut(from, key);
    else { hide(from); show(key); done = Promise.resolve(); }

    current = key;
    trail = pathTo(key);
    section = -1;
    renderCrumbs();
    renderSectionBar();
    preload(key);

    done.then(function () {
      busy = false;
      Object.keys(layers).forEach(function (k) { if (k !== current) hide(k); });
      var next = pending; pending = null;
      if (next && next !== current) render(next);
    });
  }

  function back() {
    if (zoomRect) { zoomReset(true); return; }
    if (trail.length < 2) return;
    if (steppedIn) window.history.back();
    else go(trail[trail.length - 2]);
  }

  if (backBtn) backBtn.addEventListener("click", back);
  backFab.addEventListener("click", back);

  document.addEventListener("keydown", function (e) {
    var s = sections();
    if (e.key === "Escape") { back(); return; }
    if (!s) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      goSection(section < 0 ? 0 : section + 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      if (section > 0) goSection(section - 1);
      else if (section === 0) zoomReset(true);
    }
  });

  window.addEventListener("hashchange", function () { render(keyFromHash()); });

  /* ------------------------------------------------------------------ resize */

  function relayout() {
    Object.keys(layers).forEach(applyFit);
    if (!current || !layers[current]) return;
    if (zoomRect) zoomTo(zoomRect, false);
    else layers[current].el.style.transform = IDENTITY;
  }

  if (window.ResizeObserver) new ResizeObserver(relayout).observe(stage);
  else window.addEventListener("resize", relayout);

  /* -------------------------------------------------------------------- boot */

  render(keyFromHash());
  body.dataset.ready = "1";
})();
