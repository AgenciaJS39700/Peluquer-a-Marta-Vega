// /worker.js — Salón Marta Vega · API del club de clientas, tarjetas regalo y tienda (Cloudflare Workers + D1).
// Rutas (solo /api/*; el resto lo sirven los archivos estáticos):
//   POST /api/auth/{registro,entrar,salir,borrar} · GET /api/yo
//   POST /api/club/canjear {recompensa} · POST /api/club/visita (demo: suma puntos de una visita)
//   POST /api/regalo {importe, de, para, mensaje, diseno} · GET /api/regalo/<código>
//   POST /api/pedido {items:[{id,q}], nombre, telefono}
// Demo: los pagos de tarjetas regalo y la tienda son simulados (se paga en el salón).
import CAT from "./public/catalogo.json" with { type: "json" };

const te = new TextEncoder();
const SESION_DIAS = 60;
const MAX_INTENTOS = 8, VENTANA_MIN = 15;
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,24}$/i;

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
function igual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function cuerpo(req) {
  const t = await req.text();
  if (t.length > 4000) throw new Error("grande");
  try { return JSON.parse(t || "{}"); } catch { throw new Error("json"); }
}
function mismoOrigen(req, url) {
  const o = req.headers.get("origin");
  return !o || o === url.origin;
}
function cookie(req, n) {
  for (const p of (req.headers.get("cookie") || "").split(";")) { const i = p.indexOf("="); if (i > 0 && p.slice(0, i).trim() === n) return p.slice(i + 1).trim(); }
  return "";
}
const sesionCookie = (v, edad) => `mv_sid=${v}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${edad}`;

/* ---------------- contraseñas y sesiones ---------------- */
async function hashPass(pass, salt, iter) {
  const k = await crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(salt), iterations: iter }, k, 256));
}
const ITER = 100000;
async function crearSesion(env, uid) {
  const t = randomHex(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, datetime('now', ?3))").bind(await sha256(t), uid, `+${SESION_DIAS} days`).run();
  return t;
}
async function usuario(req, env) {
  const t = cookie(req, "mv_sid");
  if (!/^[0-9a-f]{64}$/.test(t)) return null;
  return env.DB.prepare("SELECT u.id, u.email, u.name, u.phone, u.ref_code, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > datetime('now')").bind(await sha256(t)).first();
}
async function demasiados(env, claves, max = MAX_INTENTOS) {
  const desde = Math.floor(Date.now() / 1000) - VENTANA_MIN * 60;
  for (const k of claves) {
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE k = ?1 AND ts > ?2").bind(k, desde).first();
    if (r && r.n >= max) return true;
  }
  return false;
}
const intento = (env, claves) => env.DB.batch(claves.map((k) => env.DB.prepare("INSERT INTO auth_attempts (k, ts) VALUES (?1, ?2)").bind(k, Math.floor(Date.now() / 1000))));
const DEMASIADOS = () => json({ error: "Demasiados intentos. Espera unos minutos y vuelve a probar." }, 429);

/* ---------------- puntos ---------------- */
const sumar = (env, uid, d, motivo) => env.DB.prepare("INSERT INTO points (user_id, delta, reason) VALUES (?1, ?2, ?3)").bind(uid, d, motivo).run();
function nivelDe(ganados) { let n = CAT.niveles[0]; for (const x of CAT.niveles) if (ganados >= x.desde) n = x; return n; }
const bonus = (nivel) => (nivel.id === "oro" ? 1.25 : nivel.id === "champan" ? 1.1 : 1);
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

/* ---------------- rutas ---------------- */
async function auth(req, env, url, ruta) {
  const b = await cuerpo(req);
  const ip = req.headers.get("cf-connecting-ip") || "0";
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
    const amiga = b.amiga ? await env.DB.prepare("SELECT id FROM users WHERE ref_code = ?1").bind(limpio(b.amiga, 8).toUpperCase()).first() : null;
    const salt = randomHex(16), h = await hashPass(pass, salt, ITER);
    let ref = codigo(6);
    while (await env.DB.prepare("SELECT 1 FROM users WHERE ref_code = ?1").bind(ref).first()) ref = codigo(6);
    const r = await env.DB.prepare("INSERT INTO users (email, name, phone, pass_hash, pass_salt, pass_iter, marketing, terms_at, ref_code, referred_by) VALUES (?1,?2,?3,?4,?5,?6,?7,datetime('now'),?8,?9)")
      .bind(em, nom, ph || null, h, salt, ITER, b.novedades === true ? 1 : 0, ref, amiga ? amiga.id : null).run();
    const uid = r.meta.last_row_id;
    await sumar(env, uid, CAT.club.bienvenida, "Bienvenida al club");
    if (amiga) await env.DB.batch([
      env.DB.prepare("INSERT INTO points (user_id, delta, reason) VALUES (?1, ?2, ?3)").bind(uid, CAT.club.amiga, "Vienes invitada por una amiga"),
      env.DB.prepare("INSERT INTO points (user_id, delta, reason) VALUES (?1, ?2, ?3)").bind(amiga.id, CAT.club.amiga, `Has invitado a ${nom.split(" ")[0]}`),
    ]);
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
  if (ruta === "borrar") {
    const u = await usuario(req, env);
    if (!u) return json({ error: "Inicia sesión." }, 401);
    await env.DB.batch(["sessions", "points", "rewards_used"].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(u.id))
      .concat([env.DB.prepare("UPDATE gift_cards SET user_id = NULL WHERE user_id = ?1").bind(u.id), env.DB.prepare("UPDATE orders SET user_id = NULL WHERE user_id = ?1").bind(u.id), env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(u.id)]));
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
    env.DB.prepare("SELECT code, amount_c, balance_c, to_name, design, created_at FROM gift_cards WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 10").bind(u.id).all(),
    env.DB.prepare("SELECT code, total_c, status, created_at FROM orders WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 10").bind(u.id).all(),
  ]);
  const nivel = nivelDe(s.ganados), sig = CAT.niveles.find((n) => n.desde > s.ganados) || null;
  return json({
    usuario: { nombre: u.name, email: u.email, socia: u.ref_code, desde: u.created_at },
    puntos: s.puntos, ganados: s.ganados, nivel, siguiente: sig,
    historial: hist.results, canjes: canjes.results, regalos: regalos.results, pedidos: pedidos.results,
  });
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
    const p = await ganarPorEuros(env, u.id, CAT.club.visitaDemo, "Visita al salón (demo)");
    return json({ ok: true, puntos: p });
  }
  return json({ error: "No encontrado" }, 404);
}

