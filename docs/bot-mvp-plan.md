# Nihao Bot — plan del MVP

## Alcance funcional

El bot es un flujo de captura estructurada de proveedores para uso mobile durante ferias. Tier 1 comprende empresa, ubicación, contacto, categoría, tipo de proveedor, FOB, MOQ, lead time e interés. La categoría es la única pregunta que debe contestarse explícitamente; “No sé todavía” es una respuesta válida y deja el campo pendiente.

La confirmación muestra todos los datos y la corrección actúa sobre un único campo. Lead time se guarda también normalizado a días; FOB conserva monto, moneda y unidad; MOQ conserva cantidad, unidad y aclaraciones.

## Iteración 1

La ruta `/demo/captura` implementa el flujo mobile-first, confirmación por campo y comparación básica. Los registros se guardan en `localStorage` para validar la experiencia, sin considerarlo persistencia definitiva.

## Iteración 2 — núcleo del bot

La fuente de verdad dejó de ser el navegador. El flujo de `/demo/captura` ahora es:

```text
nota de texto → adaptador de extracción → borrador server-side → revisión/corrección por campo → confirmación → proveedor confirmado
```

El modelo normalizado contempla `User`, `Trip`, `Supplier`, `SupplierContact`, `SupplierCapture` y `SupplierAttachment`. Cada captura y proveedor se vincula explícitamente con `userId` y `tripId`; no hay un supuesto de usuario o viaje único. `Supplier` conserva los valores Tier 1, estado (`DRAFT`/`CONFIRMED`), pendientes y timestamps. FOB conserva monto, moneda, unidad y texto crudo; MOQ conserva cantidad, unidad, notas y texto crudo; lead time conserva el texto y días normalizados.

### Extracción

`SupplierExtractionAdapter` define el contrato para texto, tarjeta/imagen y transcripción de audio. En esta iteración sólo se activa `DevelopmentTextExtractionAdapter`: es un extractor determinista, pequeño y de demostración para el pipeline; no es IA ni OCR y no intenta reemplazarlos. El punto de integración para un proveedor de IA/OCR futuro está aislado detrás del adaptador, sin API keys ni acoplamiento de UI.

Para evitar transformar la captura móvil en un cuestionario, el motor muestra todos los pendientes pero pregunta activamente sólo categoría e interés. La categoría debe completarse o marcarse explícitamente como “No sé”; otros campos pueden quedar pendientes. Un “No sé” se guarda como pendiente reconocido y no se vuelve a preguntar.

### Persistencia de desarrollo

`FileSupplierCaptureRepository` guarda JSON en `.data/nihao-bot.json`, por detrás de `SupplierCaptureRepository`. Implementa drafts, corrección de un único campo, confirmación idempotente y aislamiento por usuario/viaje. Es una implementación local y reversible para desarrollo/piloto: **no es una persistencia productiva válida en Vercel/serverless**, porque el filesystem de una función no es compartido ni durable. La próxima infraestructura deberá implementar la misma interfaz sobre una base de datos gestionada, con autenticación real como fuente de `userId`.

### Endpoints internos del demo

- `POST /api/bot/extractions`: valida texto, extrae y crea un draft.
- `GET /api/bot/captures?tripId=`: lista capturas del viaje accesible para la sesión actual.
- `PATCH /api/bot/captures/:captureId`: persiste una corrección tipada de un campo.
- `POST /api/bot/captures/:captureId/confirm`: confirma el draft y materializa proveedor/contacto.

Los IDs enviados desde el demo son un contexto de desarrollo. Antes de producción deben provenir de autenticación y autorización de servidor.

## Iteración 3 — arquitectura de producción preparada

La arquitectura productiva quedó preparada para PostgreSQL estándar en Railway mediante Prisma 7 y autenticación/sesiones con Better Auth. Los endpoints productivos `/api/bot/*` nunca aceptan un `userId` del navegador: resuelven el usuario con la sesión y verifican membresía `TripMember` antes de consultar, corregir o confirmar una captura. La demo permanece separada en `/api/demo/bot/*` y conserva un contexto fijo exclusivamente en el servidor.

`prisma/schema.prisma` y `prisma/migrations/` son la fuente de verdad de datos. El adaptador JSON sigue disponible para tests, debugging y demo local; no se utiliza como persistencia productiva. Los objetos futuros se modelan como `SupplierAttachment`, mientras que `StorageProvider` y `R2S3StorageProvider` mantienen los blobs fuera de PostgreSQL. El smoke productivo reproducible es `pnpm smoke:production`, con el servidor local iniciado; usa datos aleatorios y los limpia al finalizar.

La guía completa de operación, infraestructura, modelo de datos y decisiones está en `docs/architecture/` y `docs/development/`.

## Evolución prevista

1. Elegir e implementar un adaptador de base de datos gestionada y autenticación real.
2. Integrar un proveedor de extracción IA/OCR en un adaptador nuevo, con evaluación y observabilidad.
3. Agregar imagen/tarjeta y transcripción de audio sobre el mismo contrato.

WhatsApp, geolocalización, Tier 3 e informes sofisticados quedan fuera del MVP actual.

## Iteración 3.1 — infraestructura real validada

Railway PostgreSQL, Prisma migrate status, Better Auth, sesiones, membresía/autorización, persistencia de proveedor/contacto y R2 privado fueron validados mediante el smoke productivo. Los datos y objetos temporales se eliminaron.

## Iteración 4 — UX productiva

La experiencia productiva está separada de `/demo`: registro/login con Better Auth, home de viajes, creación de viaje con membresía atómica, listado de proveedores, captura Tier 1, corrección previa a confirmar y ficha reabrible. Business cards y fotos de producto se suben al servidor con progreso y preview; el servidor aplica autorización y límites, guarda el objeto en R2 y la metadata en `SupplierAttachment`. Las imágenes se muestran con URL firmada breve.

La extracción continúa siendo únicamente el adapter determinista de texto. No hay OCR, visión, audio ni modelo de IA. La próxima iteración recomendada es implementar un adapter multimodal detrás de `ExtractionService`, con evaluación y estados explícitos de extracción, usando la business card ya persistida como entrada.

## Iteración 5A — preparación de extracción multimodal

Se incorpora una interfaz `ExtractionProvider`, un schema tipado para salida estructurada y merge de business card + texto que no resuelve contradicciones en silencio. GPT-4o mini queda elegido para la integración futura; no se agrega SDK, API key ni llamadas a un modelo en esta iteración.
