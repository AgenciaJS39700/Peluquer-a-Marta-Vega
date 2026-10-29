// /worker.js — Salón Marta Vega · API del club de clientas, tarjetas regalo, tienda, pagos de prueba y panel del salón.
// Cloudflare Workers + D1 «marta-vega» (binding DB). Rutas (solo /api/*; lo demás son archivos de public/):
//   Cuenta:   POST /api/auth/{registro,entrar,salir,borrar,olvido,restablecer} · GET /api/yo · POST /api/yo/cumple
//   Club:     POST /api/club/canjear · POST /api/club/visita (demo) · GET /api/sorteo
//   Regalo:   POST /api/regalo · GET /api/regalo/<código>
//   Tienda:   POST /api/pedido {items, nombre, telefono, pago:"online"|"salon"}
//   Pagos:    POST /api/pago {id, tarjeta, caducidad, cvc, titular}  ← pasarela de PRUEBA (tarjetas de test tipo Stripe)
//   Salón:    /api/salon/* con cabecera x-salon-clave (resumen, socia, cobro, premio, regalo, pedidos)
// Secretos opcionales: BREVO_API_KEY (correos), SALON_CLAVE_HASH (SHA-256 de la clave del panel; por defecto la de la demo).
import CAT from "./public/catalogo.json" with { type: "json" };

const te = new TextEncoder();
const SESION_DIAS = 60, MAX_INTENTOS = 8, VENTANA_MIN = 15, ITER = 100000;
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,24}$/i;
const MAIL_FROM = "info@agencia-js.com";

/* ---------------- utilidades ---------------- */
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h } });
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const ALFA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const codigo = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => ALFA[x % ALFA.length]).join("");
const sha256 = async (t) => hex(await crypto.subtle.digest("SHA-256", te.encode(t)));
const limpio = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const email = (s) => limpio(s, 254).toLowerCase();
const tel = (s) => { const d = String(s || "").replace(/[^\d+]/g, ""); return /^\+?\d{9,15}$/.test(d) ? d : ""; };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function igual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function cuerpo(req) { const t = await req.text(); if (t.length > 4000) throw new Error("grande"); try { return JSON.parse(t || "{}"); } catch { throw new Error("json"); } }
const mismoOrigen = (req, url) => { const o = req.headers.get("origin"); return !o || o === url.origin; };
function cookie(req, n) { for (const p of (req.headers.get("cookie") || "").split(";")) { const i = p.indexOf("="); if (i > 0 && p.slice(0, i).trim() === n) return p.slice(i + 1).trim(); } return ""; }
const sesionCookie = (v, edad) => `mv_sid=${v}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${edad}`;
const hoyMadrid = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
const nombreCorto = (n) => { const p = String(n || "").trim().split(/\s+/); return p[0] + (p[1] ? " " + p[1][0] + "." : ""); };

/* ---------------- correo (Brevo) ---------------- */
async function correo(env, to, nombre, asunto, titulo, html) {
  if (!env.BREVO_API_KEY || !to) return false;
  const cuerpoHtml = `<!doctype html><html lang="es"><body style="margin:0;background:#f3eee8;font-family:Arial,Helvetica,sans-serif;color:#1b130a"><div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#0d0a0b;color:#f4ece2;border-radius:18px;padding:30px"><p style="margin:0 0 18px;font:italic 26px Georgia,serif;color:#f0d6a6">Marta Vega</p><h1 style="font:400 24px/1.25 Georgia,serif;margin:0 0 14px">${esc(titulo)}</h1>${html}</div><p style="font-size:12px;color:#8d8079;text-align:center;margin:14px 0 0">${esc(CAT.negocio.nombre)} · ${esc(CAT.negocio.direccion)} · Maqueta de demostración</p></div></body></html>`;
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ sender: { name: "Salón Marta Vega", email: MAIL_FROM }, to: [{ email: to, name: nombre || undefined }], subject: asunto, htmlContent: cuerpoHtml }) });
    if (!r.ok) console.error("Brevo", r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) { console.error("Brevo", e && e.message); return false; }
}
const boton = (url, txt) => `<p style="margin:22px 0"><a href="${esc(url)}" style="display:inline-block;background:#d9b77e;color:#1b130a;padding:13px 22px;border-radius:999px;font-weight:700;text-decoration:none">${esc(txt)}</a></p>`;

