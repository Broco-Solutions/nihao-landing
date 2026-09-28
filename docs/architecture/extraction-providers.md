# Proveedores de extracción — Iteración 5C

## Estado

El core continúa dependiendo únicamente de `ExtractionProvider`. `MistralExtractionProvider` está conectado al handler productivo, server-side e inyectable; demo conserva el adapter determinista y no hay acoplamiento de `SupplierExtractionService` a Mistral, Prisma ni R2.

`SupplierExtractionService.extractMany` acepta texto, business cards y transcripts de audio. El merge conserva un valor sólo cuando las fuentes coinciden después de normalizarlo; ante una contradicción significativa no elige un ganador: borra el valor automático, lo agrega a `reviewFields` y expone `sourceConflicts` para que la UI pida confirmación.

## Provider y flujo

Texto libre usa **Mistral Small 4** (`mistral-small-2603`) y `/v1/chat/completions` con JSON Schema. Una `BUSINESS_CARD` privada se resuelve desde R2 mediante `StorageBusinessCardResolver`, se entrega como data URL al OCR y usa **Mistral OCR 4.1** (`mistral-ocr-4-1`) y `/v1/ocr` con anotación JSON Schema.

El provider valida de nuevo la salida con `parseSupplierExtractionStructuredOutput`. Una salida inválida, un error HTTP o un timeout nunca generan datos parciales inventados. Para una tarjeta sólo se permite retornar empresa, contacto, ciudad y provincia; el texto habilita además tipo, FOB, MOQ, lead time, categoría e interés cuando hay evidencia explícita.

## Schema, seguridad y coste

`SUPPLIER_EXTRACTION_JSON_SCHEMA` prepara company, ciudad/provincia, contacto separado (nombre/email/teléfono/WeChat), tipo, FOB, MOQ, lead time, categoría, interés, evidencia y las listas detected/review/missing. `detectedFields` sin evidencia se convierte en `reviewFields`; los datos no presentes quedan como `missingFields` al pasar por `SupplierExtractionService`. Si texto y tarjeta discrepan, el merge no elige silenciosamente: vacía el valor y exige revisión. Llamadas simultáneas para la misma fuente se deduplican sólo mientras están en curso.

La única variable es `MISTRAL_API_KEY`, vacía en `.env.example` y leída exclusivamente por `createMistralExtractionProviderFromEnvironment`. `POST /api/bot/extractions` compone sesión → `TripMember` → captura propia → adjuntos de esa captura → resolver R2 privado → provider → `extractMany` → Tier 1. No acepta URLs del cliente ni expone la key. Cada operación permite seleccionar hasta tres tarjetas y tres notas de voz; se pueden almacenar más evidencias y analizarlas en otra operación. El output es acotado, temperatura cero y no hay reintentos automáticos.

## Audio

`AUDIO` usa el mismo upload autenticado, R2 privado y metadata de `SupplierAttachment`; acepta WebM, M4A/MP4, MP3, WAV y OGG hasta 25 MB. Sólo después de comprobar sesión, `TripMember`, captura propia y pertenencia del adjunto, `AttachmentTranscriptionService` lee R2 y llama a `MistralTranscriptionProvider` (`voxtral-mini-latest`, que resuelve Voxtral Mini Transcribe 2). Cada audio conserva su transcript, modelo y timestamp; una transcripción persistida se reutiliza y las solicitudes simultáneas se deduplican en proceso. Hasta tres audios pueden participar en el mismo merge como `AUDIO_TRANSCRIPT`; nunca confirman automáticamente.

Un error, timeout o respuesta inválida devuelve un error reintentable y deja el draft sin confirmar. La UI muestra “Analizando…”, precarga detectados, destaca `review` y mantiene categoría/interés como preguntas activas cuando faltan. La extracción sólo reemplaza un draft del mismo autor; las correcciones humanas persistidas tienen prioridad sobre una extracción posterior. Al borrar una tarjeta o audio que participó de la última propuesta, `needsReanalysis` bloquea la confirmación hasta actualizarla.

Smoke 2026-09-15: la clave estaba disponible en `.env.local`; el endpoint real de texto alcanzó Mistral Small 4 pero respondió HTTP 429, por lo que no se hizo una segunda llamada ni OCR real para evitar tráfico innecesario. Pendiente: cuota disponible para validar OCR con una tarjeta ficticia segura y, más adelante, transcripción de audio.

Para cambiar de provider, implementar el mismo `ExtractionProvider`, traducir la respuesta al schema tipado, validarla con `parseSupplierExtractionStructuredOutput` y convertirla en `ExtractionCandidate`. La composición server-side selecciona un único provider; core, merge y UI no cambian. Los tests inyectan `MistralHttpClient` y `BusinessCardResolver` mock, sin red, R2 ni API key.
