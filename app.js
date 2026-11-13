(() => {
  const TOTAL_FRAMES = 553;
  const VID_W = 864, VID_H = 496;
  const path = (i) => `frames/f${String(i + 1).padStart(4, '0')}.webp`;

  // Scroll timeline. vh = scroll length; a/b = frame range (0-based) played across that length.
  const SEGS = [
    { id: 'hold0', vh: 70,  a: 0,   b: 0 },
    { id: 'v1',    vh: 180, a: 0,   b: 120 },
    { id: 'v2',    vh: 180, a: 121, b: 240 },
    { id: 'v3',    vh: 180, a: 241, b: 360 },
    { id: 'vis',   vh: 300, a: 360, b: 360 },
    { id: 'v4',    vh: 170, a: 361, b: 456 },
    { id: 'v5',    vh: 170, a: 457, b: 552 },
    { id: 'tail',  vh: 40,  a: 552, b: 552 },
  ];
  const RAIL_OF = { hold0: 0, v1: 0, v2: 1, v3: 2, vis: 2, v4: 3, v5: 4, tail: 4 };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scroller = $('#scroller'), view = $('#view'), cv = $('#cv'), ctx = cv.getContext('2d');
  const vis = $('#vis'), notes = $('#notes'), glow = $('#glow');
  const acts = $$('.act'), noteItems = $$('#notes li'), drawn = $$('.vis .d'), pts = $$('.vis .pt');
  const rail = $$('[data-rail]');

  const imgs = new Array(TOTAL_FRAMES);
  let W = innerWidth, H = innerHeight, portrait = false;
  let starts = [], totalPx = 0;
  let target = 0, cur = 0, drawnIdx = -1, ready = false, raf = 0;

  /* ---------- preload ---------- */
  function preload() {
    const num = $('#loadNum'), bar = $('#loadBar');
    let n = 0;
    return new Promise((resolve) => {
      const tick = () => {
        n++;
        const p = Math.round((n / TOTAL_FRAMES) * 100);
        num.textContent = p;
        bar.style.width = p + '%';
        if (n === TOTAL_FRAMES) resolve();
      };
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        const im = new Image();
        im.decoding = 'async';
        im.onload = im.onerror = tick;
        im.src = path(i);
        imgs[i] = im;
      }
    });
  }

  /* ---------- layout ---------- */
  function layout() {
    W = innerWidth; H = innerHeight;
    portrait = W / H < 0.9;
    document.documentElement.classList.toggle('portrait', portrait);

    let scale, cx, cy;
    if (portrait) {
      scale = W / (VID_W * 0.58);          // crop to the central 58% of the frame
      cx = W / 2; cy = H * 0.36;
    } else {
      scale = Math.max(W / VID_W, H / VID_H);
      cx = W / 2; cy = H / 2;
    }
    const vw = VID_W * scale, vh = VID_H * scale;
    view.style.width = vw + 'px';
    view.style.height = vh + 'px';
    view.style.left = cx + 'px';
    view.style.top = cy + 'px';

    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.min(Math.round(vw * dpr), VID_W * 2);
    cv.height = Math.round(cv.width * VID_H / VID_W);
    drawnIdx = -1;

    let y = 0;
    starts = SEGS.map((s) => { const st = y; y += (s.vh / 100) * H; return st; });
    totalPx = y;
    scroller.style.height = totalPx + H + 'px';
    onScroll();
  }

  /* ---------- helpers ---------- */
  function segAt(y) {
    let i = SEGS.length - 1;
    for (let k = 0; k < SEGS.length; k++) {
      const end = starts[k] + (SEGS[k].vh / 100) * H;
      if (y < end) { i = k; break; }
    }
    return i;
  }
  const segLen = (i) => (SEGS[i].vh / 100) * H;
  const segProgress = (id, y) => {
    const i = SEGS.findIndex((s) => s.id === id);
    return (y - starts[i]) / segLen(i);
  };

  function frameAt(y) {
    const i = segAt(y);
    const s = SEGS[i];
    const p = clamp((y - starts[i]) / segLen(i));
    return Math.round(s.a + (s.b - s.a) * p);
  }

  function drawFrame(idx) {
    if (idx === drawnIdx) return;
    const im = imgs[idx];
    if (!im || !im.complete || !im.naturalWidth) return;
    ctx.drawImage(im, 0, 0, cv.width, cv.height);
    drawnIdx = idx;
  }

  /* ---------- per-scroll UI ---------- */
  function updateUI(y) {
    const si = segAt(y);
    rail.forEach((r, k) => r.classList.toggle('on', k === RAIL_OF[SEGS[si].id]));

    acts.forEach((a) => {
      const p = segProgress(a.dataset.seg, y);
      a.classList.toggle('on', p >= +a.dataset.in && p <= +a.dataset.out);
    });

    // visagism overlay
    const vp = segProgress('vis', y);
    const inVis = vp >= 0 && vp <= 1;
    vis.style.opacity = inVis ? 1 : 0;
    notes.classList.toggle('on', inVis);
    const t = clamp(vp);
    drawn.forEach((d) => {
      const [a, b] = d.dataset.t.split(',').map(Number);
      d.style.strokeDashoffset = 1 - clamp((t - a) / (b - a));
    });
    pts.forEach((g) => g.classList.toggle('on', t >= +g.dataset.at));
    let last = -1;
    noteItems.forEach((li, k) => {
      const on = t >= +li.dataset.at;
      li.classList.toggle('on', on);
      if (on) last = k;
    });
    noteItems.forEach((li, k) => li.classList.toggle('cur', k === last));

    glow.style.opacity = 0.6 + 0.4 * Math.sin(y / H * 0.9);
  }

  /* ---------- loop ---------- */
  function onScroll() {
    target = clamp(scrollY - scroller.offsetTop, 0, totalPx);
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function loop() {
    raf = 0;
    if (!ready) return;
    cur += (target - cur) * (reduce ? 1 : 0.14);
    if (Math.abs(target - cur) < 0.4) cur = target;
    drawFrame(frameAt(cur));
    updateUI(cur);
    if (cur !== target) raf = requestAnimationFrame(loop);
  }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', layout);

  preload().then(() => {
    ready = true;
    layout();
    cur = target;
    drawFrame(frameAt(cur));
    updateUI(cur);
    requestAnimationFrame(() => $('#loader').classList.add('done'));
  });
})();
