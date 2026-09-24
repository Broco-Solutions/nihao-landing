# Nihao MVP — Estado y plan de UAT

Este documento es la fuente operativa para estabilizar el MVP. Distingue lo
construido de lo validado realmente, especialmente en teléfono físico. Una
capacidad no se considera validada sólo porque exista código o una prueba local.

## Leyenda de estados

| Estado | Significado |
| --- | --- |
| **IMPLEMENTED** | La capacidad está construida, pero aún puede requerir UAT real. |
| **VALIDATED** | Fue comprobada mediante UAT o smoke real en el contexto indicado. |
| **PENDING UAT** | La prueba todavía debe ejecutarse. |
| **BLOCKED** | No puede avanzar hasta resolver una dependencia o defecto. |
| **FUTURE / POST-MVP** | Queda fuera del alcance de estabilización del MVP. |

# Estado

## Referencia de release

| Referencia | Descripción |
| --- | --- |
| `3e6d817` | `merge: integrate staging release candidate into develop` |
| `9fd4f36` | `feat: send trip invitations by email` |
| `1053acf` | `fix: show capture editor inline` |
| HEAD actual de STAGING | `1053acf70f282f75c356cbcb65a80bb29d47421e` |

La rama operativa es `develop`. Producción no está autorizada ni desplegada para
esta etapa.

## Estado funcional actual

| Área | Estado | Nota operativa |
| --- | --- | --- |
| Desarrollo funcional MVP | **IMPLEMENTED** | El alcance funcional actual está construido. |
| Infraestructura STAGING | **VALIDATED** | Entorno de UAT disponible. |
| Auth, roles, invitaciones y onboarding | **VALIDATED** | Bloque 1 de UAT completado. |
| Captura online | **PENDING UAT** | UAT en progreso; texto y corrección humana validados. |
| Captura TEXT por WhatsApp | **VALIDATED** | Transporte, binding y captura DRAFT real end-to-end validados en STAGING. |
| Business card por WhatsApp | **IMPLEMENTED / PENDING UAT** | IMAGE crea DRAFT independiente, adjunto R2 y OCR existente. |
| Audio por WhatsApp | **IMPLEMENTED / PENDING UAT** | AUDIO crea DRAFT independiente, transcripción existente y extracción. |
| Captura offline | **IMPLEMENTED / PENDING PHYSICAL UAT** | Requiere prueba física de conectividad. |
| Dashboard Traveler | **IMPLEMENTED / PENDING FINAL UAT** | Requiere validación operacional final. |
| Dashboard Admin | **IMPLEMENTED / PENDING FINAL UAT** | Requiere validación operacional final. |
| Reportes y comparación de proveedores | **IMPLEMENTED / PENDING FINAL UAT** | Requiere validación operacional final. |
| Producción | **NOT AUTHORIZED / NOT DEPLOYED** | No tocar sin autorización explícita. |

El MVP funcional ya está construido. El proyecto está en **UAT /
stabilization**, no en desarrollo de nuevas funcionalidades.

# UAT completado

## BLOQUE 1 — AUTH, ROLES, INVITATIONS Y ONBOARDING

**Estado del bloque: COMPLETO ✅**

### UAT-AUTH-01 — Acceso mobile a STAGING

- **Estado:** PASS / **VALIDATED**
- **Objetivo:** comprobar acceso desde teléfono a STAGING.
- **Pasos realizados:** abrir el frontend de STAGING desde un teléfono.
- **Resultado esperado:** la pantalla pública carga y permite continuar al login.
- **Resultado real:** acceso mobile a STAGING validado.
- **Severidad si falla:** BLOCKER.

### UAT-AUTH-02 — Cuenta ADMIN utilizable

- **Estado:** PASS / **VALIDATED**
- **Objetivo:** disponer de una cuenta ADMIN para UAT en STAGING.
- **Pasos realizados:** identificar una cuenta de STAGING con membresía ADMIN.
- **Resultado esperado:** existe una cuenta utilizable sin exponer credenciales.
- **Resultado real:** cuenta ADMIN disponible y utilizable.
- **Severidad si falla:** BLOCKER.

