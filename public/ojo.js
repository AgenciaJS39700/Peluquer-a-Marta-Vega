/* /public/ojo.js — Botón "ojo" para ver u ocultar la contraseña en TODOS los campos type=password,
   también en los que se pintan después (formularios dentro de paneles). Reutilizable en cualquier web. */
(function () {
  "use strict";
  var ABIERTO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var CERRADO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  function mejorar(inp) {
    if (inp.dataset.ojo) return;
    inp.dataset.ojo = "1";
    var caja = document.createElement("span");
    caja.className = "pw-caja";
    inp.parentNode.insertBefore(caja, inp);
    caja.appendChild(inp);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "pw-ojo";
    b.setAttribute("aria-label", "Mostrar contraseña");
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = ABIERTO;
    b.addEventListener("click", function () {
      var ver = inp.type === "password";
      inp.type = ver ? "text" : "password";
      b.innerHTML = ver ? CERRADO : ABIERTO;
      b.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
      b.setAttribute("aria-pressed", String(ver));
      inp.focus();
    });
    caja.appendChild(b);
  }
  function revisar(raiz) { [].forEach.call((raiz || document).querySelectorAll('input[type="password"]'), mejorar); }

  revisar();
  new MutationObserver(function (ms) {
    for (var i = 0; i < ms.length; i++) if (ms[i].addedNodes.length) { revisar(); return; }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
