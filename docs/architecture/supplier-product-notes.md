# Supplier/Product notes — 2026-10-06

## Modelo y migración

El modelo real usa `SupplierCapture` para borradores, `Supplier` para proveedores confirmados y `SupplierProduct` para productos. Los tres agregan `notes String?`, almacenado como TEXT nullable. No tiene default ni afecta validación de completitud, missingFields, estado o confirmación.

Migración: `prisma/migrations/20261006193000_supplier_product_notes/migration.sql`. Es aditiva: tres ADD COLUMN nullable, sin UPDATE ni reconstrucción de datos. El test de migración crea filas históricas antes de ejecutarla en tablas temporales de PostgreSQL local y comprueba notes=null. Se aplicó solamente en las bases aisladas nihao_agent_test y nihao_burst_test en 127.0.0.1:15436. **No se ejecutó en producción.**

Los DTO de Supplier, SupplierCapture y SupplierProduct exponen notes opcional/nullable para adaptadores/checkpoints históricos. Serialización Prisma, detalle, dashboard y adaptador file conservan las notas; ambos caminos de confirmación (agente y confirmación web existente) copian capture.notes a Supplier.notes. No se cambió frontend.

## Tools y selección de notas

`create_supplier_draft` y `create_product_draft` agregan notes nullable en sus argumentos. `update_supplier` y `update_product` lo agregan al patch y a clearFields. En el contrato wire todos los campos están requeridos, notes puede ser null; strict=true y additionalProperties=false se mantienen. La validación backend sigue admitiendo llamadas históricas sparse. Los mocks/fixtures públicos se actualizaron con notes=null para el nuevo wire contract.

Se agregó un solo párrafo a WHATSAPP_AGENT_PROMPT: preservar información útil sin campo propio en notes, usar evidencia FACTS asociada, no duplicar campos ni inferir variantes disponibles por el color de una fotografía. Modelo, reasoning, temperatura, extracción estructurada, thresholds, grouping, asociación de audio y retries permanecen iguales.

No se agregó notes a Tier1Data ni al schema de extracción comercial: no es un campo requerido para confirmar. El agente selecciona frases de las evidencias preparadas y las pasa en notes. Esto sirve para texto, transcripciones y texto visible/OCR que ya forme parte de esa evidencia. `assertGroundedNotes` valida cada frase contra FACTS usando `factualText`; CONTEXT no respalda las notas. Las descripciones visuales literales de productos verificados y asociados también respaldan notas de observación (por ejemplo “Vaso de vidrio amarillo”), sin autorizar claims comerciales como disponibilidad o personalización desde la descripción visual. Sólo admite una transformación acotada para disponibilidad: “Este viene en…” / “viene en…” → “Disponible en…”. Las demás frases deben ser extractos literales tras normalización de puntuación/case/acentos; no hace una paráfrasis semántica general.

Rechaza etiquetas/valores de MOQ, FOB, plazo, precio, email, teléfono, sitios y otros contactos para impedir que notes sea un contenedor paralelo. Valores iguales a nombres, ciudad, provincia, categoría/contactos ya extraídos se rechazan también. “Tiene fábrica propia y hace OEM” es una nota explícita válida, aunque supplierType pueda ser FACTORY: conserva información adicional de capacidad del fabricante.

## Merge, actualizaciones y trazabilidad

`lib/bot/notes.ts` centraliza parseNotes, assertGroundedNotes y mergeNotes. Límite 2048 caracteres, consistente con los slots nullableText de las tools. Overflow da error, nunca truncado silencioso.

mergeNotes compone frases/líneas: preserva texto anterior, agrega frases nuevas y elimina repetición exacta tras normalizar case, espacios y puntuación final. No deduplica equivalencia semántica ni reescribe listas. Ejemplo:

```text
Disponible en amarillo y rojo.
También disponible en azul.
```

Conserva la información de tres colores sin inventar una síntesis. No se sobrescriben notas válidas por un fragmento nuevo. Las correcciones que requieran retirar información previa deben usar el flujo explícito de borrado/aclaración y actualización, no una sustitución silenciosa. null en un patch strict es omisión; sólo clearFields=[notes] y notes=null representa borrado explícito. Un string vacío no permite que el agente borre notas accidentalmente.

El dominio aplica assertLoadWrite y autorización existentes a todas las escrituras. Asociación ambigua/carga incorrecta rechaza notes como cualquier otro dato. FACTS y sus offsets/IDs permanecen en argumentos del WhatsAppAgentOperation, sourceText y sourceEvidence existentes. El operationId incluye notes/patch y se conservan receipts, fencing, locks, recuperación e idempotencia.

Draft → update directo dentro del flujo actual. Confirmado → PROPOSED, propuesta enviada y aprobación explícita, versión vigente y aplicación existente. La propuesta muestra el texto compuesto que se aplicará, no solamente el fragmento nuevo. No se modificó la política de confirmación. get_supplier/get_product/search devuelven notes mediante los DTO existentes; los receipts de producto creado incluyen notes en data.fields. No se agregó un resumen obligatorio de notas.

## Replays

Tres fixtures públicos sintéticos (sin datos de clientes):

- M-product-notes: imagen vaso + audio exacto “Este viene en amarillo, rojo y azul.” como respuesta explícita a la imagen; notes=“Disponible en amarillo, rojo y azul.”.
- N-ambiguous-notes: vaso y martillo + “Este producto viene en amarillo, rojo y azul.”. Intenta escribir notes; el backend rechaza asociación ambigua, no crea producto y pide aclaración.
- O-product-notes-target: vaso y martillo + “El vaso viene en amarillo, rojo y azul.”. Vaso recibe notes; martillo.notes=null.

La referencia “Este viene…” sin quote no se interpreta automáticamente como “este producto” bajo las reglas actuales. Se conserva esa política: M usa metadata quotedMessageId que hace inequívoco el destino. No se añadió una excepción para notes ni se relajó asociación de audios.

Los tres escenarios corren en el harness completo con PostgreSQL y mocks/tapes; también se mantiene el replay offline capturado y el estrés de 34 assets existentes.

## Tests y validación

`whatsapp-notes.test.mts`: free text/nullable/límite; merge y duplicados; no duplicar estructurados ni inferir disponibilidad; schemas strict; DTO histórico sin notes; producto Vaso con tres colores; MOQ independiente; supplier fábrica/OEM; audio asociado; merge/duplicados/preservación en cambios ajenos; aprobación de notes en producto y proveedor confirmados; notas en draft; CONTEXT no autoriza; observaciones visuales no infieren disponibilidad; string vacío no borra; búsquedas históricas null; promoción e idempotencia; migración sobre filas históricas.

Además se agregaron los tres replays y se actualizaron mocks strict existentes para notes=null. Suite conjunta con los cambios de reconciliación: **451 tests, 451 pass, 0 fail, 0 skipped**, PostgreSQL sólo local. Prisma validate y typecheck OK; lint 0 errores y cuatro warnings de frontend preexistentes; git diff --check limpio.

## Límites y publicación

La deduplicación es textual y conservadora: paráfrasis distintas podrían acumularse hasta el límite, sin descartar información automáticamente. Los conflictos comerciales en texto libre requieren aclaración/corrección explícita. La selección de notes requiere que el agente pase la frase; los campos estructurados del extractor no se alteraron.

Antes de publicar este código debe aplicarse la migración en el entorno elegido: el código nuevo espera las columnas. Añadir columnas no rompe la versión anterior, pero el código nuevo no es compatible con una DB todavía sin migrar. **No push. No deploy. No migraciones de producción.**