async function regalo(req, env, url, ruta) {
  if (req.method === "GET") {
    const c = limpio(ruta, 12).toUpperCase();
    if (!/^MVR-[A-Z0-9]{6}$/.test(c)) return json({ error: "Código no válido." }, 400);
    const g = await env.DB.prepare("SELECT code, amount_c, balance_c, to_name, from_name, design, created_at FROM gift_cards WHERE code = ?1").bind(c).first();
    return g ? json(g) : json({ error: "No encontramos esa tarjeta." }, 404);
  }
  const b = await cuerpo(req);
  const ip = req.headers.get("cf-connecting-ip") || "0";
  const imp = Number(b.importe);
  if (!Number.isInteger(imp) || imp < 10 || imp > 300) return json({ error: "Elige un importe entre 10 y 300 €." }, 400);
  const de = limpio(b.de, 40), para = limpio(b.para, 40), msg = limpio(b.mensaje, 160);
  if (!de || !para) return json({ error: "Escribe de quién es y para quién." }, 400);
  const dis = CAT.regalo.disenos.find((d) => d.id === b.diseno) ? b.diseno : "noir";
  if (await demasiados(env, [`gift:${ip}`], 10)) return DEMASIADOS();
  await intento(env, [`gift:${ip}`]);
  const u = await usuario(req, env);
  const c = "MVR-" + codigo(6);
  await env.DB.prepare("INSERT INTO gift_cards (code, amount_c, balance_c, from_name, to_name, message, design, user_id) VALUES (?1,?2,?2,?3,?4,?5,?6,?7)").bind(c, imp * 100, de, para, msg || null, dis, u ? u.id : null).run();
  const pts = u ? await ganarPorEuros(env, u.id, imp, `Tarjeta regalo para ${para}`) : 0;
  return json({ ok: true, codigo: c, importe: imp, puntos: pts }, 201);
}

async function pedido(req, env) {
  const b = await cuerpo(req);
  const ip = req.headers.get("cf-connecting-ip") || "0";
  const nom = limpio(b.nombre, 60), ph = tel(b.telefono);
  if (nom.length < 2 || !ph) return json({ error: "Escribe tu nombre y un teléfono válido." }, 400);
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 20).map((x) => ({ p: CAT.productos.find((p) => p.id === x.id), q: Math.max(1, Math.min(10, Math.floor(Number(x.q) || 0))) })).filter((x) => x.p);
  if (!items.length) return json({ error: "La cesta está vacía." }, 400);
  if (await demasiados(env, [`ord:${ip}`], 10)) return DEMASIADOS();
  await intento(env, [`ord:${ip}`]);
  const u = await usuario(req, env);
  const total = items.reduce((s, x) => s + x.p.precio * 100 * x.q, 0);
  const c = "MVP-" + codigo(5);
  await env.DB.prepare("INSERT INTO orders (code, user_id, name, phone, items, total_c) VALUES (?1,?2,?3,?4,?5,?6)").bind(c, u ? u.id : null, nom, ph, JSON.stringify(items.map((x) => ({ id: x.p.id, n: x.p.nombre, q: x.q, p: x.p.precio }))), total).run();
  return json({ ok: true, codigo: c, total: total / 100, puntos: u ? Math.round(total / 100) : 0 }, 201);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (!env.DB) return json({ error: "Base de datos no disponible." }, 503);
    const p = url.pathname.slice(5).split("/");
    try {
      if (req.method === "GET" && p[0] === "yo") return await yo(req, env);
      if (p[0] === "regalo" && req.method === "GET" && p[1]) return await regalo(req, env, url, p[1]);
      if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
      if (!mismoOrigen(req, url)) return json({ error: "Origen no permitido." }, 403);
      if (p[0] === "auth") return await auth(req, env, url, p[1]);
      if (p[0] === "club") return await club(req, env, p[1]);
      if (p[0] === "regalo") return await regalo(req, env, url, "");
      if (p[0] === "pedido") return await pedido(req, env);
      return json({ error: "No encontrado" }, 404);
    } catch (e) {
      if (e && (e.message === "json" || e.message === "grande")) return json({ error: "Datos no válidos." }, 400);
      console.error(e && e.stack);
      return json({ error: "Error del servidor. Inténtalo de nuevo." }, 500);
    }
  },
  async scheduled(_e, env) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM auth_attempts WHERE ts < ?1").bind(Math.floor(Date.now() / 1000) - 86400),
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
    ]);
  },
};