/* ---------------- contraseñas y sesiones ---------------- */
async function hashPass(pass, salt, iter) {
  const k = await crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(salt), iterations: iter }, k, 256));
}
async function crearSesion(env, uid) {
  const t = randomHex(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, datetime('now', ?3))").bind(await sha256(t), uid, `+${SESION_DIAS} days`).run();
  return t;
}
async function usuario(req, env) {
  const t = cookie(req, "mv_sid");
  if (!/^[0-9a-f]{64}$/.test(t)) return null;
  return env.DB.prepare("SELECT u.id, u.email, u.name, u.phone, u.ref_code, u.birthday, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > datetime('now')").bind(await sha256(t)).first();
}
async function demasiados(env, claves, max = MAX_INTENTOS) {
  const desde = Math.floor(Date.now() / 1000) - VENTANA_MIN * 60;
  for (const k of claves) { const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE k = ?1 AND ts > ?2").bind(k, desde).first(); if (r && r.n >= max) return true; }
  return false;
}
const intento = (env, claves) => env.DB.batch(claves.map((k) => env.DB.prepare("INSERT INTO auth_attempts (k, ts) VALUES (?1, ?2)").bind(k, Math.floor(Date.now() / 1000))));
const DEMASIADOS = () => json({ error: "Demasiados intentos. Espera unos minutos y vuelve a probar." }, 429);
const cumpleValido = (s) => { const m = /^(\d{2})-(\d{2})$/.exec(String(s || "")); return m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31 ? s : null; };

/* ---------------- puntos ---------------- */
const sumar = (env, uid, d, motivo) => env.DB.prepare("INSERT INTO points (user_id, delta, reason) VALUES (?1, ?2, ?3)").bind(uid, d, motivo).run();
function nivelDe(g) { let n = CAT.niveles[0]; for (const x of CAT.niveles) if (g >= x.desde) n = x; return n; }
const bonus = (n) => (n.id === "oro" ? 1.25 : n.id === "champan" ? 1.1 : 1);
async function saldo(env, uid) {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(delta),0) AS p, COALESCE(SUM(CASE WHEN delta > 0 THEN delta END),0) AS g FROM points WHERE user_id = ?1").bind(uid).first();
  return { puntos: r.p, ganados: r.g };
}
async function ganarPorEuros(env, uid, euros, motivo) {
  const { ganados } = await saldo(env, uid);
  const p = Math.round(euros * bonus(nivelDe(ganados)));
  if (p > 0) await sumar(env, uid, p, motivo);
  return p;
}