### UAT-AUTH-03 — Login ADMIN y persistencia de sesión

- **Estado:** PASS / **VALIDATED**
- **Objetivo:** validar login ADMIN y persistencia luego de refresh.
- **Pasos realizados:** iniciar sesión como ADMIN, entrar a la app y refrescar.
- **Resultado esperado:** la sesión permanece activa en la aplicación.
- **Resultado real:** login correcto; refresh mantiene la sesión.
- **Severidad si falla:** BLOCKER.

### UAT-AUTH-04 — Sesión contra backend

- **Estado:** PASS / **VALIDATED**
- **Objetivo:** confirmar sesión autenticada entre frontend y backend.
- **Pasos realizados:** revisar los endpoints de sesión y trips desde el flujo
  autenticado del frontend.
- **Resultado esperado:** ambos endpoints responden autenticados, sin 5xx.
- **Resultado real:** `/api/auth/get-session` devuelve `200` autenticado y
  `/api/bot/trips` devuelve `200` autenticado.
- **Severidad si falla:** BLOCKER.

### UAT-AUTH-05 — Trip de UAT disponible

- **Estado:** PASS / **VALIDATED**
- **Objetivo:** comprobar disponibilidad del viaje de prueba.
- **Pasos realizados:** abrir la selección de viajes con la cuenta UAT.
- **Resultado esperado:** el trip UAT es accesible para la membresía correcta.
- **Resultado real:** trip `uat-mobile-canton-2026` disponible.
- **Severidad si falla:** HIGH.

### UAT-AUTH-06 — Invitación de Traveler

- **Estado:** PASS / **VALIDATED**
- **Objetivo:** crear, recibir y aceptar una invitación de Traveler.
- **Pasos realizados:** crear una invitación, recibir el email, abrir el link y
  aceptar la invitación.
- **Resultado esperado:** link al frontend de STAGING, email transaccional
  entregado, aceptación y redirect al viaje invitado.
- **Resultado real:** link correcto, email enviado y recibido, Resend
  `DELIVERED`, invitación aceptada y redirect al viaje correcto.
- **Severidad si falla:** BLOCKER.

Durante esta prueba se detectaron y corrigieron dos defectos:

1. **URL pública de invitación.** Faltaba `PUBLIC_APP_URL` en STAGING, por lo
   que el fallback generaba links con `localhost:3000`. Se configuró en STAGING
   como `https://staging.nihaonegocios.com`, sin slash final.
2. **Envío de email.** La invitación se persistía, pero no tenía envío
   transaccional. Se integró Resend para crear y regenerar invitaciones, con
   remitente `Nihao <invitaciones@nihaonegocios.com>` y fallback manual de
   copiar enlace.

### UAT-AUTH-07 — Login y alcance de Traveler

- **Estado:** PASS / **VALIDATED**
- **Objetivo:** validar que Traveler ingresa al viaje y conserva sesión sin
  acceder a funciones ADMIN.
- **Pasos realizados:** iniciar sesión con Traveler, entrar al viaje y refrescar.
- **Resultado esperado:** sesión persistente y ausencia de funciones ADMIN.
- **Resultado real:** login, acceso al viaje y persistencia de sesión correctos;
  las funciones ADMIN no se muestran.
- **Severidad si falla:** BLOCKER.

### UAT-AUTH-08 — Onboarding

- **Estado:** PASS / **VALIDATED**
- **Objetivo:** verificar que onboarding aparece una sola vez y puede
  completarse.
- **Pasos realizados:** completar onboarding y volver a abrir la app.
- **Resultado esperado:** onboarding no reaparece luego de completarse.
- **Resultado real:** se completa correctamente y no reaparece.
- **Severidad si falla:** HIGH.

### UAT-AUTH-09 — Protección server-side de ADMIN

- **Estado:** PASS / **VALIDATED**
- **Objetivo:** comprobar autorización server-side, no sólo ocultamiento de UI.
- **Pasos realizados:** intentar rutas y APIs ADMIN como Traveler; repetir como
  ADMIN autorizado.
