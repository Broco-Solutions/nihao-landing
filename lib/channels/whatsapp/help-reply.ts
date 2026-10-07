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
    "- 🔎 Las búsquedas de proveedores guardados se hacen en la web.",
    "- ✅ La revisión, corrección y confirmación se hacen en la web.",
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
- ✏️ Corregir borradores y proponer cambios en datos confirmados.

Tené en cuenta:

- 📋 Los nuevos proveedores y productos quedan como borradores para revisar y confirmar en la web.
- ✅ Antes de cambiar datos confirmados, te muestro el cambio y pido tu aprobación.
- 🚫 No invento datos faltantes: quedan pendientes para completar.

Para empezar:

- 📲 Mandame textos, fotos o audios, o decime qué querés consultar.`;
}