/* ---------------- cuenta ---------------- */
async function auth(req, env, url, ruta, ctx) {
  const b = await cuerpo(req), ip = req.headers.get("cf-connecting-ip") || "0";
  if (ruta === "registro") {
    const em = email(b.email), nom = limpio(b.nombre, 60), pass = String(b.password || ""), ph = b.telefono ? tel(b.telefono) : "";
    if (!EMAIL_RE.test(em)) return json({ error: "Escribe un correo válido." }, 400);
    if (nom.length < 2) return json({ error: "Escribe tu nombre." }, 400);
    if (b.telefono && !ph) return json({ error: "El teléfono no es válido." }, 400);
    if (pass.length < 8 || pass.length > 128) return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
    if (b.acepto !== true) return json({ error: "Tienes que aceptar la política de privacidad." }, 400);
    if (await demasiados(env, [`reg:${ip}`], 5)) return DEMASIADOS();
    await intento(env, [`reg:${ip}`]);
    if (await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(em).first()) return json({ error: "Ese correo ya tiene cuenta. Inicia sesión." }, 409);
    const amiga = b.amiga ? await env.DB.prepare("SELECT id, email, name FROM users WHERE ref_code = ?1").bind(limpio(b.amiga, 8).toUpperCase()).first() : null;
    const salt = randomHex(16), h = await hashPass(pass, salt, ITER);
    let ref = codigo(6);
    while (await env.DB.prepare("SELECT 1 FROM users WHERE ref_code = ?1").bind(ref).first()) ref = codigo(6);
    const r = await env.DB.prepare("INSERT INTO users (email, name, phone, pass_hash, pass_salt, pass_iter, marketing, terms_at, ref_code, referred_by, birthday) VALUES (?1,?2,?3,?4,?5,?6,?7,datetime('now'),?8,?9,?10)")
      .bind(em, nom, ph || null, h, salt, ITER, b.novedades === true ? 1 : 0, ref, amiga ? amiga.id : null, cumpleValido(b.cumple)).run();
    const uid = r.meta.last_row_id;
    await sumar(env, uid, CAT.club.bienvenida, "Bienvenida al club");
    if (amiga) await env.DB.batch([
      env.DB.prepare("INSERT INTO points (user_id, delta, reason) VALUES (?1, ?2, ?3)").bind(uid, CAT.club.amiga, "Vienes invitada por una amiga"),
      env.DB.prepare("INSERT INTO points (user_id, delta, reason) VALUES (?1, ?2, ?3)").bind(amiga.id, CAT.club.amiga, `Has invitado a ${nom.split(" ")[0]}`),
    ]);
    ctx.waitUntil(correo(env, em, nom, "¡Bienvenida al club Marta Vega! 🎁", `Hola, ${nom.split(" ")[0]}`, `<p style="font-size:15px;line-height:1.6;color:#e4d8cc">Ya eres socia. Tienes <b style="color:#f0d6a6">${CAT.club.bienvenida + (amiga ? CAT.club.amiga : 0)} puntos</b> para empezar y sumas 1 punto por cada euro.</p><p style="font-size:15px;line-height:1.6;color:#e4d8cc">Tu código de socia es <b style="color:#f0d6a6">${ref}</b>: compártelo con tus amigas y ganáis ${CAT.club.amiga} puntos cada una.</p>${boton(url.origin + "/#club", "Ver mi club")}`));
    const t = await crearSesion(env, uid);
    return json({ ok: true }, 201, { "set-cookie": sesionCookie(t, SESION_DIAS * 86400) });
  }
  if (ruta === "entrar") {
    const em = email(b.email), pass = String(b.password || "").slice(0, 128), claves = [`in:${ip}`, `in:${em}`];
    if (await demasiados(env, claves)) return DEMASIADOS();
    const u = await env.DB.prepare("SELECT id, pass_hash, pass_salt, pass_iter FROM users WHERE email = ?1").bind(em).first();
    const calc = await hashPass(pass, u ? u.pass_salt : "00".repeat(16), u ? u.pass_iter : ITER);
    if (!u || !igual(calc, u.pass_hash)) { await intento(env, claves); return json({ error: "Correo o contraseña incorrectos." }, 401); }
    const t = await crearSesion(env, u.id);
    return json({ ok: true }, 200, { "set-cookie": sesionCookie(t, SESION_DIAS * 86400) });
  }
  if (ruta === "salir") {
    const t = cookie(req, "mv_sid");
    if (/^[0-9a-f]{64}$/.test(t)) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256(t)).run();
    return json({ ok: true }, 200, { "set-cookie": sesionCookie("", 0) });
  }
  if (ruta === "olvido") {
    const em = email(b.email), claves = [`fg:${ip}`, `fg:${em}`];
    if (await demasiados(env, claves, 4)) return DEMASIADOS();
    await intento(env, claves);
    if (!env.BREVO_API_KEY) return json({ ok: true, sinCorreo: true });
    const u = EMAIL_RE.test(em) ? await env.DB.prepare("SELECT id, name FROM users WHERE email = ?1").bind(em).first() : null;
    if (u) {
      const t = randomHex(32);
      await env.DB.prepare("INSERT INTO resets (token_hash, user_id, expires_at) VALUES (?1, ?2, datetime('now', '+1 hour'))").bind(await sha256(t), u.id).run();
      ctx.waitUntil(correo(env, em, u.name, "Cambia tu contraseña · Salón Marta Vega", "¿Has olvidado tu contraseña?", `<p style="font-size:15px;line-height:1.6;color:#e4d8cc">Pulsa el botón para elegir una nueva. El enlace caduca en 1 hora. Si no lo has pedido tú, ignora este correo.</p>${boton(url.origin + "/?reset=" + t + "#club", "Elegir contraseña nueva")}`));
    }
    return json({ ok: true }); // siempre igual: no revela si el correo existe
  }
  if (ruta === "restablecer") {
    const t = String(b.token || ""), pass = String(b.password || "");
    if (!/^[0-9a-f]{64}$/.test(t)) return json({ error: "El enlace no es válido o ha caducado." }, 400);
    if (pass.length < 8 || pass.length > 128) return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
    if (await demasiados(env, [`rs:${ip}`], 6)) return DEMASIADOS();
    const th = await sha256(t);
    const r = await env.DB.prepare("SELECT user_id FROM resets WHERE token_hash = ?1 AND used = 0 AND expires_at > datetime('now')").bind(th).first();
    if (!r) { await intento(env, [`rs:${ip}`]); return json({ error: "El enlace no es válido o ha caducado." }, 400); }
    const salt = randomHex(16), h = await hashPass(pass, salt, ITER);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET pass_hash = ?1, pass_salt = ?2, pass_iter = ?3 WHERE id = ?4").bind(h, salt, ITER, r.user_id),
      env.DB.prepare("UPDATE resets SET used = 1 WHERE token_hash = ?1").bind(th),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(r.user_id),
    ]);
    const s = await crearSesion(env, r.user_id);
    return json({ ok: true }, 200, { "set-cookie": sesionCookie(s, SESION_DIAS * 86400) });
  }
  if (ruta === "borrar") {
    const u = await usuario(req, env);
    if (!u) return json({ error: "Inicia sesión." }, 401);
    await env.DB.batch(["sessions", "points", "rewards_used", "resets"].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(u.id))
      .concat([env.DB.prepare("UPDATE gift_cards SET user_id = NULL WHERE user_id = ?1").bind(u.id), env.DB.prepare("UPDATE orders SET user_id = NULL WHERE user_id = ?1").bind(u.id), env.DB.prepare("UPDATE users SET referred_by = NULL WHERE referred_by = ?1").bind(u.id), env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(u.id)]));
    return json({ ok: true }, 200, { "set-cookie": sesionCookie("", 0) });
  }
  return json({ error: "No encontrado" }, 404);
}