- **Resultado esperado:** Traveler recibe bloqueo server-side; ADMIN accede.
- **Resultado real:** Traveler queda bloqueado de `/admin`,
  `/admin/proveedores`, API de dashboard admin y API de suppliers admin; ADMIN
  conserva acceso.
- **Severidad si falla:** BLOCKER.

### UAT-AUTH-10 — UX mobile básica

- **Estado:** PASS / **VALIDATED**
- **Objetivo:** validar navegación y acciones esenciales en mobile.
- **Pasos realizados:** recorrer las pantallas y acciones principales en teléfono.
- **Resultado esperado:** no hay scroll horizontal ni impedimentos de navegación.
- **Resultado real:** sin scroll horizontal, navegación correcta, acciones
  accesibles y sin blockers HIGH.
- **Severidad si falla:** HIGH.

## BLOQUE 2 — CAPTURA ONLINE

### UAT-CAP-01 — Captura por texto

- **Estado:** PASS / **VALIDATED**
- **Objetivo:** validar creación, extracción por IA, revisión y confirmación de
  una captura de texto.
- **Pasos realizados:** crear la captura, esperar análisis, revisar campos y
  confirmar proveedor.
- **Resultado esperado:** texto preservado, IA conservadora y confirmación
  funcional sin datos no respaldados.
- **Resultado real:** creación y preservación del texto correctas; IA finaliza,
  detecta campos y permite confirmación. Los datos ausentes no se inventan.
  Caso validado: Canton Machinery, Zhang Wei, Guangzhou, maquinaria agrícola e
  interés 5/5. Provincia, tipo de proveedor, FOB, MOQ y lead time quedaron
  ausentes cuando no estaban respaldados por la evidencia.
- **Severidad si falla:** BLOCKER.

### UAT-CAP-02 — Corrección humana y confirmación

- **Estado:** PASS / **VALIDATED**
- **Objetivo:** modificar campos extraídos antes de confirmar y verificar que la
  corrección humana persiste.
- **Pasos realizados:** editar campos, guardar, confirmar, reabrir y refrescar.
- **Resultado esperado:** editor visible inline; el PATCH existente persiste las
  correcciones humanas y éstas prevalecen al reabrir.
- **Resultado real:** editor inline visible en mobile; Contacto cambió de
  “Li Ming” a “Li Ming Chen” e Interés de medio a alto. El proveedor fue
  confirmado y las correcciones persistieron al reabrir y tras refresh.
- **Severidad si falla:** HIGH.

El hallazgo original no era un fallo del backend: el botón **Editar** funcionaba,
pero `Tier1Editor` se renderizaba al final de `ProductCapture`, fuera del
viewport mobile. Se clasificó como UX HIGH para mobile y se corrigió renderizando
el editor inline bajo el campo seleccionado en `1053acf`.

**Preservación de correcciones humanas: VALIDATED.**

# UAT pendiente

## BLOQUE 2B — WHATSAPP

### UAT-WA-01 — Binding y captura de proveedor por texto

- [x] **Estado:** VALIDATED.
- **Objetivo:** vincular el WhatsApp de un Traveler (incluyendo código de país), enviar un texto con datos de proveedor y verificar que se crea una captura `DRAFT` en el viaje correcto.
- **Resultado esperado:** la respuesta por WhatsApp sólo resume datos detectados y aclara que requiere revisión; no confirma ni crea proveedores automáticamente.
- **Resultado real:** WhatsApp ↔ Evolution ↔ Nihao, resolución por `whatsappPhone`, extracción Mistral y DRAFT visible en dashboard validados en STAGING.

### UAT-WA-02 — Business card por WhatsApp

- [ ] **Estado:** PENDING UAT.
- **Pasos:** enviar una tarjeta JPG/PNG/WebP (hasta 8 MB) desde el WhatsApp vinculado; esperar respuesta; abrir el dashboard del viaje.
- **Resultado esperado:** respuesta breve con datos visibles detectados, un DRAFT independiente con adjunto y OCR; nunca Supplier confirmado.

### UAT-WA-03 — Nota de voz por WhatsApp

