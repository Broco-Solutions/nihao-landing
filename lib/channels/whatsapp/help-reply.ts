/** Recognize greetings without treating supplier data introduced with “hola” as help. */
export function isWhatsAppGreeting(text: string): boolean {
  return /^[¡!¿?\s]*hola(?:\s+nihao)?[\s,.!¡?¿👋]*$/iu.test(text);
}

/** Shared verbatim help copy for both WhatsApp processors. */
export function whatsappHelpReply(): string {
  return [
    "Hola, soy Nihao 👋",
    "",
    "Por WhatsApp puedo ayudarte a:",
    "",
    "- 📝 Cargar datos de proveedores por texto, foto o audio.",
    "- 📸 Leer fotos de tarjetas y productos.",
    "- 📋 Crear borradores para revisar en la web.",
    "",
    "Tené en cuenta:",
    "",
    "- 🔎 Las búsquedas de proveedores guardados se hacen en la web de Nihao.",
    "- ✅ La revisión, corrección y confirmación se hacen en la web de Nihao.",
    "- 🚫 No invento datos faltantes: quedan pendientes para completar.",
    "",
    "Para empezar:",
    "",
    "- 📲 Mandame textos, fotos o audios.",
  ].join("\n");
}

/** v3 copy: legacy processors keep their original capability description. */
export function whatsappAgentHelpReply(): string {
  return `Hola, soy Nihao 👋

Por WhatsApp puedo ayudarte a:

- 📝 Cargar proveedores y productos por texto, foto o audio.
- 📸 Leer fotos de tarjetas y productos.
- 🔎 Consultar proveedores y productos guardados.
- ✏️ Corregir datos del recurso identificado, conservando evidencia e historial.

Tené en cuenta:

- 📋 Cuando la evidencia alcanza, el servidor confirma la carga; los datos incompletos quedan pendientes para revisar en la web.
- ✅ Las correcciones explícitas se aplican al recurso autorizado; si hay una propuesta pendiente, necesita tu respuesta.
- 🚫 No invento datos faltantes: quedan pendientes para completar.
- 🧩 Respondo cada pedido y te indico qué parte requiere aclaración, no está disponible o no se relaciona con Nihao.
- 🖼️ Si una foto no se entiende, pido sólo la evidencia necesaria. Podés mandar frente y dorso juntos.
- 🎥 No acepto videos: mandá fotos, texto o audio.
- ⏳ Agrupo mensajes tras cinco segundos de silencio; podés escribir listo al terminar.

Para empezar:

- 📲 Mandame textos, fotos o audios, o decime qué querés consultar.`;
}
