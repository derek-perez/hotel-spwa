# Chatbot de WhatsApp — Hotel Posada Cocomacan

Bot que atiende el WhatsApp del hotel: hace cotizaciones automáticas (tipo de
habitación, huéspedes, fechas → precio calculado) y responde preguntas
frecuentes usando la misma información que ya vive en `../hotel-data.json`.

**Qué SÍ hace:** cotizar con precio exacto, responder FAQs, y avisar al
equipo cuando alguien quiere reservar.
**Qué NO hace (todavía):** no confirma disponibilidad real, no cobra, no
tiene panel de administración. Eso es la fase 2 (el sistema centralizado del
que hablaron tus jefes). El diseño de este bot ya deja la puerta abierta
para ese salto — ver "Camino a fase 2" al final.

## ⚠️ Antes de publicar: un punto operativo importante

Al conectar el número del hotel a la API de WhatsApp Cloud (Meta), ese
número queda controlado por la API, **no** por la app de WhatsApp Business
del celular. En la práctica esto significa que el personal de recepción ya
no puede simplemente abrir WhatsApp en su teléfono y contestar como antes
desde ese mismo número — hay que usar el "Administrador de WhatsApp Business"
de Meta (business.facebook.com) o una herramienta que se conecte a la Cloud
API para que un humano tome la conversación cuando el bot dice "un miembro
del equipo te contactará".

Antes de dar de alta el número real del hotel, decide con tus jefes:
1. Si van a usar un número **nuevo** dedicado al bot (más simple, no toca el
   número que ya usan a diario), o
2. Si van a migrar el número actual (revisa primero si tu región tiene
   habilitado el modo "coexistencia" de Meta, que si acaso permite seguir
   usando la app de celular en paralelo — no está disponible en todos lados).

## Requisitos

- Node.js 18+
- Cuenta de [Meta for Developers](https://developers.facebook.com/) con una
  App de tipo "Business" y el producto **WhatsApp** agregado
- Una API key de [Anthropic](https://platform.claude.com/) (Claude API)
- Cuenta en [Render](https://render.com/) para desplegar

## 1. Configurar Meta / WhatsApp Cloud API

1. Ve a [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Crear app** → tipo "Business".
2. Dentro de la app, agrega el producto **WhatsApp**.
3. En **WhatsApp → API Setup** verás un número de prueba gratuito para
   desarrollo, y ahí mismo el **Phone Number ID** (`WHATSAPP_PHONE_NUMBER_ID`)
   y un token temporal (24h). Para producción, genera un **token
   permanente**: Business Settings → System Users → crea un system user →
   asígnale la app → genera token con permiso `whatsapp_business_messaging`.
4. En **Configuración básica de la App** copia el **App Secret**
   (`WHATSAPP_APP_SECRET`) — con esto se valida que los webhooks realmente
   vengan de Meta.
5. Inventa un valor secreto para `WHATSAPP_VERIFY_TOKEN` (cualquier string
   que tú elijas) — lo vas a usar en el paso 4 de despliegue.
6. Cuando tengas listo el número definitivo del hotel, se registra en
   **WhatsApp → API Setup → Add phone number** (requiere verificar el
   negocio ante Meta si no lo has hecho — esto puede tardar 1-3 días
   hábiles, así que arráncalo con tiempo).

## 2. Variables de entorno

Copia `.env.example` a `.env` y llena los valores:

```bash
cp .env.example .env
```

## 3. Correr en local (para probar antes de desplegar)

```bash
npm install
npm test      # corre las pruebas del motor de cotización y fechas
npm run dev
```

> Nota: el `package.json` fija `@anthropic-ai/sdk` a una versión reciente
> conocida al momento de escribir esto. Si `npm install` te sugiere una
> versión más nueva o quieres estar al día, corre
> `npm install @anthropic-ai/sdk@latest` sin miedo — la API de `messages.create`
> que usa `faqEngine.js` es estable entre versiones.

Como Meta necesita una URL pública con HTTPS para mandar los webhooks, usa
[ngrok](https://ngrok.com/) mientras pruebas en tu máquina:

```bash
ngrok http 3000
```

Copia la URL de ngrok (`https://algo.ngrok-free.app`) y úsala como Callback
URL en el paso 4, apuntando a `/webhook`.

## 4. Desplegar en Render

1. Sube este repo a GitHub (ya está — `hotel-spwa`).
2. En Render: **New → Web Service** → conecta el repo `hotel-spwa`.
3. **Root Directory:** `whatsapp-bot`
4. **Build Command:** `npm install`
5. **Start Command:** `npm start`
6. En **Environment**, agrega todas las variables de `.env.example` con sus
   valores reales (¡nunca subas tu `.env` real a GitHub — ya está en
   `.gitignore`!).
7. Deploy. Render te da una URL tipo `https://hotel-cocomacan-bot.onrender.com`.

## 5. Conectar el webhook en Meta

1. En tu app de Meta: **WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL:** `https://<tu-app>.onrender.com/webhook`
3. **Verify token:** el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN`.
4. Click **Verify and save** (si falla, revisa que el servidor esté arriba
   y que el token coincida exactamente).
5. En **Webhook fields**, suscríbete al campo **messages**.

Listo — a partir de aquí, cualquier mensaje que le escriban al número del
hotel lo procesa el bot.

## Nota sobre el plan gratuito de Render

El tier free de Render "duerme" el servicio tras ~15 min sin tráfico y tarda
unos segundos en despertar con el siguiente mensaje. Para un hotel boutique
con volumen bajo de mensajes esto es aceptable (el primer mensaje del día
puede tardar un poco más en contestarse), pero si notan que se siente lento,
vale la pena subir al plan pagado ($7 USD/mes aprox.) que mantiene el
servicio siempre activo.

También implica que las sesiones de conversación en memoria (`sessionStore.js`)
se reinician si el servicio duerme o se redespliega — el usuario simplemente
vuelve a ver el menú principal, no se pierde nada crítico porque el bot no
confirma reservas por sí mismo.

## Estructura del código

```
src/
  server.js              Express: verificación de webhook + recepción de mensajes
  config.js              Variables de entorno centralizadas
  hotelData.js           Lee ../hotel-data.json (misma fuente que usa el sitio)
  whatsappClient.js       Envío de mensajes vía Graph API (texto, listas, botones)
  sessionStore.js         Sesión de conversación en memoria por número
  conversationEngine.js   Máquina de estados: menú → cotización → resumen
  quoteEngine.js          Cálculo de precio (noches × tarifa según huéspedes)
  faqEngine.js            Preguntas libres respondidas con Claude API
  dateUtils.js            Parseo/validación de fechas en español
test/
  logic.test.js           Pruebas del motor de cotización y fechas
```

## Camino a fase 2 (el sistema centralizado)

Cuando llegue el momento del motor de reservas completo con pagos y panel de
administrador, este bot no se tira: `quoteEngine.js` y `hotelData.js` se
reutilizan tal cual, `sessionStore.js` se cambia por una base de datos real
(para llevar reservas, no solo sesiones de chat), y `conversationEngine.js`
se conecta a esa base de datos en vez de solo generar un mensaje de "el
equipo te contactará". El webhook y la integración con Meta ya quedan
resueltos desde ahora.