- [ ] **Estado:** PENDING UAT.
- **Pasos:** enviar una nota de voz OGG/Opus (hasta 25 MB) con datos explícitos del proveedor; esperar respuesta; abrir el dashboard.
- **Resultado esperado:** DRAFT independiente, transcripción y campos detectados; respuesta indica revisión pendiente.

**Pendiente / fuera de alcance WhatsApp:** product photo (no se intenta adivinar tarjeta vs producto), agrupación multi-message/multi-evidence, UAT físico móvil/offline de Web App y prueba de conectividad desde China continental.

## BLOQUE 2 — CAPTURA ONLINE

### UAT-CAP-03 — BUSINESS CARD / CAMERA

- [ ] **Estado:** PENDING UAT — requiere dispositivo mobile físico.
- **Objetivo:** validar `camera → attachment → OCR → AI extraction → review`.
- **Pasos:**
  1. Traveler crea una nueva captura.
  2. Selecciona tarjeta o foto.
  3. Abre la cámara real.
  4. Fotografía una tarjeta comercial.
  5. Guarda la evidencia.
  6. Espera el análisis.
  7. Revisa los campos.
- **Resultado esperado:** la cámara abre, la foto se persiste y muestra preview
  correcto, sin duplicación. OCR e IA terminan; datos respaldados quedan
  DETECTED, dudosos quedan REVIEW, ausentes quedan MISSING y no se inventan
  datos.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

### UAT-CAP-04 — MULTIPLE BUSINESS CARDS

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** agregar múltiples tarjetas a una misma `SupplierCapture`.
- **Pasos:** adjuntar hasta tres tarjetas y ejecutar el análisis de la captura.
  Caso recomendado: tarjeta A con empresa, contacto y teléfono; tarjeta B de la
  misma empresa con email, web y dirección.
- **Resultado esperado:** attachments independientes, análisis conjunto y merge
  conservador de datos complementarios. No se duplica proveedor; conflictos no
  se pisan silenciosamente y quedan REVIEW.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

### UAT-CAP-05 — PRODUCT PHOTO

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** validar carga de foto de producto como evidencia visual.
- **Pasos:** agregar una foto desde cámara o galería a una captura existente.
- **Resultado esperado:** cámara/galería funciona, evidencia y asociación a
  `SupplierCapture` persisten, preview es correcto y la foto no provoca datos
  comerciales inventados ni rompe el análisis de tarjetas o texto.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

### UAT-CAP-06 — AUDIO

- [ ] **Estado:** PENDING UAT — requiere teléfono físico.
- **Objetivo:** validar captura y procesamiento de audio.
- **Pasos:** conceder permiso de micrófono, grabar, detener, revisar playback si
  existe, subir y esperar persistencia, transcripción, extracción IA y review.
  El audio de prueba puede mencionar empresa, persona, producto, MOQ, lead time
  e interés.
- **Resultado esperado:** grabación y upload correctos; transcripción y
  extracción disponibles para revisión. Los campos no mencionados no se
  inventan.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

### UAT-CAP-07 — MULTIPLE AUDIOS

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** validar hasta tres audios por captura.
- **Pasos:** adjuntar hasta tres audios con información complementaria y revisar
  el análisis conjunto.
- **Resultado esperado:** evidencias y transcripciones independientes,
  preservadas y analizadas en conjunto; no hay duplicación y los conflictos
  quedan REVIEW.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

### UAT-CAP-08 — MIXED EVIDENCE

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** validar el flujo completo con texto, dos tarjetas, foto de
  producto y audio en una sola `SupplierCapture`.
- **Pasos:** cargar todas las evidencias, ejecutar análisis y revisar los campos
  propuestos.
- **Resultado esperado:** `evidence → extraction → conservative merge → review`.
  La IA propone y el humano decide; datos contradictorios no se sobreescriben
  silenciosamente.
- **Resultado real:** —
- **Severidad si falla:** BLOCKER.

