/* /public/probador.js — Probador de color de pelo.
   · Foto de ejemplo: máscara del pelo ya calculada (img/modelo-mascara.png), funciona sin descargas extra.
   · Selfie o cámara: MediaPipe Image Segmenter (modelo «hair_segmenter») en el navegador; la imagen no sale del móvil.
   El tinte usa el modo de fusión «color» (conserva luces y sombras) y una capa de aclarado para los rubios. */
(function () {
  "use strict";
  var stage = document.getElementById("stage");
  if (!stage) return;
  var cv = document.getElementById("pcv"), ctx = cv.getContext("2d"), vid = document.getElementById("pvid");
  var TONES = [
    { n: "Natural", c: null },
    { n: "Miel", c: "#b07f4c", lift: 0.42 },
    { n: "Cobrizo", c: "#b9461c", lift: 0.12 },
    { n: "Chocolate", c: "#4b2b1d", dark: 0.25 },
    { n: "Caoba", c: "#7a1f2a", dark: 0.1 },
    { n: "Platino", c: "#f4e3c4", lift: 0.7 },
    { n: "Rosa", c: "#e79ab3", lift: 0.42 },
    { n: "Azul noche", c: "#1d2a4a", dark: 0.35 },
  ];
  var tone = TONES[1], intensity = 0.7, showBefore = false, mode = "sample", seg = null, loadingSeg = null, stream = null, raf = 0, lastVT = -1;
  var base = document.createElement("canvas"), bctx = base.getContext("2d");
  var mask = document.createElement("canvas"), mctx = mask.getContext("2d");
  var layer = document.createElement("canvas"), lctx = layer.getContext("2d");
  var $ = function (id) { return document.getElementById(id); };

  // botones de tono
  $("tones").innerHTML = TONES.map(function (t, i) {
    var bg = t.c ? "radial-gradient(circle at 35% 30%," + t.c + "cc," + t.c + " 60%,#0006)" : "conic-gradient(from 200deg,#6b4a35,#3b281d,#8a6447,#6b4a35)";
    return '<button class="tone" type="button" data-i="' + i + '" aria-pressed="' + (t === tone) + '"><i style="background:' + bg + '"></i>' + t.n + "</button>";
  }).join("");
  $("tones").addEventListener("click", function (e) {
    var b = e.target.closest("[data-i]"); if (!b) return;
    tone = TONES[+b.dataset.i];
    [].forEach.call($("tones").children, function (x) { x.setAttribute("aria-pressed", x === b); });
    $("ptone").textContent = "Tono: " + tone.n;
    if (mode !== "camera") render();
  });
  $("pint").addEventListener("input", function () { intensity = this.value / 100; if (mode !== "camera") render(); });
  var hold = $("phold");
  ["pointerdown", "keydown"].forEach(function (ev) { hold.addEventListener(ev, function (e) { if (e.type === "keydown" && e.key !== " " && e.key !== "Enter") return; showBefore = true; render(); }); });
  ["pointerup", "pointerleave", "pointercancel", "keyup", "blur"].forEach(function (ev) { hold.addEventListener(ev, function () { if (showBefore) { showBefore = false; render(); } }); });

  function size(w, h) {
    var s = Math.min(1, 900 / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
    [cv, base, layer].forEach(function (c) { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } });
    return [w, h];
  }
  // pasa una máscara en escala de grises (o confianza 0..1) al canal alfa
  function maskFromGray(src, w, h) {
    mask.width = w; mask.height = h; mctx.clearRect(0, 0, w, h); mctx.drawImage(src, 0, 0, w, h);
    var d = mctx.getImageData(0, 0, w, h), p = d.data;
    for (var i = 0; i < p.length; i += 4) { p[i + 3] = p[i]; p[i] = p[i + 1] = p[i + 2] = 255; }
    mctx.putImageData(d, 0, 0);
  }
  function maskFromFloat(arr, w, h) {
    if (mask.width !== w || mask.height !== h) { mask.width = w; mask.height = h; }
    var d = mctx.createImageData(w, h), p = d.data;
    for (var i = 0, j = 0; i < arr.length; i++, j += 4) { var a = arr[i]; a = a < 0.35 ? 0 : a > 0.75 ? 1 : (a - 0.35) / 0.4; p[j] = p[j + 1] = p[j + 2] = 255; p[j + 3] = a * 255; }
    mctx.putImageData(d, 0, 0);
  }
  function render() {
    var w = cv.width, h = cv.height; if (!w) return;
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h); ctx.drawImage(base, 0, 0);
    if (showBefore || !tone.c || !mask.width) return;
    // capa del color recortada por la máscara
    lctx.globalCompositeOperation = "source-over"; lctx.clearRect(0, 0, w, h);
    lctx.fillStyle = tone.c; lctx.fillRect(0, 0, w, h);
    lctx.globalCompositeOperation = "destination-in"; lctx.drawImage(mask, 0, 0, w, h);
    if (tone.lift) { ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = tone.lift * intensity; ctx.drawImage(layer, 0, 0); }
    if (tone.dark) { ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = tone.dark * intensity; ctx.drawImage(layer, 0, 0); }
    ctx.globalCompositeOperation = "color"; ctx.globalAlpha = Math.min(1, intensity * 1.05); ctx.drawImage(layer, 0, 0);
    ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = intensity * 0.35; ctx.drawImage(layer, 0, 0);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  }
  function busy(on, txt) { stage.classList.toggle("loading", on); if (txt) $("pld").textContent = txt; }

  /* ---- foto de ejemplo ---- */
  function loadImg(src) { return new Promise(function (ok, ko) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = ko; i.src = src; }); }
  function sample() {
    stopCam(); mode = "sample"; $("pmode").textContent = "Foto de ejemplo";
    busy(true, "Cargando la foto de ejemplo…");
    Promise.all([loadImg("img/modelo-m.webp"), loadImg("img/modelo-mascara.png")]).then(function (r) {
      var s = size(r[0].naturalWidth, r[0].naturalHeight);
      bctx.drawImage(r[0], 0, 0, s[0], s[1]); maskFromGray(r[1], s[0], s[1]);
      busy(false); render();
    }).catch(function () { busy(true, "No se ha podido cargar la foto."); });
  }

  /* ---- MediaPipe (se descarga solo al usar selfie o cámara) ---- */
  var MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  var MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite";
  function segmenter(running) {
    if (seg) return seg.setOptions({ runningMode: running }).then(function () { return seg; });
    if (loadingSeg) return loadingSeg.then(function () { return seg.setOptions({ runningMode: running }); }).then(function () { return seg; });
    busy(true, "Preparando el detector de pelo… (solo la primera vez)");
    loadingSeg = import(MP + "/vision_bundle.mjs").then(function (v) {
      return v.FilesetResolver.forVisionTasks(MP + "/wasm").then(function (fs) {
        var mk = function (d) { return v.ImageSegmenter.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: running, outputConfidenceMasks: true, outputCategoryMask: false }); };
        return mk("GPU").catch(function () { return mk("CPU"); });
      });
    }).then(function (s) { seg = s; return s; });
    return loadingSeg.catch(function (e) { loadingSeg = null; throw e; });
  }
  function hairMask(res) {
    var ms = res.confidenceMasks; if (!ms || !ms.length) return;
    var m = ms[ms.length - 1]; maskFromFloat(m.getAsFloat32Array(), m.width, m.height);
    ms.forEach(function (x) { x.close && x.close(); });
  }

  /* ---- selfie subido ---- */
  $("pfile").addEventListener("change", function () {
    var f = this.files && this.files[0]; this.value = ""; if (!f) return;
    if (!/^image\//.test(f.type) || f.size > 15e6) { alerta("Elige una foto (máx. 15 MB)."); return; }
    stopCam(); mode = "photo"; $("pmode").textContent = "Tu foto";
    var url = URL.createObjectURL(f);
    loadImg(url).then(function (img) {
      var s = size(img.naturalWidth, img.naturalHeight); bctx.drawImage(img, 0, 0, s[0], s[1]); URL.revokeObjectURL(url);
      render();
      return segmenter("IMAGE").then(function (sg) { busy(true, "Buscando tu pelo…"); hairMask(sg.segment(base)); busy(false); render(); });
    }).catch(function () { busy(false); alerta("No hemos podido analizar la foto. Prueba con otra con buena luz."); sample(); });
  });

  /* ---- cámara en directo ---- */
  $("pcam").addEventListener("click", function () {
    if (mode === "camera") { sample(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alerta("Tu navegador no permite usar la cámara. Prueba a subir un selfie."); return; }
    busy(true, "Pidiendo permiso para la cámara…");
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 900 } }, audio: false }).then(function (st) {
      stream = st; vid.srcObject = st; return vid.play();
    }).then(function () { return segmenter("VIDEO"); }).then(function (sg) {
      mode = "camera"; $("pmode").textContent = "Cámara en directo"; $("pcam").lastChild.textContent = "Volver a la foto de ejemplo"; busy(false);
      var loop = function () {
        if (mode !== "camera") return;
        if (vid.readyState >= 2 && vid.currentTime !== lastVT) {
          lastVT = vid.currentTime;
          var s = size(vid.videoWidth, vid.videoHeight);
          bctx.save(); bctx.translate(s[0], 0); bctx.scale(-1, 1); bctx.drawImage(vid, 0, 0, s[0], s[1]); bctx.restore();
          try { hairMask(sg.segmentForVideo(base, performance.now())); } catch (e) {}
          render();
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    }).catch(function (e) { stopCam(); busy(false); alerta(e && e.name === "NotAllowedError" ? "Sin permiso para la cámara. Puedes subir un selfie." : "No hemos podido iniciar la cámara. Prueba a subir un selfie."); sample(); });
  });
  function stopCam() {
    cancelAnimationFrame(raf); raf = 0;
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (mode === "camera") { $("pcam").lastChild.textContent = "Usar mi cámara"; }
  }
  function alerta(m) { var t = document.getElementById("toast"); if (!t) return; t.textContent = m; t.classList.add("on"); setTimeout(function () { t.classList.remove("on"); }, 3200); }
  // apaga la cámara al salir de la sección o de la pestaña
  if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { if (!es[0].isIntersecting && mode === "camera") sample(); }).observe(stage);
  document.addEventListener("visibilitychange", function () { if (document.hidden && mode === "camera") sample(); });
  $("pres").addEventListener("click", function () { try { sessionStorage.setItem("mv_tono", tone.n); } catch (e) {} });

  // carga perezosa de la foto de ejemplo cuando el probador se acerca a la pantalla
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); sample(); } }, { rootMargin: "400px" });
    io.observe(stage);
  } else sample();
  $("ptone").textContent = "Tono: " + tone.n;
})();
