/* /public/panel.js — Panel del salón: socias (QR o código), sumar puntos al cobrar, premios, tarjetas regalo y pedidos.
   La clave se guarda solo en esta pestaña (sessionStorage) y viaja en la cabecera x-salon-clave. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var eur = function (n) { return (Math.round(n * 100) / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 }) + " €"; };
  var KEY = ""; try { KEY = sessionStorage.getItem("mv_salon") || ""; } catch (e) {}
  var tT; function toast(m) { var t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(tT); tT = setTimeout(function () { t.classList.remove("on"); }, 2800); }
  function api(path, body) {
    return fetch("/api/salon/" + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "x-salon-clave": KEY }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || "Error"); e.status = r.status; throw e; } return d; }); });
  }

  $("#flog").addEventListener("submit", function (e) {
    e.preventDefault(); KEY = $("#k").value.trim();
    api("resumen").then(function (d) { try { sessionStorage.setItem("mv_salon", KEY); } catch (x) {} draw(d); }).catch(function (x) { $("#kerr").textContent = x.message; });
  });
  if (KEY) api("resumen").then(draw).catch(function () { KEY = ""; });

  function draw(d) {
    $("#app").innerHTML =
      '<div class="ph"><h1><small>Salón Marta Vega</small>Panel del salón</h1><button class="btn sm" type="button" id="salir">Salir</button></div>' +
      '<div class="kpis"><div class="kpi"><b>' + d.socias + '</b><span>socias del club</span></div><div class="kpi"><b>' + d.puntos.toLocaleString("es-ES") + '</b><span>puntos repartidos</span></div><div class="kpi"><b>' + d.regalos + '</b><span>tarjetas regalo · ' + eur(d.regalosEur) + '</span></div><div class="kpi"><b>' + d.premiosPendientes + '</b><span>premios por canjear</span></div></div>' +
      '<section class="box"><h2>Cobrar a una clienta</h2><p class="note" style="margin:0 0 .8rem">Escanea su tarjeta de socia, su tarjeta regalo o escribe el código (socia, premio MV-… o regalo MVR-…).</p>' +
      '<form class="scan" id="fbus" novalidate><input class="inp" id="q" placeholder="Código o escanea el QR" autocapitalize="characters" autocomplete="off" aria-label="Código"><button class="btn gold" type="submit">Buscar</button><button class="btn" type="button" id="cam">📷 Escanear</button></form><video id="vid" playsinline muted></video><div class="res" id="res"></div></section>' +
      '<section class="box"><h2>Pedidos de la tienda</h2><div class="ord" id="ord"></div></section>';
    $("#salir").addEventListener("click", function () { try { sessionStorage.removeItem("mv_salon"); } catch (e) {} location.reload(); });
    $("#fbus").addEventListener("submit", function (e) { e.preventDefault(); buscar($("#q").value); });
    $("#cam").addEventListener("click", escanear);
    pedidos(d.pedidos);
  }

  function buscar(raw) {
    var q = String(raw || "").trim().toUpperCase(), m;
    if ((m = q.match(/MVR-[A-Z0-9]{6}/))) return regalo(m[0]);
    if (/^MV-[A-Z0-9]{5}$/.test(q)) return premio(q);
    q = q.replace(/^MV-SOCIA-/, "");
    if (/^[A-Z0-9]{6}$/.test(q)) return socia(q);
    toast("Código no reconocido");
  }
  function socia(c) {
    api("socia/" + c).then(function (d) {
      var s = d.socia;
      $("#res").innerHTML = '<div class="mb"><div class="t"><div><b>' + esc(s.nombre) + '</b><br><small style="color:var(--soft)">Socia ' + esc(s.codigo) + " · nivel " + esc(d.nivel.nombre) + (s.telefono ? " · " + esc(s.telefono) : "") + '</small></div><span>' + d.puntos + ' pts</span></div>' +
        '<form class="scan scan3" id="fcob" novalidate><input class="inp" id="ci" type="number" inputmode="decimal" min="1" step="0.01" placeholder="Importe €" aria-label="Importe cobrado"><input class="inp" id="cc" maxlength="60" placeholder="Servicio (p. ej. balayage)" aria-label="Concepto"><button class="btn gold" type="submit">Sumar puntos</button></form>' +
        (d.premios.length ? '<div><span class="lbl2">Premios pendientes</span><div class="ord" style="margin-top:.4rem">' + d.premios.map(function (p) { return '<div class="o"><span>' + esc(p.reward) + '<br><small>' + esc(p.code) + '</small></span><button class="btn sm" type="button" data-pr="' + esc(p.code) + '">Marcar usado</button></div>'; }).join("") + "</div></div>" : '<small style="color:var(--soft)">Sin premios pendientes.</small>') + "</div>";
      $("#fcob").addEventListener("submit", function (e) {
        e.preventDefault();
        api("cobro", { socia: c, importe: $("#ci").value, concepto: $("#cc").value }).then(function (r) { toast("+" + r.puntos + " puntos · total " + r.total); socia(c); resumen(); }).catch(function (x) { toast(x.message); });
      });
      [].forEach.call($("#res").querySelectorAll("[data-pr]"), function (b) { b.addEventListener("click", function () { api("premio", { codigo: b.dataset.pr }).then(function (r) { toast("Usado: " + r.premio); socia(c); resumen(); }).catch(function (x) { toast(x.message); }); }); });
    }).catch(function (x) { $("#res").innerHTML = '<p class="err">' + esc(x.message) + "</p>"; });
  }
  function premio(c) {
    $("#res").innerHTML = '<div class="mb"><div class="t"><div><b>Premio ' + esc(c) + '</b></div></div><button class="btn gold" type="button" id="usar">Marcar como usado</button></div>';
    $("#usar").addEventListener("click", function () { api("premio", { codigo: c }).then(function (r) { toast("Usado: " + r.premio); $("#res").innerHTML = ""; resumen(); }).catch(function (x) { toast(x.message); }); });
  }
  function regalo(c) {
    api("regalo/" + c).then(function (g) {
      $("#res").innerHTML = '<div class="mb"><div class="t"><div><b>Tarjeta regalo ' + esc(g.code) + '</b><br><small style="color:var(--soft)">Para ' + esc(g.to_name) + " · de " + eur(g.amount_c / 100) + '</small></div><span>' + eur(g.balance_c / 100) + '</span></div><form class="scan scan3" id="freg" novalidate><input class="inp" id="ri" type="number" inputmode="decimal" min="0.01" step="0.01" max="' + g.balance_c / 100 + '" placeholder="Importe a cobrar €" aria-label="Importe"><input class="inp" id="rc" maxlength="60" placeholder="Servicio" aria-label="Concepto"><button class="btn gold" type="submit">Descontar</button></form></div>';
      $("#freg").addEventListener("submit", function (e) { e.preventDefault(); api("regalo/" + c, { codigo: c, importe: $("#ri").value, concepto: $("#rc").value }).then(function (r) { toast("Descontado · saldo " + eur(r.saldo)); regalo(c); resumen(); }).catch(function (x) { toast(x.message); }); });
    }).catch(function (x) { $("#res").innerHTML = '<p class="err">' + esc(x.message) + "</p>"; });
  }
  function pedidos(list) {
    var el = $("#ord"); if (!el) return;
    el.innerHTML = list.length ? list.map(function (o) {
      return '<div class="o"><span><b>' + esc(o.code) + "</b> · " + esc(o.name) + " · " + esc(o.phone) + '<br><small>' + o.items.map(function (i) { return i.q + "× " + esc(i.n); }).join(", ") + " · " + eur(o.total_c / 100) + '</small></span><span style="display:grid;gap:.3rem;justify-items:end"><span class="stx' + (o.paid ? " pagado" : "") + '">' + (o.paid ? "pagado" : "pagar al recoger") + " · " + esc(o.status) + "</span>" +
        (o.status !== "entregado" ? '<span style="display:flex;gap:.3rem">' + (o.status === "reservado" ? '<button class="btn sm" type="button" data-ped="' + esc(o.code) + '" data-e="listo">Listo</button>' : "") + '<button class="btn sm gold" type="button" data-ped="' + esc(o.code) + '" data-e="entregado">Entregado</button></span>' : "") + "</span></div>";
    }).join("") : '<p class="note" style="margin:0">Todavía no hay pedidos.</p>';
    [].forEach.call(el.querySelectorAll("[data-ped]"), function (b) { b.addEventListener("click", function () { api("pedido", { codigo: b.dataset.ped, estado: b.dataset.e }).then(function (r) { toast(b.dataset.e === "entregado" ? "Entregado" + (r.puntos ? " · +" + r.puntos + " puntos a la socia" : "") : "Marcado como listo"); resumen(); }).catch(function (x) { toast(x.message); }); }); });
  }
  function resumen() { api("resumen").then(function (d) { var k = document.querySelectorAll(".kpi b"); if (k.length) { k[0].textContent = d.socias; k[1].textContent = d.puntos.toLocaleString("es-ES"); k[2].textContent = d.regalos; k[3].textContent = d.premiosPendientes; } pedidos(d.pedidos); }).catch(function () {}); }

  // Escáner de QR con la cámara (BarcodeDetector: Chrome y Android; en otros, se escribe el código)
  var stream = null;
  function escanear() {
    if (stream) return parar();
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices) { toast("Este navegador no lee QR: escribe el código."); $("#q").focus(); return; }
    var det = new window.BarcodeDetector({ formats: ["qr_code"] }), v = $("#vid");
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function (s) {
      stream = s; v.srcObject = s; v.style.display = "block"; v.play(); $("#cam").textContent = "Parar cámara";
      (function loop() {
        if (!stream) return;
        det.detect(v).then(function (r) { if (r && r[0]) { var t = r[0].rawValue; parar(); $("#q").value = t; buscar(t); } else requestAnimationFrame(loop); }).catch(function () { requestAnimationFrame(loop); });
      })();
    }).catch(function () { toast("Sin permiso para la cámara."); });
  }
  function parar() { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; var v = $("#vid"); if (v) v.style.display = "none"; var c = $("#cam"); if (c) c.textContent = "📷 Escanear"; }
})();