### UAT-CAP-09 — CONFLICT HANDLING

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** comprobar tratamiento conservador de valores contradictorios.
- **Pasos:** aportar, por ejemplo, texto con MOQ 100 y audio con MOQ 500.
- **Resultado esperado:** no se elige arbitrariamente un valor como verdad; el
  campo queda REVIEW o muestra el comportamiento equivalente definido por el
  producto.
- **Resultado real:** —
- **Severidad si falla:** BLOCKER.

### UAT-CAP-10 — HUMAN CORRECTION + REANALYSIS

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** verificar que una corrección humana prevalece tras agregar nueva
  evidencia y reanalizar.
- **Pasos:** dejar que IA detecte un valor, corregirlo manualmente, agregar una
  evidencia nueva y reanalizar.
- **Resultado esperado:** `humanCorrectedFields` prevalece; la IA no pisa la
  corrección humana.
- **Resultado real:** —
- **Severidad si falla:** BLOCKER.

### UAT-CAP-11 — DELETE ANALYZED EVIDENCE

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** validar eliminación de evidencia que ya participó del análisis.
- **Pasos:** eliminar una evidencia analizada y revisar el estado de la captura.
- **Resultado esperado:** evidencia eliminada, `needsReanalysis` marcado y UI
  comunica la necesidad de reanálisis. No se borran correcciones humanas y el
  nuevo análisis usa sólo evidencias existentes.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

### UAT-CAP-12 — FINAL CONFIRMATION

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** confirmar proveedor luego de un flujo multi-evidencia.
- **Pasos:** completar revisión y confirmar; hacer refresh, reabrir y comprobar
  la edición posterior.
- **Resultado esperado:** estado confirmado, datos persistentes, sin duplicación
  y edición posterior conforme a las reglas del sistema.
- **Resultado real:** —
- **Severidad si falla:** BLOCKER.

## BLOQUE 3 — OFFLINE / CONNECTIVITY

**Estado del bloque: IMPLEMENTED / PENDING PHYSICAL UAT.**

Arquitectura existente: IndexedDB, cola por `userId + tripId`,
`clientCaptureId`, `clientEvidenceId` y sincronización al reconectar. IA,
review y confirmación operan sólo online. No hay Service Worker ni background
sync.

### UAT-OFF-01 — CREATE TEXT OFFLINE

- [ ] **Estado:** PENDING PHYSICAL UAT.
- **Objetivo y pasos:** entrar autenticado, cortar Wi-Fi y datos, y crear una
  captura de texto.
- **Resultado esperado:** se guarda localmente, UI informa pendiente y no se
  pierden datos.
- **Resultado real:** —
- **Severidad si falla:** BLOCKER.

### UAT-OFF-02 — PHOTO/CARD OFFLINE

- [ ] **Estado:** PENDING PHYSICAL UAT.
- **Objetivo y pasos:** sin conectividad, crear una captura, tomar tarjeta o
  foto y guardarla.
- **Resultado esperado:** evidencia y preview quedan persistidos en IndexedDB.
- **Resultado real:** —
- **Severidad si falla:** BLOCKER.

### UAT-OFF-03 — AUDIO OFFLINE

- [ ] **Estado:** PENDING PHYSICAL UAT.
- **Objetivo y pasos:** sin conectividad, grabar y guardar un audio.
- **Resultado esperado:** el audio persiste localmente.
- **Resultado real:** —
- **Severidad si falla:** BLOCKER.

### UAT-OFF-04 — CLOSE / REOPEN

- [ ] **Estado:** PENDING PHYSICAL UAT.
- **Objetivo y pasos:** con items offline pendientes, cerrar pestaña y, si es
  posible, navegador; luego reabrir la app.
- **Resultado esperado:** capturas y evidencias pendientes siguen disponibles.
- **Resultado real:** —
- **Severidad si falla:** BLOCKER.

### UAT-OFF-05 — RECONNECT / SYNC

- [ ] **Estado:** PENDING PHYSICAL UAT.
- **Objetivo y pasos:** reconectar luego de crear contenido pendiente.
- **Resultado esperado:** sincronización automática o por el mecanismo previsto;
  captura server-side creada, evidencias subidas y estados locales limpiados
  correctamente.
- **Resultado real:** —
- **Severidad si falla:** BLOCKER.

