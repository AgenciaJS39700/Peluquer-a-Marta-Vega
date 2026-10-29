/* /public/app.js — Salón Marta Vega: catálogo, club de clientas (cuenta y puntos), tarjeta regalo, tienda, campaña y PWA. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var eur = function (n) { return (Math.round(n * 100) / 100).toLocaleString("es-ES", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " €"; };
  var ls = { get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  var RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var CAT = null, YO = null, cart = ls.get("mv_cesta", {});

  /* ---------- utilidades de interfaz ---------- */
  var tT;
  function toast(m) { var t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(tT); tT = setTimeout(function () { t.classList.remove("on"); }, 2800); }
  function api(path, body) {
    return fetch("/api/" + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" } : { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || "No se ha podido completar. Inténtalo de nuevo."); e.status = r.status; throw e; } return d; }); });
  }
  var last = null;
  function openDr(id) {
    var d = $("#dr-" + id); if (!d) return;
    $$(".dr.on").forEach(function (x) { if (x !== d) closeDr(x, true); });
    last = document.activeElement;
    d.classList.add("on"); d.setAttribute("aria-hidden", "false"); $("#ov").classList.add("on");
    document.documentElement.style.overflow = "hidden";
    var bd = d.querySelector(".dr-b"); if (bd) bd.scrollTop = 0;
    setTimeout(function () { var f = d.querySelector(".dr-b input") || d.querySelector(".x"); f.focus({ preventScroll: true }); if (bd) bd.scrollTop = 0; }, 60);
  }
  function closeDr(d, keep) {
    d = d || $(".dr.on"); if (!d) return;
    d.classList.remove("on"); d.setAttribute("aria-hidden", "true");
    if (!keep) { $("#ov").classList.remove("on"); document.documentElement.style.overflow = ""; if (last && last.focus) last.focus({ preventScroll: true }); }
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-close]"); if (t) { closeDr(t.closest(".dr")); return; }
    var o = e.target.closest("[data-open]"); if (o) { if (o.dataset.open === "cesta") drawCart(); openDr(o.dataset.open); return; }
    var a = e.target.closest("[data-auth]"); if (a) { authView(a.dataset.auth); openDr("cuenta"); return; }
    var c = e.target.closest("[data-copy]"); if (c) { copy(c.dataset.copy); return; }
    if (e.target.closest("[data-pedir-cita]")) closeDr();
  });
  $("#ov").addEventListener("click", function () { closeDr(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDr(); });
  function copy(txt) { (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast("Copiado: " + txt); }, function () { toast(txt); }); }

  /* ---------- cabecera, aviso de campaña y animaciones ---------- */
  var promo = $("#promo");
  if (ls.get("mv_promo_off", false)) promo.remove();
  else $("[data-close-promo]").addEventListener("click", function () { promo.remove(); ls.set("mv_promo_off", true); });
  var top = $("#top");
  window.addEventListener("scroll", function () { top.classList.toggle("sc", window.scrollY > 10); }, { passive: true });
  var io = "IntersectionObserver" in window && !RM ? new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }); }, { rootMargin: "0px 0px -8% 0px" }) : null;
  function reveal(root) { $$(".rv:not(.in)", root).forEach(function (el) { if (io) io.observe(el); else el.classList.add("in"); }); }
  reveal();
  // contadores
  var cio = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (x) {
      if (!x.isIntersecting) return; cio.unobserve(x.target);
      var el = x.target, to = +el.dataset.count, plus = el.hasAttribute("data-plus"), t0 = performance.now();
      (function f(now) { var p = Math.min(1, (now - t0) / 1400), v = Math.round(to * (1 - Math.pow(1 - p, 3))); el.textContent = v.toLocaleString("es-ES") + (plus && p === 1 ? "+" : ""); if (p < 1) requestAnimationFrame(f); })(t0);
    });
  }) : null;
  $$("[data-count]").forEach(function (el) { if (cio && !RM) cio.observe(el); else el.textContent = (+el.dataset.count).toLocaleString("es-ES") + (el.hasAttribute("data-plus") ? "+" : ""); });
  // inclinación 3D de tarjetas
  function tilt(el) {
    if (!el || RM) return;
    el.addEventListener("pointermove", function (e) {
      var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.transform = "rotateY(" + (x - 0.5) * 14 + "deg) rotateX(" + (0.5 - y) * 12 + "deg)";
      el.style.setProperty("--mx", x * 100 + "%"); el.style.setProperty("--my", y * 100 + "%"); el.style.setProperty("--sx", (x * 120 - 60) + "%");
    });
    el.addEventListener("pointerleave", function () { el.style.transform = ""; });
  }
  tilt($("#mcard")); tilt($("#gc"));
  // lookbook
  $$("[data-lk]").forEach(function (b) { b.addEventListener("click", function () { var l = $("#looksl"); l.scrollBy({ left: +b.dataset.lk * (l.firstElementChild.offsetWidth + 16), behavior: RM ? "auto" : "smooth" }); }); });

  /* ---------- catálogo ---------- */
  function pic(img, alt, cls) { return '<img src="img/' + img + '-m.webp" alt="' + esc(alt) + '" loading="lazy" decoding="async"' + (cls ? ' class="' + cls + '"' : "") + ">"; }
  function drawServices(f) {
    $("#svc").innerHTML = CAT.servicios.filter(function (s) { return f === "todo" || s.cat === f; }).map(function (s) {
      return '<article class="sv rv in"><div class="im">' + pic(s.img, s.nombre) + (s.tag ? '<span class="tag">' + esc(s.tag) + "</span>" : "") + '</div><div class="bd"><h3>' + esc(s.nombre) + "</h3><p>" + esc(s.desc) + '</p><div class="ft"><span class="pr"><small>desde</small>' + eur(s.precio) + '</span><button class="btn gold" type="button" data-pedir-cita>Reservar</button></div></div></article>';
    }).join("");
  }
  $$(".tabs .chip").forEach(function (b) { b.addEventListener("click", function () { $$(".tabs .chip").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); drawServices(b.dataset.f); }); });
  function drawShop() {
    $("#shop").innerHTML = CAT.productos.map(function (p) {
      return '<article class="pd rv"><div class="im">' + pic(p.img, p.nombre) + (p.tag ? '<span class="tag">' + esc(p.tag) + "</span>" : "") + '</div><div class="bd"><h3>' + esc(p.nombre) + "</h3><p>" + esc(p.desc) + '</p><div class="ft"><span class="pr">' + eur(p.precio) + '</span><button class="add" type="button" data-add="' + p.id + '" aria-label="Añadir ' + esc(p.nombre) + ' a la cesta"><svg class="ico"><use href="#i-plus"/></svg></button></div></div></article>';
    }).join("");
    reveal($("#shop"));
  }
  function drawRewards() { $("#rw").innerHTML = CAT.recompensas.map(function (r) { return "<li><span>" + esc(r.nombre) + '</span><b>' + r.puntos + " pts</b></li>"; }).join(""); }

  /* ---------- pago de prueba (al estilo Stripe en modo test: no se cobra nada) ---------- */
  var payCb = null;
  function checkout(pago, titulo, cb) {
    payCb = cb;
    $("#dp-t").textContent = "Pago seguro";
    $("#dp-b").innerHTML = '<div class="pay-top"><span>' + esc(titulo) + '</span><b>' + eur(pago.importe) + '</b></div>' +
      '<div class="test"><b>Modo de prueba</b> · no se cobra nada. Usa una tarjeta de prueba:<div class="chips"><button class="chip" type="button" data-tc="4242 4242 4242 4242">✓ 4242 4242 4242 4242</button><button class="chip" type="button" data-tc="4000 0000 0000 0002">✗ Rechazada</button><button class="chip" type="button" data-tc="4000 0000 0000 9995">✗ Sin fondos</button></div></div>' +
      '<form class="form" id="fpay" novalidate autocomplete="off"><div class="fld"><label for="pc-n">Número de tarjeta</label><div class="cardin"><input class="inp" id="pc-n" inputmode="numeric" maxlength="19" placeholder="1234 1234 1234 1234" autocomplete="off"><span id="pc-brand"></span></div></div>' +
      '<div class="row2"><div class="fld"><label for="pc-e">Caducidad</label><input class="inp" id="pc-e" inputmode="numeric" maxlength="5" placeholder="MM/AA" autocomplete="off"></div><div class="fld"><label for="pc-c">CVC</label><input class="inp" id="pc-c" inputmode="numeric" maxlength="4" placeholder="123" autocomplete="off"></div></div>' +
      '<div class="fld"><label for="pc-h">Titular</label><input class="inp" id="pc-h" maxlength="60" autocomplete="off"></div>' +
      '<p class="err" id="pc-err" role="alert"></p><button class="btn gold full" type="submit">🔒 Pagar ' + eur(pago.importe) + '</button>' +
      '<p class="demo">Pasarela de demostración preparada para Stripe: en la web real se conecta tu cuenta y el cobro va directo a tu banco. Los datos de tarjeta nunca se guardan.</p></form>';
    var n = $("#pc-n"), ex = $("#pc-e");
    n.addEventListener("input", function () { var v = n.value.replace(/\D/g, "").slice(0, 16); n.value = v.replace(/(.{4})/g, "$1 ").trim(); $("#pc-brand").textContent = /^4/.test(v) ? "VISA" : /^5[1-5]/.test(v) ? "MASTERCARD" : ""; });
    ex.addEventListener("input", function () { var v = ex.value.replace(/\D/g, "").slice(0, 4); ex.value = v.length > 2 ? v.slice(0, 2) + "/" + v.slice(2) : v; });
    $$("[data-tc]", $("#dp-b")).forEach(function (b) { b.addEventListener("click", function () { n.value = b.dataset.tc; n.dispatchEvent(new Event("input")); var d = new Date(); ex.value = "12/" + String((d.getFullYear() + 3) % 100); $("#pc-c").value = "123"; if (!$("#pc-h").value) $("#pc-h").value = (YO && YO.usuario && YO.usuario.nombre) || "Prueba"; }); });
    $("#fpay").addEventListener("submit", function (e) {
      e.preventDefault(); var er = $("#pc-err"), btn = e.target.querySelector("button[type=submit]"); er.textContent = ""; btn.disabled = true; btn.textContent = "Procesando…";
      api("pago", { id: pago.id, tarjeta: n.value, caducidad: ex.value, cvc: $("#pc-c").value, titular: $("#pc-h").value })
        .then(function (d) { closeDr(); var f = payCb; payCb = null; if (f) f(d); if (YO) loadYo(); })
        .catch(function (x) { er.textContent = x.message; btn.disabled = false; btn.textContent = "🔒 Pagar " + eur(pago.importe); });
    });
    openDr("pago");
  }

  /* ---------- cesta ---------- */
  function cartN() { var n = 0; for (var k in cart) n += cart[k]; $$("[data-cart-n]").forEach(function (x) { x.textContent = n || ""; }); return n; }
  function saveCart() { ls.set("mv_cesta", cart); cartN(); }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-add]"); if (!b || !CAT) return;
    var id = b.dataset.add; cart[id] = Math.min(10, (cart[id] || 0) + 1); saveCart();
    b.classList.add("ok"); setTimeout(function () { b.classList.remove("ok"); }, 900);
    var p = CAT.productos.find(function (x) { return x.id === id; }); toast("Añadido a la cesta: " + p.nombre);
  });
  function drawCart(done) {
    var b = $("#dk-b");
    if (done) {
      b.innerHTML = '<div class="ok-box"><b>' + (done.pagado ? "¡Pagado! ✓" : "¡Reservado!") + '</b><p>Tu código de recogida es</p><div class="cd">' + esc(done.codigo) + "</div><p>" + (done.pagado ? "Pagado con tarjeta ···· " + esc(done.last4) + " (" + eur(done.total) + "). Solo tienes que recogerlo." + (done.puntos ? " Has sumado <b>" + done.puntos + " puntos</b>." : "") : "Total a pagar en el salón: <b>" + eur(done.total) + "</b>." + (done.puntos ? " Sumarás " + done.puntos + " puntos al pagar." : " Si te haces socia, sumarás puntos con esta compra.")) + '</p><a class="btn gold" target="_blank" rel="noopener" href="https://wa.me/34628224719?text=' + encodeURIComponent("Hola, he reservado productos en la web. Código " + done.codigo) + '">Avisar por WhatsApp</a></div>';
      return;
    }
    var ids = Object.keys(cart).filter(function (k) { return CAT.productos.some(function (p) { return p.id === k; }); });
    if (!ids.length) { b.innerHTML = '<p class="lead">Tu cesta está vacía.</p><a class="btn gold" href="#tienda" data-close style="margin-top:1rem">Ver la tienda</a>'; return; }
    var tot = 0;
    var rows = ids.map(function (k) { var p = CAT.productos.find(function (x) { return x.id === k; }); tot += p.precio * cart[k]; return '<div class="ci">' + pic(p.img, "") + "<div><b>" + esc(p.nombre) + "</b><small>" + eur(p.precio) + '</small></div><div class="qty"><button type="button" data-q="' + k + '" data-d="-1" aria-label="Quitar uno">−</button><span>' + cart[k] + '</span><button type="button" data-q="' + k + '" data-d="1" aria-label="Añadir uno">+</button></div></div>'; }).join("");
    b.innerHTML = '<div class="cl">' + rows + '</div><div class="tot"><span>Total</span><span>' + eur(tot) + '</span></div><form class="form" id="fpedido" novalidate><div class="row2"><div class="fld"><label for="pd-n">Nombre</label><input class="inp" id="pd-n" autocomplete="name" maxlength="60" value="' + esc(YO && YO.usuario ? YO.usuario.nombre : "") + '"></div><div class="fld"><label for="pd-t">Teléfono</label><input class="inp" id="pd-t" type="tel" inputmode="tel" autocomplete="tel" maxlength="16"></div></div><div class="fld"><span class="lbl2">¿Cómo quieres pagar?</span><div class="opt2"><label><input type="radio" name="pd-p" value="online" checked><span><b>Pagar ahora con tarjeta</b><small>Lo recoges sin esperas</small></span></label><label><input type="radio" name="pd-p" value="salon"><span><b>Pagar al recoger</b><small>En el salón, te lo guardamos 7 días</small></span></label></div></div><p class="err" id="pd-err" role="alert"></p><button class="btn gold full" type="submit">Continuar</button></form>';
    $("#fpedido").addEventListener("submit", function (e) {
      e.preventDefault(); var er = $("#pd-err"); er.textContent = "";
      var btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
      var modo = (e.target.querySelector("[name=pd-p]:checked") || {}).value || "salon";
      api("pedido", { nombre: $("#pd-n").value, telefono: $("#pd-t").value, pago: modo, items: ids.map(function (k) { return { id: k, q: cart[k] }; }) })
        .then(function (d) {
          cart = {}; saveCart();
          if (d.pago) checkout(d.pago, "Pedido " + d.codigo, function (r) { drawCart({ codigo: d.codigo, total: d.total, pagado: true, last4: r.last4, puntos: r.puntos }); openDr("cesta"); toast("Pago completado ✓"); });
          else { drawCart(d); if (YO) loadYo(); }
        })
        .catch(function (x) { er.textContent = x.message; btn.disabled = false; });
    });
  }
  $("#dk-b").addEventListener("click", function (e) { var q = e.target.closest("[data-q]"); if (!q) return; var k = q.dataset.q; cart[k] = (cart[k] || 0) + +q.dataset.d; if (cart[k] < 1) delete cart[k]; if (cart[k] > 10) cart[k] = 10; saveCart(); drawCart(); });

  /* ---------- club: cuenta y puntos ---------- */
  var amiga = (new URLSearchParams(location.search).get("amiga") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  function qr(txt, px) { return window.qrSVG ? window.qrSVG(txt, px) : ""; }
  function card() {
    var u = YO && YO.usuario;
    $("#mc-pts").textContent = u ? YO.puntos.toLocaleString("es-ES") : "50";
    $("#mc-nm").textContent = u ? u.nombre : "Tu nombre aquí";
    $("#mc-lvl").textContent = u ? YO.nivel.nombre : "Rosa";
    $("#mc-qr").innerHTML = qr(u ? "MV-SOCIA-" + u.socia : location.origin + "/#club", 68);
    var b = $("#btn-cuenta"); b.querySelector(".lbl").textContent = u ? u.nombre.split(" ")[0] : "Entrar";
    b.querySelector(".av").innerHTML = u ? esc(u.nombre.charAt(0).toUpperCase()) : '<svg class="ico"><use href="#i-user"/></svg>';
    $("#club-cta").innerHTML = u ? '<button class="btn gold" type="button" id="ver-club">Ver mi club · ' + YO.puntos + " puntos</button>" : '<button class="btn gold" type="button" data-auth="registro">Únete gratis · +50 puntos</button><button class="btn" type="button" data-auth="entrar">Ya soy socia</button>';
    var v = $("#ver-club"); if (v) v.addEventListener("click", function () { panel(); openDr("cuenta"); });
  }
  function loadYo() { return api("yo").then(function (d) { YO = d.usuario ? d : null; card(); if ($("#dr-cuenta").classList.contains("on") && YO) panel(); return YO; }).catch(function () { YO = null; card(); }); }
  function openClub() { if (YO) panel(); else authView(amiga ? "registro" : "entrar"); openDr("cuenta"); }
  $("#btn-cuenta").addEventListener("click", openClub);
  $("#tb-club").addEventListener("click", openClub);

  function authView(modo) {
    $("#dc-t").textContent = modo === "registro" ? "Únete al club" : "Entrar";
    $("#dc-b").innerHTML = '<div class="tabs2" role="tablist"><button type="button" role="tab" data-m="entrar" aria-selected="' + (modo === "entrar") + '">Entrar</button><button type="button" role="tab" data-m="registro" aria-selected="' + (modo === "registro") + '">Crear cuenta</button></div>' +
      (modo === "registro" ? '<div class="perk">🎁 <span><b>50 puntos de bienvenida</b>' + (amiga ? " + 75 por venir invitada" : "") + ' y 1 punto por cada euro.</span></div>' : "") +
      '<form class="form" id="fauth" novalidate>' +
      (modo === "registro" ? '<div class="fld"><label for="a-n">Nombre</label><input class="inp" id="a-n" autocomplete="name" maxlength="60" required></div>' : "") +
      '<div class="fld"><label for="a-e">Correo</label><input class="inp" id="a-e" type="email" inputmode="email" autocomplete="email" maxlength="254" required></div>' +
      '<div class="fld"><label for="a-p">Contraseña</label><input class="inp" id="a-p" type="password" autocomplete="' + (modo === "registro" ? "new-password" : "current-password") + '" minlength="8" maxlength="128" required>' + (modo === "registro" ? '<small style="color:var(--soft);font-size:.78rem">Mínimo 8 caracteres.</small>' : "") + "</div>" +
      (modo === "registro" ? '<div class="fld"><label for="a-t">Teléfono (opcional)</label><input class="inp" id="a-t" type="tel" inputmode="tel" autocomplete="tel" maxlength="16"></div><div class="fld"><span class="lbl2">Tu cumpleaños (opcional, ¡hay regalo!)</span><div class="row2" style="grid-template-columns:1fr 1.4fr">' + selDia("a-d") + selMes("a-m") + '</div></div><div class="fld"><label for="a-a">Código de una amiga (opcional)</label><input class="inp" id="a-a" maxlength="8" autocapitalize="characters" value="' + esc(amiga) + '"></div><label class="chk"><input type="checkbox" id="a-ok"> <span>Acepto la política de privacidad: mis datos solo se usan para el club y mis citas.</span></label><label class="chk"><input type="checkbox" id="a-nov"> <span>Quiero recibir novedades y promociones (opcional).</span></label>' : "") +
      '<p class="err" id="a-err" role="alert"></p><button class="btn gold full" type="submit">' + (modo === "registro" ? "Crear mi cuenta" : "Entrar") + "</button>" +
      (modo === "entrar" ? '<p class="demo"><button class="lnk2" type="button" id="a-olv">¿Has olvidado la contraseña?</button></p>' : '<p class="demo">Maqueta de demostración: puedes crear una cuenta de prueba.</p>') + "</form>";
    $$("[data-m]", $("#dc-b")).forEach(function (b) { b.addEventListener("click", function () { authView(b.dataset.m); }); });
    var ol = $("#a-olv"); if (ol) ol.addEventListener("click", olvido);
    $("#fauth").addEventListener("submit", function (e) {
      e.preventDefault(); var er = $("#a-err"), btn = e.target.querySelector("button[type=submit]"); er.textContent = "";
      var body = { email: $("#a-e").value, password: $("#a-p").value };
      if (modo === "registro") { body.nombre = $("#a-n").value; body.telefono = $("#a-t").value; body.amiga = $("#a-a").value; body.acepto = $("#a-ok").checked; body.novedades = $("#a-nov").checked; var dd = $("#a-d").value, mm = $("#a-m").value; if (dd && mm) body.cumple = mm + "-" + dd; }
      btn.disabled = true; btn.textContent = "Un momento…";
      api("auth/" + modo, body).then(function () { return loadYo(); }).then(function () { toast(modo === "registro" ? "¡Bienvenida al club! Ya tienes tus puntos 🎉" : "¡Hola de nuevo!"); if (amiga) history.replaceState(null, "", location.pathname + location.hash); amiga = ""; panel(); $("#dc-b").scrollTop = 0; })
        .catch(function (x) { er.textContent = x.message; btn.disabled = false; btn.textContent = modo === "registro" ? "Crear mi cuenta" : "Entrar"; });
    });
  }
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function selDia(id) { var o = '<select class="inp" id="' + id + '" aria-label="Día"><option value="">Día</option>'; for (var i = 1; i <= 31; i++) o += '<option value="' + String(i).padStart(2, "0") + '">' + i + "</option>"; return o + "</select>"; }
  function selMes(id) { return '<select class="inp" id="' + id + '" aria-label="Mes"><option value="">Mes</option>' + MESES.map(function (m, i) { return '<option value="' + String(i + 1).padStart(2, "0") + '">' + m + "</option>"; }).join("") + "</select>"; }
  function olvido() {
    $("#dc-t").textContent = "Recuperar contraseña";
    $("#dc-b").innerHTML = '<p class="lead" style="margin-bottom:1rem">Escribe tu correo y te enviamos un enlace para elegir una contraseña nueva.</p><form class="form" id="folv" novalidate><div class="fld"><label for="o-e">Correo</label><input class="inp" id="o-e" type="email" inputmode="email" autocomplete="email" required></div><p class="err" id="o-err" role="status"></p><button class="btn gold full" type="submit">Enviar enlace</button><button class="lnk2" type="button" data-auth="entrar">Volver a entrar</button></form>';
    $("#folv").addEventListener("submit", function (e) {
      e.preventDefault(); var out = $("#o-err"), btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
      api("auth/olvido", { email: $("#o-e").value }).then(function (d) {
        out.style.color = "var(--ok)";
        out.innerHTML = d.sinCorreo ? 'En esta demo aún no están activados los correos. Escríbenos por <a href="https://wa.me/34628224719?text=' + encodeURIComponent("Hola, no recuerdo la contraseña del club") + '" target="_blank" rel="noopener">WhatsApp</a> y te ayudamos.' : "Si ese correo tiene cuenta, te acabamos de enviar el enlace (mira también en spam).";
      }).catch(function (x) { out.style.color = ""; out.textContent = x.message; btn.disabled = false; });
    });
  }
  function resetView(tok) {
    $("#dc-t").textContent = "Contraseña nueva";
    $("#dc-b").innerHTML = '<form class="form" id="frs" novalidate><div class="fld"><label for="r-p">Contraseña nueva</label><input class="inp" id="r-p" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><small style="color:var(--soft);font-size:.78rem">Mínimo 8 caracteres.</small></div><p class="err" id="r-err" role="alert"></p><button class="btn gold full" type="submit">Guardar y entrar</button></form>';
    $("#frs").addEventListener("submit", function (e) {
      e.preventDefault(); var er = $("#r-err");
      api("auth/restablecer", { token: tok, password: $("#r-p").value }).then(function () { history.replaceState(null, "", location.pathname + "#club"); return loadYo(); }).then(function () { toast("Contraseña cambiada ✓"); panel(); }).catch(function (x) { er.textContent = x.message; });
    });
    openDr("cuenta");
  }
  function fecha(s) { var d = new Date(String(s).replace(" ", "T") + "Z"); return isNaN(d) ? "" : d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }); }
  function panel() {
    if (!YO) return authView("entrar");
    var u = YO.usuario, sig = YO.siguiente, pct = sig ? Math.min(100, Math.round((YO.ganados - YO.nivel.desde) / (sig.desde - YO.nivel.desde) * 100)) : 100;
    var inv = location.origin + location.pathname + "?amiga=" + u.socia + "#club";
    $("#dc-t").textContent = "Hola, " + u.nombre.split(" ")[0];
    $("#dc-b").innerHTML =
      '<div class="mcard" style="width:100%"><div class="row"><div class="br">Marta Vega<small>Socia ' + esc(u.socia) + '</small></div><span class="lvl">' + esc(YO.nivel.nombre) + '</span></div><div class="row" style="align-items:flex-end"><div><div class="pts">' + YO.puntos + '<small>PUNTOS</small></div><div class="nm">' + esc(u.nombre) + '</div></div><div class="qr">' + qr("MV-SOCIA-" + u.socia, 68) + "</div></div></div>" +
      '<p class="demo">Enseña este código en el salón para sumar puntos o canjear premios.</p>' +
      '<div class="blk"><h3>Tu nivel</h3><b>' + esc(YO.nivel.nombre) + "</b> · " + esc(YO.nivel.ventaja) + '<div class="bar"><i style="width:' + pct + '%"></i></div><small style="color:var(--soft)">' + (sig ? "Te faltan " + (sig.desde - YO.ganados) + " puntos para " + esc(sig.nombre) + " (" + esc(sig.ventaja) + ")" : "¡Estás en el nivel más alto!") + "</small></div>" +
      '<div class="blk"><h3>Canjea tus puntos</h3><div class="rwb">' + CAT.recompensas.map(function (r) { return '<button type="button" data-rw="' + r.id + '"' + (YO.puntos < r.puntos ? " disabled" : "") + "><span>" + esc(r.nombre) + "<br><small style=\"color:var(--soft)\">" + esc(r.desc) + "</small></span><b>" + r.puntos + " pts</b></button>"; }).join("") + "</div></div>" +
      (YO.canjes.length ? '<div class="blk"><h3>Tus premios</h3><ul class="list">' + YO.canjes.map(function (c) { return "<li><span>" + esc(c.reward) + "<small>Enséñalo en el salón</small></span><b>" + esc(c.code) + "</b></li>"; }).join("") + "</ul></div>" : "") +
      '<div class="blk"><h3>Invita a una amiga · +' + CAT.club.amiga + ' puntos para las dos</h3><div class="prow"><a class="btn gold sm" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent("Te invito al club del Salón Marta Vega: con mi enlace tienes 125 puntos de regalo 💇‍♀️ " + inv) + '">Invitar por WhatsApp</a><button class="btn sm" type="button" data-copy="' + esc(inv) + '">Copiar enlace</button></div></div>' +
      '<div class="blk"><h3>Sorteo de ' + esc(SORTEO ? SORTEO.mes : "este mes") + '</h3><div class="perk" style="margin:0">🎟️ <span>Tienes <b>' + YO.sorteo + ' participaciones</b> para ' + esc(CAT.sorteo.premio) + '. Más visitas y amigas invitadas = más papeletas.</span></div></div>' +
      (u.cumple ? '<div class="blk"><h3>Tu cumpleaños</h3><p style="color:var(--mute);font-size:.9rem">🎂 ' + (+u.cumple.slice(3)) + " de " + MESES[+u.cumple.slice(0, 2) - 1] + ': ese día te llega un regalo al club.</p></div>' : '<div class="blk"><h3>¿Cuándo es tu cumpleaños?</h3><p style="color:var(--mute);font-size:.86rem;margin-bottom:.6rem">Te dejamos un regalo ese día en el club.</p><div class="row2" style="grid-template-columns:1fr 1.4fr 1fr">' + selDia("c-d") + selMes("c-m") + '<button class="btn sm" type="button" id="b-cumple">Guardar</button></div></div>') +
      '<div class="blk"><h3>Prueba el club (demo)</h3><button class="btn sm" type="button" id="b-visita">Simular una visita de ' + CAT.club.visitaDemo + " € (+puntos)</button></div>" +
      '<div class="blk"><h3>Movimientos</h3><ul class="list">' + YO.historial.map(function (h) { return "<li><span>" + esc(h.reason) + "<small>" + fecha(h.created_at) + '</small></span><span class="' + (h.delta > 0 ? "pos" : "neg") + '">' + (h.delta > 0 ? "+" : "") + h.delta + "</span></li>"; }).join("") + "</ul></div>" +
      (YO.regalos.length ? '<div class="blk"><h3>Tarjetas regalo compradas</h3><ul class="list">' + YO.regalos.map(function (g) { return "<li><span>Para " + esc(g.to_name) + "<small>" + esc(g.code) + "</small></span><b>" + eur(g.balance_c / 100) + "</b></li>"; }).join("") + "</ul></div>" : "") +
      (YO.pedidos.length ? '<div class="blk"><h3>Reservas de la tienda</h3><ul class="list">' + YO.pedidos.map(function (p) { return "<li><span>" + esc(p.code) + "<small>" + esc(p.status) + " · " + fecha(p.created_at) + "</small></span><b>" + eur(p.total_c / 100) + "</b></li>"; }).join("") + "</ul></div>" : "") +
      '<div class="blk prow"><button class="btn sm inst' + (canInstall() ? " on" : "") + '" type="button" data-inst>📲 Instalar la app</button><button class="btn sm" type="button" id="b-salir">Cerrar sesión</button><button class="btn sm" type="button" id="b-borrar" style="color:#f0a097">Borrar mi cuenta</button></div>';
    var mc = $("#dc-b .mcard"); tilt(mc);
    $$("[data-rw]", $("#dc-b")).forEach(function (b) { b.addEventListener("click", function () {
      if (!confirmar("¿Canjear «" + b.querySelector("span").firstChild.textContent + "»?")) return;
      b.disabled = true; api("club/canjear", { recompensa: b.dataset.rw }).then(function (d) { toast("Premio canjeado: " + d.codigo); loadYo(); }).catch(function (x) { toast(x.message); b.disabled = false; });
    }); });
    var bc = $("#b-cumple"); if (bc) bc.addEventListener("click", function () { var d = $("#c-d").value, m = $("#c-m").value; if (!d || !m) { toast("Elige el día y el mes"); return; } api("yo/cumple", { cumple: m + "-" + d }).then(function () { toast("¡Apuntado! 🎂"); loadYo(); }).catch(function (x) { toast(x.message); }); });
    $("#b-visita").addEventListener("click", function (e) { e.target.disabled = true; api("club/visita", {}).then(function (d) { toast("+" + d.puntos + " puntos por tu visita ✨"); loadYo(); }).catch(function (x) { toast(x.message); e.target.disabled = false; }); });
    $("#b-salir").addEventListener("click", function () { api("auth/salir", {}).then(function () { YO = null; card(); closeDr(); toast("Has cerrado sesión."); }); });
    $("#b-borrar").addEventListener("click", function () { if (!confirmar("Se borrarán tu cuenta y tus puntos. ¿Seguro?")) return; api("auth/borrar", {}).then(function () { YO = null; card(); closeDr(); toast("Cuenta borrada."); }); });
  }
  function confirmar(m) { try { return window.confirm(m); } catch (e) { return true; } }

  /* ---------- tarjeta regalo ---------- */
  var G = { imp: 50, dis: "noir" };
  function gPrev() {
    var gc = $("#gc"); gc.className = "gc " + G.dis;
    $("#gc-am").textContent = G.imp + " €";
    $("#gc-para").textContent = $("#g-para").value.trim() || "…";
    $("#gc-de").textContent = $("#g-de").value.trim() || "…";
    $("#gc-msg").textContent = $("#g-msg").value.trim() || "Para que te mimes un poco.";
    $("#g-btn").textContent = "Comprar tarjeta de " + G.imp + " €";
  }
  function gChips() {
    $("#g-imp").innerHTML = CAT.regalo.importes.map(function (v) { return '<button class="chip" type="button" data-imp="' + v + '" aria-pressed="' + (G.imp === v && !$("#g-otro").value) + '">' + v + " €</button>"; }).join("");
    $("#g-dis").innerHTML = CAT.regalo.disenos.map(function (d) { return '<button class="chip" type="button" data-dis="' + d.id + '" aria-pressed="' + (G.dis === d.id) + '">' + esc(d.nombre) + "</button>"; }).join("");
  }
  $("#g-imp").addEventListener("click", function (e) { var b = e.target.closest("[data-imp]"); if (!b) return; G.imp = +b.dataset.imp; $("#g-otro").value = ""; gChips(); gPrev(); });
  $("#g-dis").addEventListener("click", function (e) { var b = e.target.closest("[data-dis]"); if (!b) return; G.dis = b.dataset.dis; gChips(); gPrev(); });
  $("#g-otro").addEventListener("input", function () { var v = Math.round(+this.value); if (v >= 10 && v <= 300) { G.imp = v; gChips(); } gPrev(); });
  ["#g-para", "#g-de", "#g-msg"].forEach(function (s) { $(s).addEventListener("input", gPrev); });
  $("#fgift").addEventListener("submit", function (e) {
    e.preventDefault(); var er = $("#g-err"); er.textContent = "";
    if ($("#g-otro").value && !(G.imp >= 10 && G.imp <= 300 && +$("#g-otro").value === G.imp)) { er.textContent = "Elige un importe entre 10 y 300 €."; return; }
    var btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
    api("regalo", { importe: G.imp, de: $("#g-de").value, para: $("#g-para").value, mensaje: $("#g-msg").value, diseno: G.dis, email: $("#g-mail").value })
      .then(function (d) { checkout(d.pago, "Tarjeta regalo para " + $("#g-para").value, function (r) { d.puntos = r.puntos; d.last4 = r.last4; giftOk(d); toast("Pago completado ✓"); }); })
      .catch(function (x) { er.textContent = x.message; })
      .then(function () { btn.disabled = false; });
  });
  function giftOk(d) {
    var link = location.origin + location.pathname + "?tarjeta=" + d.codigo + "#regalo";
    var box = $("#g-ok");
    box.innerHTML = '<div class="ok-box"><b>¡Tarjeta pagada y lista! 🎁</b>' + (d.last4 ? '<p style="color:var(--mute);font-size:.86rem">Pagada con tarjeta ···· ' + esc(d.last4) + ($("#g-mail").value ? " · se la hemos enviado a " + esc($("#g-mail").value) : "") + "</p>" : "") + '<p>Código de la tarjeta de ' + d.importe + " € para " + esc($("#g-para").value) + ":</p><div class=\"cd\">" + esc(d.codigo) + '</div><div style="width:120px;background:#fff;border-radius:12px;padding:6px">' + qr(link, 108) + '</div>' + (d.puntos ? "<p>Has sumado <b>" + d.puntos + " puntos</b> al club.</p>" : "") + '<div class="prow"><a class="btn gold sm" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent("🎁 Tienes una tarjeta regalo de " + d.importe + " € en el Salón Marta Vega. Código " + d.codigo + ". Reserva aquí: " + link) + '">Enviar por WhatsApp</a><button class="btn sm" type="button" id="g-png">Descargar imagen</button><button class="btn sm" type="button" data-copy="' + d.codigo + '">Copiar código</button></div></div>';
    box.hidden = false; $("#fgift").hidden = true;
    $("#g-png").addEventListener("click", function () { pngGift(d); });
    box.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "center" });
  }
  function pngGift(d) {
    var c = document.createElement("canvas"); c.width = 1200; c.height = 756; var x = c.getContext("2d");
    var pal = { noir: ["#1b1618", "#0b0809", "#f0d6a6"], rosa: ["#f3d2ca", "#e3a99d", "#4a2228"], navidad: ["#3c1a20", "#170b0d", "#f6dfb4"] }[G.dis];
    var g = x.createLinearGradient(0, 0, 1200, 756); g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]); x.fillStyle = g; x.fillRect(0, 0, 1200, 756);
    x.fillStyle = pal[2]; x.font = "italic 500 70px Fraunces, Georgia, serif"; x.fillText("MV", 70, 130);
    x.font = "800 26px Manrope, sans-serif"; x.textAlign = "right"; x.fillText("TARJETA REGALO", 1130, 110); x.textAlign = "left";
    x.font = "400 150px Fraunces, Georgia, serif"; x.fillText(d.importe + " €", 70, 420);
    x.font = "italic 400 40px Fraunces, Georgia, serif"; x.fillText(($("#g-msg").value || "Para que te mimes un poco.").slice(0, 60), 70, 500);
    x.font = "700 32px Manrope, sans-serif"; x.fillText("Para: " + $("#g-para").value + "   ·   De: " + $("#g-de").value, 70, 660);
    x.font = "600 30px ui-monospace, Menlo, monospace"; x.textAlign = "right"; x.fillText(d.codigo, 1130, 660);
    c.toBlob(function (b) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "tarjeta-regalo-" + d.codigo + ".png"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }, "image/png");
  }
  function saldo(code) {
    var out = $("#s-out"); out.textContent = "Comprobando…";
    api("regalo/" + encodeURIComponent(code)).then(function (g) { out.style.color = "var(--ok)"; out.textContent = "Tarjeta para " + g.to_name + ": te quedan " + eur(g.balance_c / 100) + " de " + eur(g.amount_c / 100) + "."; })
      .catch(function (x) { out.style.color = ""; out.textContent = x.message; });
  }
  $("#fsaldo").addEventListener("submit", function (e) { e.preventDefault(); saldo($("#s-cod").value.trim().toUpperCase()); });
  var tq = (new URLSearchParams(location.search).get("tarjeta") || "").toUpperCase();
  if (/^MVR-[A-Z0-9]{6}$/.test(tq)) { $("#s-cod").value = tq; saldo(tq); }

  /* ---------- sorteo del mes y top invitadoras ---------- */
  var SORTEO = null;
  function drawSorteo() {
    api("sorteo").then(function (d) {
      SORTEO = d; var el = $("#sorteo"); if (!el) return;
      el.innerHTML = '<div class="srt-h"><span>🎟️ Sorteo de ' + esc(d.mes) + '</span><b>' + esc(d.premio) + '</b><small>Entre todas las socias · termina el ' + new Date(d.fin + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" }) + '</small></div>' +
        '<div class="srt-t"><span class="lbl2">Top invitadoras del mes</span>' + (d.top.length ? '<ol>' + d.top.map(function (x, i) { return "<li><i>" + ["🥇", "🥈", "🥉", "4", "5"][i] + "</i><span>" + esc(x.nombre) + "</span><b>" + x.invitadas + (x.invitadas === 1 ? " amiga" : " amigas") + "</b></li>"; }).join("") + "</ol>" : '<p class="note" style="margin:0">Aún nadie este mes: ¡invita a una amiga y sé la primera!</p>') + "</div>";
    }).catch(function () {});
  }

  /* ---------- antes y después ---------- */
  $$(".ba").forEach(function (b) {
    var r = b.querySelector("input"), drag = false;
    function set() { b.style.setProperty("--p", r.value + "%"); }
    function at(x) { var q = b.getBoundingClientRect(); r.value = Math.max(0, Math.min(100, Math.round((x - q.left) / q.width * 100))); set(); }
    r.addEventListener("input", set);
    b.addEventListener("pointerdown", function (e) { drag = true; at(e.clientX); });
    b.addEventListener("pointermove", function (e) { if (drag || e.pointerType === "mouse") at(e.clientX); });
    window.addEventListener("pointerup", function () { drag = false; });
    b.addEventListener("touchmove", function (e) { var t = e.touches[0]; if (t) at(t.clientX); }, { passive: true });
    set();
  });

  /* ---------- campaña, horario ---------- */
  function countdown() {
    var end = new Date(CAT.campana.hasta).getTime(), el = $("#cd4");
    function f() { var s = Math.max(0, Math.floor((end - Date.now()) / 1000)); var v = { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 }; for (var k in v) el.querySelector('[data-cd="' + k + '"]').textContent = String(v[k]).padStart(2, "0"); }
    f(); setInterval(f, 1000);
  }
  function horario() {
    var H = CAT.negocio.horario, d = (new Date().getDay() + 6) % 7;
    $("#hrs").innerHTML = H.map(function (h, i) { return '<li class="' + (i === d ? "hoy" : "") + '"><span>' + h[0] + "</span><span>" + h[1] + "</span></li>"; }).join("");
    var now = new Date(), min = now.getHours() * 60 + now.getMinutes(), open = false;
    (H[d][1].match(/\d\d:\d\d–\d\d:\d\d/g) || []).forEach(function (r) { var a = r.split("–").map(function (x) { var p = x.split(":"); return +p[0] * 60 + +p[1]; }); if (min >= a[0] && min < a[1]) open = true; });
    var el = $("#abierto"); el.classList.toggle("cl", !open); el.querySelector("span").textContent = open ? "Abierto ahora" : "Cerrado ahora · reserva online 24 h";
  }

  /* ---------- PWA ---------- */
  var deferred = null;
  function canInstall() { return !!deferred; }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; $$(".inst").forEach(function (b) { b.classList.add("on"); }); });
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#btn-inst,[data-inst]")) return;
    if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; $$(".inst").forEach(function (b) { b.classList.remove("on"); }); }); }
  });
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
  if (ios) { var bi = $("#btn-inst"); bi.classList.add("on"); bi.addEventListener("click", function () { toast("En Safari: pulsa Compartir y luego «Añadir a pantalla de inicio»"); }); }
  if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });

  /* ---------- arranque ---------- */
  fetch("catalogo.json").then(function (r) { return r.json(); }).then(function (c) {
    CAT = c; drawServices("todo"); drawShop(); drawRewards(); gChips(); gPrev(); countdown(); horario(); cartN();
    drawSorteo();
    loadYo().then(function () {
      var rt = new URLSearchParams(location.search).get("reset");
      if (rt && /^[0-9a-f]{64}$/.test(rt)) resetView(rt);
      else if (amiga && !YO) { authView("registro"); openDr("cuenta"); }
    });
  });
})();
