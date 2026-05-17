// Project dependency hover graph for froggychips.xyz
// On hover over a project card, draw git-style curves to its dependencies
// (transitively, both directions) and dim unrelated cards.

(() => {
  const wrap = document.querySelector('.projects-wrap');
  const svg  = document.querySelector('.deps-overlay');
  const list = document.querySelector('.projects');
  if (!wrap || !svg || !list) return;

  // Reduced motion: skip the hover effect entirely.
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  // Touch devices have no hover; bail out gracefully.
  if (matchMedia('(hover: none)').matches) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Build undirected adjacency from data-deps on each <li>.
  const items = Array.from(list.querySelectorAll('li[data-key]'));
  const adj = new Map();
  for (const li of items) {
    const k = li.dataset.key;
    adj.set(k, new Set(adj.get(k) || []));
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
      for (const n of frontier) {
        for (const m of (adj.get(n) || [])) {
          if (!visited.has(m)) { visited.add(m); next.push(m); }
        }
      }
      frontier = next;
    }
    return visited;
  }

  // Edge list as undirected, deduped
  const edges = [];
  const seen  = new Set();
  for (const [a, neigh] of adj) {
    for (const b of neigh) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }

  function nodeCenter(li) {
    const dot = li.querySelector('.proj-node');
    if (!dot) return null;
    const wb  = wrap.getBoundingClientRect();
    const db  = dot.getBoundingClientRect();
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
    // Git-graph style: vertical out of the lower node, sweep left into a "branch
    // lane", vertical up, then sweep right back into the higher node.
    // Always goes through x = laneX, which sits a bit left of the dots column.
    const upper = a.y < b.y ? a : b;
    const lower = a.y < b.y ? b : a;
    const laneX = Math.max(12, Math.min(a.x, b.x) - 18);
    const r = 10;  // corner radius
    // SVG path: M start, V down to (lower.y - r) on dot column, Q to laneX, V up
    // to (upper.y + r) on laneX, Q to upper.x. Two arcs simulate git rounded
    // corners.
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

  // We pre-render all edges once and toggle their .active class on hover, so
  // there's no per-hover DOM work and we get free CSS transitions.
  function renderEdges() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    sizeSvg();
    const byKey = new Map(items.map(li => [li.dataset.key, li]));
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
    if (!key) {
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

  // Re-render on layout changes
  let raf = 0;
  function scheduleRender() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(renderEdges);
  }
  addEventListener('resize', scheduleRender);
  // Fonts can reflow the list after first paint
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleRender);
  }
  // Initial render
  scheduleRender();

  // Hover wiring
  for (const li of items) {
    li.addEventListener('mouseenter', () => activate(li.dataset.key));
    li.addEventListener('focusin',   () => activate(li.dataset.key));
  }
  list.addEventListener('mouseleave', () => activate(null));
  list.addEventListener('focusout',   (e) => {
    // Only clear when focus actually leaves the list
    if (!list.contains(e.relatedTarget)) activate(null);
  });

  // Debug/preview hook — lets a static preview page activate a node without
  // a real pointer. Safe to leave in production (just a global no-op there).
  window.__activateDeps = activate;
  window.__renderDeps = renderEdges;
})();