async function yo(req, env) {
  const u = await usuario(req, env);
  if (!u) return json({ usuario: null });
  const [s, hist, canjes, regalos, pedidos] = await Promise.all([
    saldo(env, u.id),
    env.DB.prepare("SELECT delta, reason, created_at FROM points WHERE user_id = ?1 ORDER BY id DESC LIMIT 12").bind(u.id).all(),
    env.DB.prepare("SELECT reward, code, used, created_at FROM rewards_used WHERE user_id = ?1 ORDER BY id DESC LIMIT 10").bind(u.id).all(),
    env.DB.prepare("SELECT code, amount_c, balance_c, to_name, design, status, created_at FROM gift_cards WHERE user_id = ?1 AND status = 'pagada' ORDER BY created_at DESC LIMIT 10").bind(u.id).all(),
    env.DB.prepare("SELECT code, total_c, status, paid, created_at FROM orders WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 10").bind(u.id).all(),
  ]);
  const nivel = nivelDe(s.ganados), sig = CAT.niveles.find((n) => n.desde > s.ganados) || null;
  return json({
    usuario: { nombre: u.name, email: u.email, socia: u.ref_code, cumple: u.birthday, desde: u.created_at },
    puntos: s.puntos, ganados: s.ganados, nivel, siguiente: sig, sorteo: await participaciones(env, u.id),
    historial: hist.results, canjes: canjes.results, regalos: regalos.results, pedidos: pedidos.results,
  });
}

