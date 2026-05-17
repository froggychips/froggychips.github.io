// Project dependency hover graph for froggychips.xyz
// On hover over a project card, draw git-style curves to its dependencies
// (transitively, both directions) and dim unrelated cards.
//
// Also renders a persistent trunk line through cards marked `.in-trunk`
// inside a `.projects-wrap[data-trunk]`, so the Froggy-ecosystem reads as
// a connected unit even before you hover.

(() => {
  // Reduced motion or touch — skip the whole thing.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (matchMedia('(hover: none)').matches) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const wraps = Array.from(document.querySelectorAll('.projects-wrap'));
  if (!wraps.length) return;

  // Build a per-wrap controller, since each list has its own SVG overlay.
  const controllers = wraps.map(makeController).filter(Boolean);

  // Re-render on layout changes
  let raf = 0;
  function scheduleRender() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => controllers.forEach(c => c.render()));
  }
  addEventListener('resize', scheduleRender);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleRender);
  }
  scheduleRender();

  // Debug/preview hooks — let a static page activate or re-render manually.
  window.__activateDeps = (key) => controllers.forEach(c => c.activate(key));
  window.__renderDeps   = () => controllers.forEach(c => c.render());

  function makeController(wrap) {
    const svg  = wrap.querySelector('.deps-overlay');
    const list = wrap.querySelector('.projects');
    if (!svg || !list) return null;
    const items = Array.from(list.querySelectorAll('li[data-key]'));
    if (!items.length) return null;

    // Undirected adjacency from data-deps.
    const adj = new Map();
    for (const li of items) {
      const k = li.dataset.key;
      if (!adj.has(k)) adj.set(k, new Set());
      const deps = (li.dataset.deps || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const d of deps) {
        adj.get(k).add(d);
        if (!adj.has(d)) adj.set(d, new Set());
        adj.get(d).add(k);
      }
    }

    function relatedSet(key, maxDepth = 3) {
      const visited = new Set([key]);
      let frontier = [key];
      for (let i = 0; i < maxDepth && frontier.length; i++) {
        const next = [];
        for (const n of frontier)
          for (const m of (adj.get(n) || []))
            if (!visited.has(m)) { visited.add(m); next.push(m); }
        frontier = next;
      }
      return visited;
    }

    // Edge list (undirected, deduped)
    const edges = [];
    const seen  = new Set();
    for (const [a, neigh] of adj)
      for (const b of neigh) {
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push([a, b]);
      }

    const byKey = new Map(items.map(li => [li.dataset.key, li]));

    function nodeCenter(li) {
      const dot = li.querySelector('.proj-node');
      if (!dot) return null;
      const wb = wrap.getBoundingClientRect();
      const db = dot.getBoundingClientRect();
      return {
        x: db.left - wb.left + db.width / 2,
        y: db.top  - wb.top  + db.height / 2,
      };
    }

    function sizeSvg() {
      const wb = wrap.getBoundingClientRect();
      svg.setAttribute('width',  wb.width);
      svg.setAttribute('height', wb.height);
      svg.setAttribute('viewBox', `0 0 ${wb.width} ${wb.height}`);
    }

    function pathFor(a, b) {
      // Git-graph style: out of the lower node, sweep left into a "branch
      // lane", vertical up, sweep right into the upper node.
      const upper = a.y < b.y ? a : b;
      const lower = a.y < b.y ? b : a;
      const laneX = Math.max(12, Math.min(a.x, b.x) - 14);
      const r = 8;
      return [
        `M ${lower.x} ${lower.y}`,
        `L ${lower.x} ${lower.y - r}`,
        `Q ${lower.x} ${lower.y - r * 2} ${lower.x - r} ${lower.y - r * 2}`,
        `L ${laneX + r} ${lower.y - r * 2}`,
        `Q ${laneX} ${lower.y - r * 2} ${laneX} ${lower.y - r * 3}`,
        `L ${laneX} ${upper.y + r}`,
        `Q ${laneX} ${upper.y} ${laneX + r} ${upper.y}`,
        `L ${upper.x} ${upper.y}`,
      ].join(' ');
    }

    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      sizeSvg();

      // Optional persistent trunk through .in-trunk nodes
      if (wrap.dataset.trunk === 'true') {
        const trunkLis = items.filter(li => li.classList.contains('in-trunk'));
        const pts = trunkLis.map(nodeCenter).filter(Boolean);
        if (pts.length >= 2) {
          const x = pts[0].x;
          const p = document.createElementNS(SVG_NS, 'path');
          p.setAttribute('d', `M ${x} ${pts[0].y} L ${x} ${pts[pts.length - 1].y}`);
          p.setAttribute('class', 'dep-trunk');
          svg.appendChild(p);
        }
      }

      // Dep edges
      for (const [a, b] of edges) {
        const liA = byKey.get(a); const liB = byKey.get(b);
        if (!liA || !liB) continue;
        const pa = nodeCenter(liA); const pb = nodeCenter(liB);
        if (!pa || !pb) continue;
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', pathFor(pa, pb));
        p.setAttribute('class', 'dep-edge');
        p.dataset.a = a; p.dataset.b = b;
        svg.appendChild(p);
      }
    }

    function activate(key) {
      if (!key || !byKey.has(key)) {
        list.classList.remove('graph-active');
        for (const li of items) li.classList.remove('is-active', 'is-related');
        for (const p of svg.querySelectorAll('.dep-edge'))
          p.classList.remove('active');
        return;
      }
      const related = relatedSet(key);
      list.classList.add('graph-active');
      for (const li of items) {
        const k = li.dataset.key;
        li.classList.toggle('is-active',  k === key);
        li.classList.toggle('is-related', related.has(k) && k !== key);
      }
      for (const p of svg.querySelectorAll('.dep-edge')) {
        const lit = related.has(p.dataset.a) && related.has(p.dataset.b);
        p.classList.toggle('active', lit);
      }
    }

    for (const li of items) {
      li.addEventListener('mouseenter', () => activate(li.dataset.key));
      li.addEventListener('focusin',   () => activate(li.dataset.key));
    }
    list.addEventListener('mouseleave', () => activate(null));
    list.addEventListener('focusout',   (e) => {
      if (!list.contains(e.relatedTarget)) activate(null);
    });

    return { render, activate };
  }
})();
