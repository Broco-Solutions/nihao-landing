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

/** Agent (v3) copy; the legacy processor keeps whatsappHelpReply because it cannot run queries. */
export function whatsappAgentHelpReply(): string {
  return `Hola, soy Nihao 👋

Por WhatsApp puedo:

- 📝 Cargar proveedores y productos por texto, foto o audio.
- 📸 Leer tarjetas y fotos de productos (podés mandar frente y dorso juntos).
- 🔎 Buscar proveedores y productos guardados, por ejemplo: "pasame todos los proveedores de Ningbo".
- ✏️ Corregir un dato: "cambiá el teléfono de LEOCH a +86 138...".

Tené en cuenta:

- 🧩 Si mandás varios pedidos juntos, respondo cada uno y te digo cuál necesita una aclaración.
- 🚫 No invento datos: lo que falte queda pendiente para completar en la web.
- 🎥 Por ahora no acepto videos: mandá fotos, texto o audio.
- ⏳ Espero unos segundos de silencio antes de responder; podés escribir "listo" al terminar.

Para empezar, mandame lo que tengas o decime qué querés consultar.`;
}