### UAT-OFF-06 — IDEMPOTENCY

- [ ] **Estado:** PENDING PHYSICAL UAT.
- **Objetivo y pasos:** forzar retry o reconnect durante una sincronización.
- **Resultado esperado:** `clientCaptureId` y `clientEvidenceId` evitan
  `SupplierCapture` y attachments duplicados.
- **Resultado real:** —
- **Severidad si falla:** BLOCKER.

### UAT-OFF-07 — SESSION EXPIRY

- [ ] **Estado:** PENDING PHYSICAL UAT.
- **Objetivo y pasos:** dejar vencer la sesión con contenido pendiente y volver
  a autenticarse.
- **Resultado esperado:** los datos locales no se pierden, se solicita login y
  luego se puede continuar o sincronizar.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

### UAT-OFF-08 — ERROR HANDLING

- [ ] **Estado:** PENDING PHYSICAL UAT.
- **Objetivo y pasos:** provocar y revisar network failure, 401, 403, 4xx y 5xx.
- **Resultado esperado:** la UI diferencia las clases de error y nunca descarta
  silenciosamente contenido local.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

## BLOQUE 4 — DASHBOARDS / OPERACIÓN

### UAT-OPS-01 — TRAVELER DASHBOARD

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** validar datos personales, conteos, pendientes, recientes, día
  actual y UX mobile.
- **Pasos:** ingresar como Traveler y revisar dashboard con datos UAT.
- **Resultado esperado:** muestra sólo datos propios. ADMIN al usar la vista
  Traveler sigue viendo su dashboard personal, no datos globales por accidente.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

### UAT-OPS-02 — ADMIN DASHBOARD

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** validar métricas globales del trip, datos por Traveler, recientes
  y conteos.
- **Pasos:** ingresar como ADMIN y comparar métricas contra las capturas creadas
  durante UAT.
- **Resultado esperado:** métricas coherentes y acceso restringido a ADMIN.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

### UAT-OPS-03 — TRAVELER ISOLATION

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** validar aislamiento de datos con al menos dos Travelers.
- **Pasos:** crear o usar datos de Traveler A y B; revisar UI y API con cada
  cuenta.
- **Resultado esperado:** Traveler A no puede ver datos personales de Traveler
  B, ni por UI ni por API.
- **Resultado real:** —
- **Severidad si falla:** BLOCKER.

### UAT-OPS-04 — SUPPLIER REPORT

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** validar `/app/viajes/:tripId/admin/proveedores`.
- **Pasos:** revisar listado, búsqueda server-side, categoría, tipo, Traveler,
  interés, completitud y paginación.
- **Resultado esperado:** filtros y resultados correctos, sin omisiones ni datos
  ajenos al trip.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

### UAT-OPS-05 — SORTING

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** validar orden por recientes, A-Z e interés alto.
- **Pasos:** alternar cada criterio sobre un conjunto conocido.
- **Resultado esperado:** orden coherente y sin duplicación.
- **Resultado real:** —
- **Severidad si falla:** MEDIUM.

### UAT-OPS-06 — COMPLETENESS

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** comprobar reglas de completitud.
- **Pasos:** revisar drafts, confirmed incomplete y confirmed complete.
- **Resultado esperado:** cada proveedor se clasifica según las reglas actuales.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

### UAT-OPS-07 — SUPPLIER COMPARISON

- [ ] **Estado:** PENDING UAT.
- **Objetivo:** comparar entre dos y cuatro proveedores del mismo viaje.
- **Pasos:** seleccionar proveedores y revisar la comparación.
- **Resultado esperado:** comparación descriptiva con datos correctos, sin
  scoring ni equivalencias monetarias inventadas; no permite mezclar trips.
- **Resultado real:** —
- **Severidad si falla:** HIGH.

## Regression UAT final

- [ ] **Estado:** PENDING UAT, luego de corregir cualquier defecto encontrado.
- **Objetivo:** ejecutar un smoke corto, sin repetir innecesariamente todas las
  pruebas detalladas.