/* ---------------- club, sorteo ---------------- */
const inicioMes = () => { const d = hoyMadrid(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
async function participaciones(env, uid) {
  const m = inicioMes();
  const [g, inv] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(delta),0) AS g FROM points WHERE user_id = ?1 AND delta > 0 AND created_at >= ?2").bind(uid, m).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE referred_by = ?1 AND created_at >= ?2").bind(uid, m).first(),
  ]);
  return 1 + Math.floor(g.g / 50) + inv.n * 3;
}
async function sorteo(env) {
  const m = inicioMes();
  const top = await env.DB.prepare("SELECT r.name AS name, COUNT(u.id) AS n FROM users u JOIN users r ON r.id = u.referred_by WHERE u.created_at >= ?1 GROUP BY u.referred_by ORDER BY n DESC, MIN(u.created_at) ASC LIMIT 5").bind(m).all();
  const socias = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  const d = hoyMadrid(), ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const fin = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(ult).padStart(2, "0")}`;
  return json({ premio: CAT.sorteo.premio, mes: d.toLocaleDateString("es-ES", { month: "long" }), fin, socias: socias.n, top: top.results.map((x) => ({ nombre: nombreCorto(x.name), invitadas: x.n })) });
}
async function club(req, env, ruta) {
  const u = await usuario(req, env);
  if (!u) return json({ error: "Inicia sesión para usar el club." }, 401);
  const b = await cuerpo(req);
  if (ruta === "canjear") {
    const rw = CAT.recompensas.find((r) => r.id === b.recompensa);
    if (!rw) return json({ error: "Recompensa no válida." }, 400);
    const { puntos } = await saldo(env, u.id);
    if (puntos < rw.puntos) return json({ error: `Te faltan ${rw.puntos - puntos} puntos.` }, 400);
    const c = "MV-" + codigo(5);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO points (user_id, delta, reason) VALUES (?1, ?2, ?3)").bind(u.id, -rw.puntos, `Canje: ${rw.nombre}`),
      env.DB.prepare("INSERT INTO rewards_used (user_id, reward, code) VALUES (?1, ?2, ?3)").bind(u.id, rw.nombre, c),
    ]);
    return json({ ok: true, codigo: c, recompensa: rw.nombre });
  }
  if (ruta === "visita") {
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM points WHERE user_id = ?1 AND reason LIKE 'Visita%' AND created_at > datetime('now', '-1 day')").bind(u.id).first();
    if (r.n >= 3) return json({ error: "En la demo puedes simular 3 visitas al día." }, 429);
    return json({ ok: true, puntos: await ganarPorEuros(env, u.id, CAT.club.visitaDemo, "Visita al salón (demo)") });
  }
  return json({ error: "No encontrado" }, 404);
}
async function cumple(req, env) {
  const u = await usuario(req, env);
  if (!u) return json({ error: "Inicia sesión." }, 401);
  const b = await cuerpo(req), c = cumpleValido(b.cumple);
  if (!c) return json({ error: "Elige el día y el mes." }, 400);
  if (u.birthday) return json({ error: "Tu cumpleaños ya está guardado. Si es un error, escríbenos." }, 400);
  await env.DB.prepare("UPDATE users SET birthday = ?1 WHERE id = ?2").bind(c, u.id).run();
  return json({ ok: true });
}

/* ---------------- pasarela de prueba (al estilo Stripe en modo test) ---------------- */
// Solo acepta las tarjetas de prueba públicas: así nunca se procesa una tarjeta real. Se guardan solo los 4 últimos dígitos.
const TEST = { "4242424242424242": ["visa", "ok"], "5555555555554444": ["mastercard", "ok"], "4000000000000002": ["visa", "rechazada"], "4000000000009995": ["visa", "fondos"] };
async function crearPago(env, kind, ref, amount_c) {
  const id = "pi_demo_" + randomHex(10);
  await env.DB.prepare("INSERT INTO payments (id, kind, ref, amount_c) VALUES (?1, ?2, ?3, ?4)").bind(id, kind, ref, amount_c).run();
  return { id, importe: amount_c / 100 };
}
async function pagar(req, env, url, ctx) {
  const b = await cuerpo(req), ip = req.headers.get("cf-connecting-ip") || "0";
  if (await demasiados(env, [`pay:${ip}`], 20)) return DEMASIADOS();
  await intento(env, [`pay:${ip}`]);
  const id = limpio(b.id, 40);
  const p = /^pi_demo_[0-9a-f]{20}$/.test(id) ? await env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(id).first() : null;
  if (!p) return json({ error: "Pago no encontrado." }, 404);
  if (p.status === "pagado") return json({ error: "Este pago ya está hecho." }, 409);
  const num = String(b.tarjeta || "").replace(/\D/g, ""), cad = String(b.caducidad || "").replace(/\s/g, ""), cvc = String(b.cvc || "");
  const t = TEST[num];
  if (!t) return json({ error: "Modo de prueba: usa la tarjeta 4242 4242 4242 4242 (no se cobra nada)." }, 400);
  const m = /^(\d{2})\/(\d{2})$/.exec(cad), now = new Date();
  if (!m || +m[1] < 1 || +m[1] > 12 || new Date(2000 + +m[2], +m[1], 0) < now) return json({ error: "La fecha de caducidad no es válida." }, 400);
  if (!/^\d{3,4}$/.test(cvc)) return json({ error: "El código de seguridad (CVC) no es válido." }, 400);
  if (t[1] !== "ok") {
    await env.DB.prepare("UPDATE payments SET status = 'rechazado', last4 = ?2, brand = ?3 WHERE id = ?1").bind(id, num.slice(-4), t[0]).run();
    return json({ error: t[1] === "fondos" ? "Pago rechazado: fondos insuficientes (tarjeta de prueba)." : "Tu banco ha rechazado el pago (tarjeta de prueba)." }, 402);
  }
  await env.DB.prepare("UPDATE payments SET status = 'pagado', last4 = ?2, brand = ?3 WHERE id = ?1").bind(id, num.slice(-4), t[0]).run();
  const u = await usuario(req, env);
  let puntos = 0;
  if (p.kind === "regalo") {
    const g = await env.DB.prepare("SELECT * FROM gift_cards WHERE code = ?1").bind(p.ref).first();
    await env.DB.prepare("UPDATE gift_cards SET status = 'pagada', user_id = COALESCE(user_id, ?2) WHERE code = ?1").bind(p.ref, u ? u.id : null).run();
    if (u) puntos = await ganarPorEuros(env, u.id, p.amount_c / 100, `Tarjeta regalo para ${g.to_name}`);
    if (g && g.to_email) ctx.waitUntil(correo(env, g.to_email, g.to_name, `🎁 ${g.from_name} te regala ${g.amount_c / 100} € en el Salón Marta Vega`, `¡${g.to_name}, tienes un regalo!`, `<p style="font-size:15px;line-height:1.6;color:#e4d8cc">${esc(g.from_name)} te ha regalado una tarjeta de <b style="color:#f0d6a6">${g.amount_c / 100} €</b> para lo que más te apetezca.</p>${g.message ? `<p style="font:italic 17px Georgia,serif;color:#f0d6a6">«${esc(g.message)}»</p>` : ""}<p style="font-size:15px;color:#e4d8cc">Código: <b style="letter-spacing:.1em;color:#f0d6a6">${g.code}</b></p>${boton(url.origin + "/?tarjeta=" + g.code + "#regalo", "Ver mi tarjeta y reservar")}`));
  } else if (p.kind === "pedido") {
    await env.DB.prepare("UPDATE orders SET paid = 1 WHERE code = ?1").bind(p.ref).run();
    const o = await env.DB.prepare("SELECT user_id FROM orders WHERE code = ?1").bind(p.ref).first();
    const uid = (o && o.user_id) || (u && u.id);
    if (uid) puntos = await ganarPorEuros(env, uid, p.amount_c / 100, `Compra en la tienda ${p.ref}`);
  }
  return json({ ok: true, ref: p.ref, kind: p.kind, importe: p.amount_c / 100, last4: num.slice(-4), marca: t[0], puntos });
}

/* ---------------- tarjeta regalo y tienda ---------------- */
async function regalo(req, env, ruta) {
  if (req.method === "GET") {
    const c = limpio(ruta, 12).toUpperCase();
    if (!/^MVR-[A-Z0-9]{6}$/.test(c)) return json({ error: "Código no válido." }, 400);
    const g = await env.DB.prepare("SELECT code, amount_c, balance_c, to_name, from_name, design, created_at FROM gift_cards WHERE code = ?1 AND status = 'pagada'").bind(c).first();
    return g ? json(g) : json({ error: "No encontramos esa tarjeta." }, 404);
  }
  const b = await cuerpo(req), ip = req.headers.get("cf-connecting-ip") || "0";
  const imp = Number(b.importe);
  if (!Number.isInteger(imp) || imp < 10 || imp > 300) return json({ error: "Elige un importe entre 10 y 300 €." }, 400);
  const de = limpio(b.de, 40), para = limpio(b.para, 40), msg = limpio(b.mensaje, 160), mail = b.email ? email(b.email) : "";
  if (!de || !para) return json({ error: "Escribe de quién es y para quién." }, 400);
  if (mail && !EMAIL_RE.test(mail)) return json({ error: "El correo de la persona no es válido." }, 400);
  const dis = CAT.regalo.disenos.find((d) => d.id === b.diseno) ? b.diseno : "noir";
  if (await demasiados(env, [`gift:${ip}`], 10)) return DEMASIADOS();
  await intento(env, [`gift:${ip}`]);
  const u = await usuario(req, env), c = "MVR-" + codigo(6);
  await env.DB.prepare("INSERT INTO gift_cards (code, amount_c, balance_c, from_name, to_name, message, design, user_id, status, to_email) VALUES (?1,?2,?2,?3,?4,?5,?6,?7,'pendiente',?8)").bind(c, imp * 100, de, para, msg || null, dis, u ? u.id : null, mail || null).run();
  return json({ ok: true, codigo: c, importe: imp, pago: await crearPago(env, "regalo", c, imp * 100) }, 201);
}
async function pedido(req, env) {
  const b = await cuerpo(req), ip = req.headers.get("cf-connecting-ip") || "0";
  const nom = limpio(b.nombre, 60), ph = tel(b.telefono);
  if (nom.length < 2 || !ph) return json({ error: "Escribe tu nombre y un teléfono válido." }, 400);
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 20).map((x) => ({ p: CAT.productos.find((p) => p.id === x.id), q: Math.max(1, Math.min(10, Math.floor(Number(x.q) || 0))) })).filter((x) => x.p);
  if (!items.length) return json({ error: "La cesta está vacía." }, 400);
  if (await demasiados(env, [`ord:${ip}`], 10)) return DEMASIADOS();
  await intento(env, [`ord:${ip}`]);
  const u = await usuario(req, env), total = items.reduce((s, x) => s + x.p.precio * 100 * x.q, 0), c = "MVP-" + codigo(5);
  await env.DB.prepare("INSERT INTO orders (code, user_id, name, phone, items, total_c) VALUES (?1,?2,?3,?4,?5,?6)").bind(c, u ? u.id : null, nom, ph, JSON.stringify(items.map((x) => ({ id: x.p.id, n: x.p.nombre, q: x.q, p: x.p.precio }))), total).run();
  const online = b.pago === "online";
  return json({ ok: true, codigo: c, total: total / 100, puntos: u ? Math.round(total / 100) : 0, pago: online ? await crearPago(env, "pedido", c, total) : null }, 201);
}

/* ---------------- panel del salón ---------------- */
async function claveOk(req, env) {
  const k = String(req.headers.get("x-salon-clave") || "").slice(0, 80);
  if (!k) return false;
  return igual(await sha256(k), env.SALON_CLAVE_HASH || (await sha256("demo-martavega")));
}
async function salon(req, env, p) {
  const ip = req.headers.get("cf-connecting-ip") || "0";
  if (await demasiados(env, [`sal:${ip}`], 10)) return DEMASIADOS();
  if (!(await claveOk(req, env))) { await intento(env, [`sal:${ip}`]); return json({ error: "Clave del salón incorrecta." }, 401); }
  const r = p[1], b = req.method === "POST" ? await cuerpo(req) : {};
  if (r === "resumen") {
    const [s, pts, g, o, rw] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM users").first(),
      env.DB.prepare("SELECT COALESCE(SUM(delta),0) AS n FROM points WHERE delta > 0").first(),
      env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount_c),0) AS t FROM gift_cards WHERE status = 'pagada'").first(),
      env.DB.prepare("SELECT code, name, phone, items, total_c, status, paid, created_at FROM orders ORDER BY created_at DESC LIMIT 20").all(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM rewards_used WHERE used = 0").first(),
    ]);
    return json({ socias: s.n, puntos: pts.n, regalos: g.n, regalosEur: g.t / 100, premiosPendientes: rw.n, pedidos: o.results.map((x) => ({ ...x, items: JSON.parse(x.items) })) });
  }
  if (r === "socia") {
    const c = limpio(p[2] || b.socia, 30).toUpperCase().replace(/^MV-SOCIA-/, "");
    const u = /^[A-Z0-9]{6}$/.test(c) ? await env.DB.prepare("SELECT id, name, email, phone, ref_code, birthday, created_at FROM users WHERE ref_code = ?1").bind(c).first() : null;
    if (!u) return json({ error: "No hay ninguna socia con ese código." }, 404);
    const s = await saldo(env, u.id), pend = await env.DB.prepare("SELECT reward, code, created_at FROM rewards_used WHERE user_id = ?1 AND used = 0 ORDER BY id DESC").bind(u.id).all();
    return json({ socia: { nombre: u.name, telefono: u.phone, codigo: u.ref_code, cumple: u.birthday, desde: u.created_at }, puntos: s.puntos, nivel: nivelDe(s.ganados), premios: pend.results });
  }
  if (r === "cobro") {
    const c = limpio(b.socia, 30).toUpperCase().replace(/^MV-SOCIA-/, ""), imp = Math.round(Number(b.importe) * 100) / 100;
    if (!(imp > 0 && imp <= 2000)) return json({ error: "Importe no válido." }, 400);
    const u = await env.DB.prepare("SELECT id, name FROM users WHERE ref_code = ?1").bind(c).first();
    if (!u) return json({ error: "Socia no encontrada." }, 404);
    const pts = await ganarPorEuros(env, u.id, imp, `En el salón: ${limpio(b.concepto, 60) || "servicio"} (${imp} €)`);
    return json({ ok: true, puntos: pts, total: (await saldo(env, u.id)).puntos });
  }
  if (r === "premio") {
    const c = limpio(b.codigo, 12).toUpperCase();
    const x = await env.DB.prepare("SELECT id, reward, used FROM rewards_used WHERE code = ?1").bind(c).first();
    if (!x) return json({ error: "Código de premio no encontrado." }, 404);
    if (x.used) return json({ error: "Este premio ya se usó." }, 409);
    await env.DB.prepare("UPDATE rewards_used SET used = 1 WHERE id = ?1").bind(x.id).run();
    return json({ ok: true, premio: x.reward });
  }
  if (r === "regalo") {
    const c = limpio(p[2] || b.codigo, 12).toUpperCase();
    const g = await env.DB.prepare("SELECT code, amount_c, balance_c, to_name, status FROM gift_cards WHERE code = ?1").bind(c).first();
    if (!g || g.status !== "pagada") return json({ error: "Tarjeta no encontrada o sin pagar." }, 404);
    if (req.method === "GET") return json(g);
    const d = Math.round(Number(b.importe) * 100);
    if (!(d > 0) || d > g.balance_c) return json({ error: `Importe no válido (saldo ${g.balance_c / 100} €).` }, 400);
    const ok = await env.DB.prepare("UPDATE gift_cards SET balance_c = balance_c - ?2 WHERE code = ?1 AND balance_c >= ?2").bind(c, d).run();
    if (!ok.meta.changes) return json({ error: "Saldo insuficiente." }, 409);
    await env.DB.prepare("INSERT INTO gift_txn (code, delta_c, note) VALUES (?1, ?2, ?3)").bind(c, -d, limpio(b.concepto, 60) || "Cobro en el salón").run();
    return json({ ok: true, saldo: (g.balance_c - d) / 100 });
  }
  if (r === "pedido") {
    const c = limpio(b.codigo, 12).toUpperCase(), st = b.estado === "entregado" ? "entregado" : b.estado === "listo" ? "listo" : null;
    if (!st) return json({ error: "Estado no válido." }, 400);
    const o = await env.DB.prepare("SELECT code, user_id, total_c, paid, status FROM orders WHERE code = ?1").bind(c).first();
    if (!o) return json({ error: "Pedido no encontrado." }, 404);
    await env.DB.prepare("UPDATE orders SET status = ?2, paid = CASE WHEN ?2 = 'entregado' THEN 1 ELSE paid END WHERE code = ?1").bind(c, st).run();
    let pts = 0;
    if (st === "entregado" && !o.paid && o.user_id) pts = await ganarPorEuros(env, o.user_id, o.total_c / 100, `Compra en la tienda ${c}`);
    return json({ ok: true, puntos: pts });
  }
  return json({ error: "No encontrado" }, 404);
}

/* ---------------- tareas diarias ---------------- */
async function diario(env) {
  const d = hoyMadrid(), md = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, y = d.getFullYear();
  const { results } = await env.DB.prepare("SELECT id, name, email FROM users WHERE birthday = ?1 AND (bday_year IS NULL OR bday_year < ?2) LIMIT 200").bind(md, y).all();
  for (const u of results) {
    const s = await saldo(env, u.id), nv = nivelDe(s.ganados);
    let regalo;
    if (nv.id === "rosa") { await sumar(env, u.id, CAT.club.cumple, "¡Feliz cumpleaños! 🎂"); regalo = `${CAT.club.cumple} puntos de regalo`; }
    else { const c = "MV-" + codigo(5); await env.DB.prepare("INSERT INTO rewards_used (user_id, reward, code) VALUES (?1, ?2, ?3)").bind(u.id, "Regalo de cumpleaños: ritual spa capilar", c).run(); regalo = "un ritual spa capilar gratis (código " + c + ")"; }
    await env.DB.prepare("UPDATE users SET bday_year = ?2 WHERE id = ?1").bind(u.id, y).run();
    await correo(env, u.email, u.name, "¡Feliz cumpleaños! 🎂 Tienes un regalo", `¡Feliz cumpleaños, ${u.name.split(" ")[0]}!`, `<p style="font-size:15px;line-height:1.6;color:#e4d8cc">En el Salón Marta Vega queremos celebrarlo contigo: te hemos dejado <b style="color:#f0d6a6">${regalo}</b> en tu club.</p>`);
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_attempts WHERE ts < ?1").bind(Math.floor(Date.now() / 1000) - 86400),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
    env.DB.prepare("DELETE FROM resets WHERE expires_at < datetime('now', '-1 day')"),
    env.DB.prepare("DELETE FROM gift_cards WHERE status = 'pendiente' AND created_at < datetime('now', '-2 days')"),
    env.DB.prepare("DELETE FROM payments WHERE status != 'pagado' AND created_at < datetime('now', '-2 days')"),
  ]);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) {
      if (url.pathname === "/panel" || url.pathname === "/panel/") return env.ASSETS.fetch(new Request(new URL("/panel.html", url), req));
      return env.ASSETS.fetch(req);
    }
    if (!env.DB) return json({ error: "Base de datos no disponible." }, 503);
    const p = url.pathname.slice(5).split("/");
    try {
      if (req.method === "GET" && p[0] === "yo" && !p[1]) return await yo(req, env);
      if (req.method === "GET" && p[0] === "sorteo") return await sorteo(env);
      if (p[0] === "regalo" && req.method === "GET" && p[1]) return await regalo(req, env, p[1]);
      if (req.method !== "GET" && req.method !== "POST") return json({ error: "Método no permitido" }, 405);
      if (p[0] === "salon") return await salon(req, env, p);
      if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
      if (!mismoOrigen(req, url)) return json({ error: "Origen no permitido." }, 403);
      if (p[0] === "auth") return await auth(req, env, url, p[1], ctx);
      if (p[0] === "yo" && p[1] === "cumple") return await cumple(req, env);
      if (p[0] === "club") return await club(req, env, p[1]);
      if (p[0] === "regalo") return await regalo(req, env, "");
      if (p[0] === "pedido") return await pedido(req, env);
      if (p[0] === "pago") return await pagar(req, env, url, ctx);
      return json({ error: "No encontrado" }, 404);
    } catch (e) {
      if (e && (e.message === "json" || e.message === "grande")) return json({ error: "Datos no válidos." }, 400);
      console.error(e && e.stack);
      return json({ error: "Error del servidor. Inténtalo de nuevo." }, 500);
    }
  },
  async scheduled(_e, env, ctx) { ctx.waitUntil(diario(env)); },
};
