/* /public/hilos.js — «Hilos de seda»: mechones dorados que caen sobre la portada y se apartan al pasar el cursor o el dedo,
   como si los peinaras. Canvas 2D ligero: se pausa fuera de pantalla y respeta «reducir movimiento». */
(function () {
  "use strict";
  var cv = document.getElementById("hilos");
  if (!cv || !cv.getContext) return;
  var hero = cv.parentElement, ctx = cv.getContext("2d");
  var RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var W = 0, H = 0, DPR = 1, strands = [], P = { x: -9999, y: -9999, vx: 0, on: false, t: 0 }, visible = true, raf = 0, t0 = performance.now();
  var SEG = 14;

  function build() {
    var r = hero.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var n = Math.round(Math.max(60, Math.min(170, W / 7)));
    strands = [];
    for (var i = 0; i < n; i++) {
      var u = i / (n - 1);
      // más densidad a la derecha en escritorio (el texto está a la izquierda); repartido en móvil
      var x0 = W < 760 ? u * W : W * (0.28 + 0.78 * Math.pow(u, 0.85));
      var len = H * (0.42 + Math.random() * 0.38);
      var s = { x0: x0 + (Math.random() - 0.5) * 18, len: len, ph: Math.random() * Math.PI * 2, amp: 8 + Math.random() * 22, w: 0.6 + Math.random() * 1.1, a: 0.1 + Math.random() * 0.22, curl: (Math.random() - 0.5) * 0.9, pts: [] };
      for (var k = 0; k <= SEG; k++) s.pts.push({ x: s.x0, y: (k / SEG) * len - 20, vx: 0, vy: 0 });
      strands.push(s);
    }
  }

  function step(now) {
    var t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    // brisa automática: si nadie toca, un «peine» invisible cruza de vez en cuando
    var px = P.x, py = P.y, act = P.on && now - P.t < 1600;
    if (!act) {
      var c = (t % 9) / 9;
      if (c < 0.42) { px = -120 + (W + 240) * (c / 0.42); py = H * (0.28 + 0.12 * Math.sin(t)); act = true; }
    }
    var R = Math.max(90, Math.min(170, W * 0.14));
    for (var i = 0; i < strands.length; i++) {
      var s = strands[i], pts = s.pts;
      for (var k = 1; k <= SEG; k++) {
        var q = pts[k], f = k / SEG;
        var tx = s.x0 + Math.sin(t * 0.9 + s.ph + f * 2.2) * s.amp * f + s.curl * f * f * 60;
        var ty = f * s.len - 20 + Math.cos(t * 0.7 + s.ph) * 4 * f;
        if (act) {
          var dx = q.x - px, dy = q.y - py, d2 = dx * dx + dy * dy;
          if (d2 < R * R) { var d = Math.sqrt(d2) || 1, k2 = (1 - d / R); k2 = k2 * k2 * (R * 0.9); tx += (dx / d) * k2; ty += (dy / d) * k2 * 0.35; }
        }
        q.vx = (q.vx + (tx - q.x) * 0.06) * 0.86;
        q.vy = (q.vy + (ty - q.y) * 0.06) * 0.86;
        q.x += q.vx; q.y += q.vy;
      }
      var g = ctx.createLinearGradient(0, 0, 0, s.len);
      g.addColorStop(0, "rgba(240,214,166,0)");
      g.addColorStop(0.25, "rgba(240,214,166," + s.a + ")");
      g.addColorStop(0.8, "rgba(217,183,126," + s.a * 0.8 + ")");
      g.addColorStop(1, "rgba(232,180,170,0)");
      ctx.strokeStyle = g; ctx.lineWidth = s.w;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (var j = 1; j < SEG; j++) { var mx = (pts[j].x + pts[j + 1].x) / 2, my = (pts[j].y + pts[j + 1].y) / 2; ctx.quadraticCurveTo(pts[j].x, pts[j].y, mx, my); }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    if (!RM && visible && !document.hidden) raf = requestAnimationFrame(step); else raf = 0;
  }
  function go() { if (!raf && !RM) raf = requestAnimationFrame(step); }
  function mover(x, y) { var r = cv.getBoundingClientRect(); P.x = x - r.left; P.y = y - r.top; P.on = true; P.t = performance.now(); }
  hero.addEventListener("pointermove", function (e) { mover(e.clientX, e.clientY); }, { passive: true });
  hero.addEventListener("touchmove", function (e) { var t = e.touches[0]; if (t) mover(t.clientX, t.clientY); }, { passive: true });
  hero.addEventListener("touchstart", function (e) { var t = e.touches[0]; if (t) mover(t.clientX, t.clientY); }, { passive: true });
  hero.addEventListener("pointerleave", function () { P.on = false; });
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { build(); if (RM) step(performance.now()); }, 150); });
  if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) go(); }).observe(hero);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) go(); });
  build();
  if (RM) step(performance.now()); else go();
})();
