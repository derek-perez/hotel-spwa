import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { getHotelData } from './hotelData.js';

// OJO: el constructor de Anthropic() revienta de inmediato si apiKey viene
// vacío/undefined — y eso pasaba en el import de este archivo, es decir, al
// arrancar TODO el servidor (no solo al usar FAQs). Por eso se crea de forma
// perezosa (lazy) dentro de answerFaq, envuelto en try/catch: si falta la
// key, solo se cae la función de FAQs con un mensaje de respaldo, no el bot
// completo (cotizaciones y menú siguen funcionando normal).
let anthropic = null;
function getClient() {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return anthropic;
}

function buildSystemPrompt() {
  const data = getHotelData();

  const rooms = data.room_types
    .map((r) => {
      const rates = r.rates
        .map((rt) => `${rt.guests} huésped(es): ${typeof rt.price_mxn === 'number' ? `$${rt.price_mxn} MXN/noche` : rt.price_mxn}`)
        .join('; ');
      return `- ${r.name} (capacidad ${r.capacity}, ${r.beds}): ${rates}. Incluye: ${r.common_features.join(', ')}.`;
    })
    .join('\n');

  const amenities = data.general_amenities.map((a) => `- ${a.name}: ${a.description}`).join('\n');
  const highlights = data.location_highlights
    .map((h) => `- ${h.title} (${h.distance}): ${h.description}`)
    .join('\n');

  return `Eres el asistente virtual de WhatsApp de ${data.hotel_info.name}, un hotel en ${data.hotel_info.address.full_address}.

Tu única función es responder preguntas frecuentes sobre el hotel usando EXCLUSIVAMENTE la información de abajo. Tono: cálido, breve, profesional, en español de México. Nada de emojis en exceso (máximo uno por mensaje si aporta calidez).

DATOS DEL HOTEL:
Eslogan: ${data.hotel_info.slogan}
Check-in: ${data.hotel_info.policies.check_in} — Check-out: ${data.hotel_info.policies.check_out}
¿Acepta mascotas?: ${data.hotel_info.policies.pet_friendly ? 'Sí' : 'No'}
¿Factura?: ${data.hotel_info.policies.invoicing ? `Sí. ${data.hotel_info.policies.invoicing_note}` : 'No se ofrece facturación.'}

Habitaciones:
${rooms}

Amenidades generales:
${amenities}

Puntos de interés cercanos:
${highlights}

REGLAS ESTRICTAS:
1. Solo respondes preguntas sobre este hotel (habitaciones, tarifas base, amenidades, ubicación, políticas). Si preguntan algo fuera de ese tema, redirige amablemente sin sermonear.
2. NUNCA inventes información que no esté arriba (no inventes disponibilidad, promociones, precios distintos, ni políticas que no se mencionan).
3. Si preguntan el costo TOTAL de una estancia (varias noches, fechas específicas), NO calcules tú el total — solo puedes mencionar la tarifa por noche si está arriba. Dile al usuario que escriba "cotizar" para obtener el cálculo exacto con el bot de reservas.
4. Si preguntan por disponibilidad real para fechas específicas, o quieren reservar/pagar, indica que para eso deben escribir "cotizar" (para ver precio) y que la reserva final la confirma el equipo del hotel por este mismo chat.
5. Respuestas cortas: 2-4 líneas como máximo salvo que listen varias cosas (ahí usa líneas separadas, sin markdown de asteriscos raro — WhatsApp no lo renderiza bien, usa *texto* solo para negritas simples si hace falta).
6. Termina SIEMPRE invitando a seguir: algo breve tipo "¿Te ayudo con algo más? Escribe *cotizar* o *menú*."`;
}

let cachedSystemPrompt = null;
function getSystemPrompt() {
  if (!cachedSystemPrompt) cachedSystemPrompt = buildSystemPrompt();
  return cachedSystemPrompt;
}

const FALLBACK_MESSAGE =
  'Ahora mismo no puedo responder esa pregunta 🙏. Puedes escribir *menú* para ver las opciones, o *cotizar* para ver tarifas y disponibilidad.';

export async function answerFaq(question) {
  try {
    const response = await getClient().messages.create({
      model: config.anthropic.model,
      max_tokens: 400,
      system: getSystemPrompt(),
      messages: [{ role: 'user', content: question }],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return text || FALLBACK_MESSAGE;
  } catch (err) {
    console.error('❌ Error consultando Claude API:', err.message);
    return FALLBACK_MESSAGE;
  }
}