- **Cobertura:** AUTH, INVITATION, ONBOARDING, TEXT CAPTURE, CARD, AUDIO,
  MULTI-EVIDENCE, OFFLINE SYNC, TRAVELER DASHBOARD, ADMIN DASHBOARD y REPORTS.
- **Resultado esperado:** no se reintroducen blockers o regresiones HIGH en los
  flujos ya validados.
- **Resultado real:** —
- **Severidad si falla:** según el flujo afectado.

# MVP Demo Gate

## MVP DEMO READY

Para declarar el MVP listo para una demo controlada, deben estar **VALIDATED**:

- [x] Auth.
- [x] Invitations.
- [x] Roles.
- [x] Onboarding.
- [x] Captura de texto.
- [x] Corrección humana.
- [ ] Business card.
- [ ] Audio.
- [ ] Multi-evidence.
- [ ] AI merge/review.
- [ ] Confirmación.
- [ ] Traveler dashboard.
- [ ] Admin dashboard.

Offline no bloquea una primera demo controlada si se realiza con conectividad
estable, pero debe quedar explícitamente como **PENDING PHYSICAL UAT**. Antes de
este gate no se agregan features nuevas, salvo blockers.

Estado cualitativo: **cercano**, condicionado principalmente al cierre del UAT
de captura online.

# MVP Pilot Gate

Para entregar el MVP a usuarios reales en una feria o piloto, además del gate de
Demo deben estar **VALIDATED**:

- [ ] Offline text, photo y audio.
- [ ] Persistencia tras close/reopen.
- [ ] Reconnect y sync.
- [ ] Idempotency.
- [ ] Comportamiento ante session expiry.
- [ ] Traveler isolation.
- [ ] Reports y comparison.
- [ ] Pruebas físicas de cámara y micrófono.

No puede haber BLOCKER ni HIGH abiertos. MEDIUM y LOW pueden permanecer sólo si
están documentados y no impiden la operación.

Estado cualitativo: requiere además cerrar UAT offline y operacional.

# Producción

## Deuda y verificaciones previas a producción

1. **Vercel Deployment Protection:** fue desactivada a nivel proyecto para
   permitir UAT público. Definir y validar la estrategia antes de producción.
2. **Resend API keys:** STAGING usa una key dedicada. Producción debe usar otra
   key separada; nunca reutilizar credenciales de STAGING.
3. **Variables de producción:** configurarlas explícitamente durante el release;
   no copiar valores de STAGING de forma ciega.
4. **`PUBLIC_APP_URL`:** debe apuntar al dominio público productivo correcto.
5. **Better Auth y CORS:** revalidar origins productivos antes del release.
6. **Production DB:** no tocar hasta contar con autorización explícita.

## Gates técnicos antes de release

- [ ] `git diff --check`
- [ ] ESLint
- [ ] TypeScript
- [ ] Tests completos
- [ ] Prisma validate
- [ ] Prisma generate
- [ ] Next build
- [ ] Estado de migraciones
- [ ] Revisión de regresión de seguridad

El total validado en el commit `1053acf` es de **70 tests**. Ese número es una
referencia histórica, no un requisito fijo: la suite puede crecer.

## Release a producción — FUTURE / REQUIRES EXPLICIT AUTHORIZATION

Nunca asumir autorización para producción. La secuencia requerida es:

1. Completar UAT.
2. Resolver BLOCKER y HIGH.
3. Ejecutar gates locales.
4. Ejecutar regression smoke en STAGING.
5. Obtener aprobación de MVP.
6. Hacer merge `develop → main`.
7. Configurar secrets productivos.
8. Configurar key de Resend exclusiva de producción.
9. Validar domains y origins.
10. Desplegar frontend y backend.
11. Ejecutar migraciones de producción.
12. Ejecutar smoke de producción.
13. Confirmar plan de rollback.

# Post-MVP

Quedan explícitamente fuera del UAT actual y del alcance de estabilización del
MVP:

- WhatsApp / Evolution API.
- Nuevas automatizaciones.
- Nuevos módulos.
- Features especulativas.

Principio operativo: terminar la validación del alcance actual antes de expandir
el scope.
