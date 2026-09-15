# Proveedores de extracción — Iteración 5B

## Estado

El core continúa dependiendo únicamente de `ExtractionProvider`. El primer adapter real es `MistralExtractionProvider`, server-side e inyectable: no se registra como fallback, no cambia el adapter determinista de demo y no acopla `SupplierExtractionService` a Mistral, Prisma ni R2.

`SupplierExtractionService.extractMany` acepta texto y business card. El merge conserva un valor sólo cuando las fuentes coinciden después de normalizarlo; ante una contradicción significativa no elige un ganador: borra el valor automático, lo agrega a `reviewFields` y expone `sourceConflicts` para que la UI pida confirmación.

## Provider y flujo

Texto libre usa **Mistral Small 4** (`mistral-small-2603`) y `/v1/chat/completions` con JSON Schema. Una `BUSINESS_CARD` privada se resuelve desde R2 mediante `StorageBusinessCardResolver`, se entrega como data URL al OCR y usa **Mistral OCR 4.1** (`mistral-ocr-4-1`) y `/v1/ocr` con anotación JSON Schema.

El provider valida de nuevo la salida con `parseSupplierExtractionStructuredOutput`. Una salida inválida, un error HTTP o un timeout nunca generan datos parciales inventados. Para una tarjeta sólo se permite retornar empresa, contacto, ciudad y provincia; el texto habilita además tipo, FOB, MOQ, lead time, categoría e interés cuando hay evidencia explícita.

## Schema, seguridad y coste

`SUPPLIER_EXTRACTION_JSON_SCHEMA` prepara company, ciudad/provincia, contacto separado (nombre/email/teléfono/WeChat), tipo, FOB, MOQ, lead time, categoría, interés, evidencia y las listas detected/review/missing. `detectedFields` sin evidencia se convierte en `reviewFields`; los datos no presentes quedan como `missingFields` al pasar por `SupplierExtractionService`. Si texto y tarjeta discrepan, el merge no elige silenciosamente: vacía el valor y exige revisión. Llamadas simultáneas para la misma fuente se deduplican sólo mientras están en curso.

La única variable es `MISTRAL_API_KEY`, vacía en `.env.example` y leída exclusivamente por `createMistralExtractionProviderFromEnvironment`. La autorización ocurre antes de invocar el provider; el resolver sólo lee metadata y un objeto privado de R2, sin emitir URL pública ni exponer la key. El coste se limita enviando una tarjeta o nota por operación, output acotado, temperatura cero y sin reintentos automáticos. Antes de producción, consultar el precio vigente en [Mistral pricing](https://mistral.ai/pricing/) y fijar límites por usuario/viaje.

Para cambiar de provider, implementar el mismo `ExtractionProvider`, traducir la respuesta al schema tipado, validarla con `parseSupplierExtractionStructuredOutput` y convertirla en `ExtractionCandidate`. La composición server-side selecciona un único provider; core, merge y UI no cambian. Los tests inyectan `MistralHttpClient` y `BusinessCardResolver` mock, sin red, R2 ni API key.
