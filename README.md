# Salón Marta Vega · web demo (Agencia JS)

Maqueta premium de peluquería: reservas reales con el asistente de Agencia JS, probador de color, club de puntos con cuenta de clienta, tarjetas regalo, tienda y merchandising, campaña y PWA instalable.

| Pieza | Dónde |
|---|---|
| Web (estática) | `public/` (HTML, CSS, JS, imágenes WebP, fuentes propias) |
| API del club, regalo y tienda | `worker.js` (rutas `/api/*`) |
| Base de datos | D1 `marta-vega` (esquema en `schema.sql`) |
| Catálogo (servicios, productos, premios, campaña) | `public/catalogo.json` (lo usan la web y la API) |
| Citas y chat | Asistente `demo-peluqueria` de agencia-js.com (panel: agencia-js.com/panel/demo-peluqueria) |
| Panel del salón | `/panel` (clave demo: `demo-martavega`; en producción, secreto `SALON_CLAVE_HASH`) |
| Correos (bienvenida, contraseña, tarjeta regalo, cumpleaños) | Secreto `BREVO_API_KEY` en el Worker (remitente info@agencia-js.com) |
| Pagos | Pasarela de prueba al estilo Stripe (tarjetas 4242…, 4000…0002, 4000…9995). Para cobrar de verdad: Stripe Checkout + webhook |
| Imágenes | `public/img/fuentes.txt` → Action «Imágenes» las convierte a WebP y crea la máscara del probador |

Seguridad: contraseñas con PBKDF2 (100.000 iteraciones), sesión en cookie HttpOnly + Secure + SameSite, límite de intentos, comprobación de origen en los POST y precios calculados siempre en el servidor. Pagos de tarjeta regalo y tienda: simulados (demo).
