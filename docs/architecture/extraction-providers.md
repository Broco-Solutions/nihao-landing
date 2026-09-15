# Proveedores de extracción — Iteración 5A

## Estado

No hay integración de IA, SDK ni llamadas externas en esta iteración. `ExtractionProvider` es una frontera de TypeScript que mantiene el adapter determinista actual y permite sumar un proveedor remoto sin acoplarlo a Prisma, R2, rutas HTTP o UI.

`SupplierExtractionService.extractMany` acepta texto y business card. El merge conserva un valor sólo cuando las fuentes coinciden después de normalizarlo; ante una contradicción significativa no elige un ganador: borra el valor automático, lo agrega a `reviewFields` y expone `sourceConflicts` para que la UI pida confirmación.

## Proveedor elegido para la próxima integración

Se eligió **OpenAI GPT-4o mini** como primera opción: acepta entradas de texto e imagen y soporta Structured Outputs. Su precio publicado al preparar este documento es USD 0,15 por millón de tokens de entrada y USD 0,60 por millón de salida. Es suficiente para extraer campos focalizados de una tarjeta y texto de feria, y mantiene el coste de piloto bajo. [Documentación oficial del modelo](https://developers.openai.com/api/docs/models/gpt-4o-mini).

La clave futura es `OPENAI_API_KEY`, documentada vacía en `.env.example`; no se lee ni se requiere todavía. El modelo se inyectará por constructor en el provider, para poder cambiarlo sin modificar `SupplierExtractionService`. No se incorpora el paquete `openai` hasta la iteración de integración.

## Schema y coste

`SUPPLIER_EXTRACTION_JSON_SCHEMA` prepara company, ciudad/provincia, contacto separado (nombre/email/teléfono/WeChat), tipo, FOB, MOQ, lead time, categoría, interés, evidencia y las listas detected/review/missing. El provider futuro debe enviar sólo la tarjeta seleccionada y la nota pertinente, usar un output acotado y no reintentar automáticamente ante respuestas inválidas. Los errores se muestran como recuperables y se conserva el flujo manual Tier 1.

Para cambiar de proveedor, se implementa el mismo `ExtractionProvider`, se traduce su respuesta al schema tipado y se registra donde hoy se construye `SupplierExtractionService`. Los tests usan un provider mock y no dependen de red ni API key.
