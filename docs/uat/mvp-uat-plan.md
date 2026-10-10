# Nihao MVP — Estado y plan de UAT

Este documento es la fuente operativa para estabilizar el MVP. Distingue lo
construido de lo validado realmente, especialmente en teléfono físico. Una
capacidad no se considera validada sólo porque exista código o una prueba local.

## Validación final del flujo sin conectividad — código `bbfaafb`, staging `c6e81d3`

La regla del piloto es capturar sin esperar respuestas ni confirmar cada foto. La recomendación es una foto principal de tarjeta por proveedor; reversos y otras evidencias se reciben y se revisan si su asociación es ambigua. Esta tabla registra el medio usado para cada resultado y no traslada el UAT del SHA anterior al nuevo despliegue.

| Escenario | Resultado | Evidencia y límite |
| --- | --- | --- |
| 5, 20 y 50 entregas mixtas, duplicados y contenido idéntico con IDs distintos | **PASS con PostgreSQL** @`bbfaafb` | Webhook sintético y R2 en memoria: 5/20/51 filas únicas; la última incluye otro viajero. No hubo WhatsApp ni R2 reales. |
| Dos viajeros, fecha de emisión fuera de orden | **PASS con PostgreSQL** @`bbfaafb` | Dos ráfagas reclamables; IDs, fecha de envío/recepción y orden de emisión conservados. |
| Medio con R2 fallido y redelivery | **PASS con PostgreSQL** @`bbfaafb` | Primer intento 503 con sobre en inbox sin `storageKey`; segundo 200 tras copia legible y SHA-256; un ID/una fila. Corrupción sintética se repara con nuevo download. |
| Cinco o más errores del worker sin respuesta del viajero | **PASS con PostgreSQL** @`bbfaafb` | Permanece `OPEN`, un aviso veraz y reintento programado; no requiere comando. Reinicio durante reserva y efectos comerciales idempotentes siguen cubiertos por regresiones existentes. |
| Casos históricos anonimizados: frente/reverso, proveedor nuevo, FOB/MOQ posterior | **PASS automático parcial / NO VALIDADO REAL** | Replay y tests anonimizados anteriores; la nueva prueba de 50 entradas comprueba recepción, no la interpretación comercial de la ráfaga entera. Repetir con criterio humano y medios reales. |
| Citas de foto/audio/texto y pregunta anterior del bot | **PASS automático parcial / NO VALIDADO REAL** | El parser y el dominio conservan `quotedMessageId` en fixtures y resuelven referencias persistidas con alcance de usuario. No se dispone de payload runtime de Evolution de prueba para certificar metadatos completos. |
| Web, DRAFT, confirmación, informes y reconexión | **PASS navegador parcial** @`68eb669`; **PASS smoke navegador parcial** @`c6e81d3` | Chromium móvil abrió portada y `/app` autenticada sin errores de página en el Preview final. DRAFT, confirmación, exportaciones y reconexión con datos sintéticos se probaron en SHA anterior y no se repitieron completos en `c6e81d3`. Falta dispositivo físico y R2 real. |
| Webhook staging, texto duplicado y medio sin R2 | **PASS HTTP sintético parcial** @`c6e81d3` | Sin secreto 401, incorrecto 401, texto firmado y duplicado 200 con una fila; imagen firmada y duplicada 503 con una fila pero sin bytes originales ni `storageKey`. Ráfaga de staging 32/32 `OPEN`. No hubo Evolution ni WhatsApp reales. |
| 50 medios reales, reinicio físico, IA y reconciliación DB/R2 | **BLOQUEADO / NO VALIDADO REAL** | R2 exclusivo y credenciales IA de staging están configurados; R2 fue verificado con escritura/lectura/hash/borrado de objeto sintético. Faltan la ventana temporal autorizada sobre Evolution, números/dispositivo de prueba y la prueba física completa. |
| Agente OpenAI: proveedor, FOB/MOQ posterior y referencia ambigua | **PASS proveedor real + PostgreSQL staging / NO WhatsApp** | `gpt-5.6-luna` default con esfuerzo `medium`: creó producto DRAFT, luego actualizó FOB USD 9/MOQ 500 y, ante dos proveedores posibles, no escribió ni inventó asociación y pidió aclaración. Mensajes, lecturas, operaciones y replies verificados en PostgreSQL. Run `1d9bcd7c-dac5-4f7b-8249-00c7d4dd46ea`; 22 requests/94.206 tokens válidos. |
| OCR `WWW.` / URL con esquema | **PASS automático + staging** @`573e696` | Regresión 11/11: `WWW.ALFATOOLS.TEST` pasa a `https://WWW.ALFATOOLS.TEST`; una URL con `https://` queda sin cambio. CI y Railway staging PASS. |
| Evolution actual: configuración, recuperación y rollback | **PASS preflight read-only / BLOQUEADO cambio** | Instancia 2.3.7 abierta; webhook productivo respaldado con hash y un evento reciente recuperable por ID. No hay replies pendientes, pero se observaron 2 ráfagas OPEN y 1 PROCESSING con worker activo. Releer y exigir estado seguro antes de solicitar la única autorización para el cambio temporal. La ráfaga sintética staging de 32 mensajes quedó `OPEN` con `dueAt=2100-01-01` para que no participe. |

Con el ACK estricto, una foto/audio sintéticos enviados a staging sin R2 o Evolution de prueba reciben 503. El inbox conserva el descriptor, pero eso no equivale a tener el archivo original. Verificar con una instancia de prueba la cantidad y calendario efectivos de reentregas Evolution antes de UAT real. Para `c6e81d3`, CI [38026637021](https://github.com/Broco-Solutions/nihao-landing/actions/runs/38026637021) y [38026634583](https://github.com/Broco-Solutions/nihao-landing/actions/runs/38026634583) pasó; Vercel Preview `dpl_EUemEDL4zfxQAW76UuvhpTL71G7j` y Railway staging `0b953002-0de9-4ead-ab70-ad92fac42e71` sirvieron ese SHA; PostgreSQL staging conserva 29/29 migraciones. Ningún PASS local con proveedor simulado certifica el flujo real.

## Candidato de staging anterior 2026-10-10

Código Web y backend de exportación probado: `0cf08142bab737d18b5f827f7cba16f9616bebca`; backend de la prueba de recepción: `6cc4175b29025cc221c61709df5cdc39175f9104`. Entornos separados: Vercel Preview `staging.nihaonegocios.com`, Railway `staging` y PostgreSQL staging. Los resultados de esta tabla corresponden a datos sintéticos y cuentas de prueba; las validaciones históricas de más abajo corresponden a otros SHA y no se trasladan a este candidato.

| Escenario | Resultado en este candidato | Medio y límite |
| --- | --- | --- |
| Auth ADMIN/Traveler, invitación y scopes | PASS parcial | API y Chromium headless; invitación aceptada. API ADMIN: anónimo 401, Traveler 403, ADMIN 200. Entrega por email pendiente: Resend compartido con producción fue retirado de staging. |
| Proveedor capturado, editado y confirmado | PASS | API real de staging; DRAFT, validación de contacto y confirmación persistida en PostgreSQL. |
| Producto DRAFT visible y revisable | PASS sintético | El estado de un producto de prueba se cambió con SQL acotado para simular una carga WhatsApp sin IA live. Chromium headless: administrador ve la pestaña Productos y la ficha; viajero ve el pendiente. Se corrigió carga acoplada de productos/adjuntos: los productos permanecen visibles si falla R2. |
| Confirmación explícita de producto | PASS | Chromium headless como viajero; DRAFT → CONFIRMED, pendiente 1 → 0, contador confirmado 0 → 1. |
| Informes y exportaciones | PASS sintético / PENDING revisión humana | API autenticada: con un DRAFT, XLSX contiene 0 filas en «Productos» y 1 en «Productos pendientes»; PDF válido. Chromium headless descargó PDF como ADMIN y XLSX como Traveler mediante los enlaces Web. Faltan revisión comercial humana y medios originales. |
| Móvil Web | PASS parcial | Chromium 390 × 844: viajes, proveedor nuevo, DRAFT y confirmación. Falta dispositivo físico. |
| Recepción webhook firmada | PASS parcial | Evento sintético: sin cabecera 401, cabecera incorrecta 401, cabecera válida 200. Falta Evolution de prueba independiente. |
| 30 mensajes sintéticos mezclados y duplicados | PASS recepción / BLOCKED procesamiento | 24 textos, 3 imágenes y 3 audios de metadatos sintéticos: 30 respuestas 200, tres reenvíos 200; DB conserva 30 IDs únicos, 30 timestamps y una ráfaga. El worker queda `OPEN` porque faltan credenciales exclusivas de IA/R2/Evolution; no se infiere lectura ni conservación del binario desde esos metadatos. |
| Caída/reinicio del worker y errores parciales | PASS local / PENDING staging | PostgreSQL local y replay cubren lease, errores y reintentos; sin recursos externos aislados no puede validarse el procesamiento de la ráfaga staging. |
| Identidad 54/549/0/15 y ambigüedad | PASS local / PENDING real | Regresiones PostgreSQL locales; no se envió WhatsApp real. |
| Frente/reverso, proveedores consecutivos, foto + audio + texto, FOB/MOQ posterior | PASS local / PENDING real | Replay determinístico y fixtures; falta prueba con medios reales en staging aislado. |
| Offline y reconexión | PASS navegador parcial / PENDING físico | Chromium 390 × 844 sin red: imagen sintética de 68 bytes en IndexedDB con un único ID local. Reconexión creó un único DRAFT remoto; dos intentos de subir a R2 aislado devolvieron error, pero conservaron el mismo ID remoto y el blob local íntegro. Fixes `f0772c3`/`e2a5df8`; test de aborto después del `put` PASS. Falta sincronización completa de medios y dispositivo físico. |
| Evidencia original DB/R2 y IA | PASS parcial / PENDING físico | R2 exclusivo `nihao-staging`, OCR Mistral y agente OpenAI tuvieron pruebas reales controladas. Persistencia durable ante error R2 está cubierta con PostgreSQL; falta el flujo físico WhatsApp con medios y reconciliación DB/R2. |
| WhatsApp real y reintentos Evolution | BLOCKED por autorización de ventana | La única instancia Evolution observada es productiva. Configuración respaldada y rollback preparado; falta confirmar la ventana temporal hacia staging y ejecutar sólo entre números de prueba. |

Para completar el UAT real: confirmar una ventana acotada para redirigir temporalmente el webhook Evolution actual a staging, usar sólo números y dispositivo de prueba, y restaurar la configuración respaldada al terminar o ante el primer riesgo. Ejecutar tarjetas, audio humano, mensajes acumulados y reconexión; reconciliar cada ID, original y recibo entre Evolution, PostgreSQL, R2 y Web. Los errores deben permanecer visibles como pendientes, sin atribuirles un PASS.

## Leyenda de estados

| Estado | Significado |
| --- | --- |
| **IMPLEMENTED** | La capacidad está construida, pero aún puede requerir UAT real. |
| **VALIDATED** | Fue comprobada mediante UAT o smoke real en el contexto indicado. |
| **PENDING UAT** | La prueba todavía debe ejecutarse. |
| **BLOCKED** | No puede avanzar hasta resolver una dependencia o defecto. |
| **FUTURE / POST-MVP** | Queda fuera del alcance de estabilización del MVP. |

# Estado

## Referencia de release — actualización 2026-10-02

| Referencia | Descripción |
| --- | --- |
| `84bb4171386f564a53ffbeb073918d7f380557e7` | Release de aplicación en `main`, publicado en Vercel y Railway el 2 de octubre. |
| Vercel `dpl_FgkefzpjicHka4WGKVzfkN2oJobm` | READY; alias `www.nihaonegocios.com`. |
| Railway `2ef9335a-e6a8-41bc-bd8f-35d84a50c5cf` | SUCCESS; `nihao-bot`, entorno `production`. |
| `1053acf` | Referencia histórica de UAT de staging; no representa el HEAD actual verificado. |

Producción está desplegada con autorización explícita del usuario para este
release. `main` es la rama productiva; `develop` es la rama prevista de staging.
No se verificó el deployment actual de staging durante este release.

## Estado funcional actual

| Área | Estado | Nota operativa |
| --- | --- | --- |
| Desarrollo funcional MVP | **IMPLEMENTED** | El alcance funcional actual está construido. |
| Infraestructura STAGING | **VALIDATED** | Entorno de UAT disponible. |
| Auth, roles, invitaciones y onboarding | **VALIDATED** | Bloque 1 de UAT completado. |
| Captura online | **PENDING UAT** | UAT en progreso; texto y corrección humana validados. |
| Captura TEXT por WhatsApp | **VALIDATED** | Transporte, binding y captura DRAFT real end-to-end validados en STAGING. |
| Business card por WhatsApp | **VALIDATED** | UAT real de IMAGE confirmó Evolution → AttachmentService → R2 → OCR/Mistral → DRAFT y respuesta; el error de evidence ID desapareció. |
| Business card multi-foto por WhatsApp | **BROCO HAPPY PATH VALIDATED / OTHER SCENARIOS PENDING** | Frente/reverso real: una DRAFT/ANALYZED, dos adjuntos analizados y receipt COMPLETED. |
| Audio por WhatsApp | **IMPLEMENTED / PENDING UAT** | AUDIO crea DRAFT independiente, transcripción existente y extracción. |
| Captura offline | **IMPLEMENTED / PENDING PHYSICAL UAT** | Requiere prueba física de conectividad. |
| Dashboard Traveler | **IMPLEMENTED / PENDING FINAL UAT** | Requiere validación operacional final. |
| Dashboard Admin | **IMPLEMENTED / PENDING FINAL UAT** | Requiere validación operacional final. |
| Reportes y comparación de proveedores | **IMPLEMENTED / PENDING FINAL UAT** | Requiere validación operacional final. |
| Producción | **DEPLOYED / SMOKE VALIDATED** | Release `84bb417`; disponibilidad y rechazo de acceso anónimo comprobados. UAT autenticado y físico pendientes. |
| Viajeros y afiliaciones | **DEPLOYED / PENDING UAT** | Catálogo global, edición, pasaporte, asignación a viajes/empresas y retiro. |
| Agenda individual | **DEPLOYED / PENDING UAT** | CRUD por viajero y copia administrativa. |
| Exportación PDF/Excel y feedback | **DEPLOYED / PENDING UAT** | Generación de archivos cubierta por test local; falta operación autenticada real. |
| Recuperación de contraseña | **DEPLOYED / PENDING UAT** | Falta entrega de email y restablecimiento end-to-end. |

El núcleo del MVP y la ampliación administrativa están publicados. El proyecto
requiere **UAT / estabilización**. Los resultados históricos siguientes no
certifican automáticamente las pantallas y permisos del release nuevo.

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

- [x] **Estado:** VALIDATED para IMAGE y fix de evidence ID en UAT real.
- **Resultado real:** WhatsApp → Evolution → media download → AttachmentService → R2 → OCR/Mistral → SupplierCapture DRAFT → respuesta WhatsApp. No volvió a ocurrir "Identificador de adjunto inválido".
- **Hallazgo:** al enviar frente y reverso, el comportamiento anterior creó capturas independientes; se cubre en UAT-WA-02B.

### UAT-WA-02B — Business card multi-foto por WhatsApp

- [x] **Estado:** BROCO front/back happy path VALIDATED en STAGING; otros escenarios físicos pendientes.
- **Pasos:** enviar foto 1, foto 2 y opcional foto 3 desde el WhatsApp vinculado; confirmar que cada una queda guardada sin OCR; escribir `analizar tarjeta`; abrir el dashboard.
- **Resultado esperado:** una sola `SupplierCapture` DRAFT con 1–3 attachments `BUSINESS_CARD`, OCR de todas las fotos, merge conservador y respuesta breve sólo con datos detectados. Una cuarta foto se rechaza; un nuevo IMAGE tras el análisis inicia otra captura.
- **Persistencia:** `whatsappCardState` (`PENDING` → `ANALYZING` → `ANALYZED`) separa estas capturas de drafts Web y TEXT. El índice UNIQUE parcial en PostgreSQL impide dos tarjetas activas por viaje/usuario. `WhatsAppCommandReceipt`, con `UNIQUE(instance, messageId)`, consume también los comandos sin pending y los perdedores concurrentes: un duplicate tardío nunca se aplica a otra captura. Un `ANALYZING` anterior a 10 minutos y su receipt `PROCESSING` pueden recuperarse como `PENDING`/`FAILED`; tras fallo sólo un `analizar tarjeta` nuevo (otro `messageId`) reintenta, sin perder fotos.
- **Verificación real:** BROCO SOLUTIONS produjo una sola SupplierCapture DRAFT/ANALYZED, dos attachments BUSINESS_CARD incluidos en `analyzedAttachmentIds` y un receipt ANALYZE_CARD/COMPLETED. Las pruebas físicas de 3.ª/4.ª foto, duplicados y errores siguen pendientes; los evals no las sustituyen.

**Evals del MVP:** business cards, texto, extracción de transcripts, merge/conflictos, correcciones humanas, channel behavior y regresión de baselines están IMPLEMENTED (`docs/development/evals.md`). Audio real: PENDING FIXTURES. AI EVALS ≠ UAT; un resultado de modelo no sustituye la prueba física de WhatsApp.

### UAT-WA-03 — Nota de voz por WhatsApp

- [ ] **Estado:** IMPLEMENTED / PENDING UAT. La corrección del evidence ID también cubre AUDIO; resta prueba física.
- **Pasos:** enviar una nota de voz OGG/Opus (hasta 25 MB) con datos explícitos del proveedor; esperar respuesta; abrir el dashboard.
- **Resultado esperado:** DRAFT independiente, transcripción y campos detectados; respuesta indica revisión pendiente.

**Issue MEDIUM / PENDING BEFORE PILOT:** un texto conversacional como "Hola" puede generar un DRAFT sin información útil. No se corrige en este milestone.

**Pendiente WhatsApp:** UAT físico móvil/offline, conectividad desde China continental y activación/validación de ráfagas v2. Fotos de productos y agrupación multimodal tienen implementación local v2, todavía sin UAT real ni despliegue.

## Captura online — escenarios restantes del BLOQUE 2

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
- **Resultado esperado:** la vista actual muestra proveedores y capturas de las
  empresas accesibles al viajero, con agenda y feedback propios. ADMIN ve el
  alcance global del viaje en la vista administrativa; las pestañas respetan el rol.
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
- **Resultado esperado:** A no puede ver agenda/feedback personales de B ni
  proveedores/capturas de empresas sin acceso. Los proveedores de una empresa
  compartida son visibles a sus miembros; no confundir esa colaboración con
  una fuga de datos. Validar además aislamiento entre viajes.
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

## Resultado técnico del release 2026-10-02

- [x] `git diff --check`.
- [x] ESLint: 0 errores, 4 warnings.
- [x] TypeScript.
- [x] Suite local completa: 162 tests; prueba PDF/Excel repetida tras el ajuste.
- [x] Prisma validate.
- [x] Next build local y builds en Vercel/Railway.
- [x] Estado de migraciones: 19 aplicadas, schema actualizado en producción.
- [x] Smoke público y rechazo de acceso anónimo en viajeros, agenda y exportación.
- [ ] Revisión integral de regresión de seguridad y autorización autenticada.
- [ ] Regression UAT con usuarios reales de prueba.

No se ejecutó `prisma generate` como comando local independiente en esta revisión;
los builds remotos usan `pnpm build`, que incluye esa generación. El release
no certifica los gates Demo/Pilot ni las pruebas físicas que siguen pendientes.

## UAT pendiente del release publicado

| Caso | Verificación requerida | Estado |
| --- | --- | --- |
| REL-01 — Recuperación de contraseña | Entrega real de email, enlace válido/vencido, nueva contraseña y login; respuestas sin revelar existencia de cuentas. | PENDING UAT |
| REL-02 — Viajeros | Buscar, editar nombre/WhatsApp, asignar a viaje/empresa, quitar y volver a invitar; comprobar permisos ADMIN/TRAVELER. | PENDING UAT |
| REL-03 — Pasaporte | Guardar/quitar por viaje sin modificar otras membresías; comprobar permisos. | PENDING UAT |
| REL-04 — Empresas | Afiliados por viaje y exclusión de asignaciones retiradas. | PENDING UAT |
| REL-05 — Agenda | CRUD individual, copia entre viajeros/viajes, fechas/horas y aislamiento de datos. | PENDING UAT |
| REL-06 — Informes | PDF/Excel autenticados desde el frontend; contenido y alcance por rol/empresa, agenda personal y enlaces al API. | PENDING UAT |
| REL-07 — Feedback | Crear/actualizar puntuación y comentario; consulta propia y promedio administrativo. | PENDING UAT |
| REL-08 — Invitaciones | Email con viaje/empresa reales, aceptación, onboarding y reenvío. | PENDING REGRESSION UAT |
| REL-09 — Vista del viaje | Pestañas, métricas, pendientes y navegación mobile según rol. | PENDING UAT |

Estos casos se suman al UAT online, offline y operacional ya registrado; no
reemplazan cámara, micrófono, close/reopen, reconnect/sync ni aislamiento.

## Configuración y operación por verificar

- Estrategia de Vercel Deployment Protection; su estado actual no se revalidó.
- Separación de keys Resend entre staging y producción y entrega real de emails.
- `PUBLIC_APP_URL`, origins Better Auth y CORS mediante flujo autenticado real.
- Rollback: Vercel permite volver al deployment anterior; Railway conserva la
  referencia anterior `37be87a7-49b5-4f70-80ea-dbb358ae8a83`. Verificar
  compatibilidad del código elegido con el schema actual antes de restaurarlo.
  No revertir migraciones ni borrar datos automáticamente.

La autorización del 2 de octubre cubrió este release. Cada operación futura
sobre producción debe estar dentro del alcance autorizado de la sesión.

# Post-MVP

WhatsApp/Evolution ya está implementado y tiene escenarios con UAT histórico;
no debe figurar como integración enteramente futura. Continúan pendientes sus
escenarios físicos no validados y la conectividad desde China continental.

Nuevas automatizaciones, módulos y features especulativas quedan fuera de la
prioridad inmediata: cerrar validación del alcance publicado.

## UAT-WA-BURST — Ráfagas v2 (PENDING STAGING / UAT FÍSICO)

La implementación local cuenta con regresiones determinísticas y PostgreSQL.
Los modelos y el transporte están simulados: estos resultados no sustituyen
las siguientes pruebas reales. Aplicar la migración y activar la bandera sólo
en staging al comenzar; producción sigue en `84bb417`.

| Caso | Procedimiento y resultado esperado | Estado |
| --- | --- | --- |
| BURST-01 | En modo avión enviar Foto-1, Audio-1, Foto-2, Audio-2; reconectar. Una sola pregunta muestra dos cargas y sus referencias. Responder «las primeras dos por Kendal y las últimas dos por Broco»: dos DRAFT, dos empresas correctas, cuatro adjuntos. | PENDING |
| BURST-02 | Repetir con audios que dicen «esta fábrica/la tarjeta anterior» sin repetir nombres. Verificar asociación por contenido, sin cuatro cargas independientes. | PENDING |
| BURST-03 | Foto de producto sin texto + audio descriptivo. Usar visión para asociación; no inventar nombre o condiciones comerciales. | PENDING |
| BURST-04 | Anverso/reverso de tarjeta, con audio complementario: una carga, todos los adjuntos y contactos conservados. | PENDING |
| BURST-05 | Un audio menciona dos proveedores. Dos cargas con fragmentos correctos; cada una conserva su copia de audio. Borrar un adjunto y comprobar la otra. | PENDING |
| BURST-06 | Una carga clara y otra ambigua: guardar la primera, preguntar por la segunda, y completar sin duplicar la primera. | PENDING |
| BURST-07 | Más de 20 segundos de silencio inicia interpretación; «listo» la adelanta. Una evidencia nueva durante la lectura se incorpora antes de decidir. | PENDING |
| BURST-08 | Reentregas, mensajes fuera de orden y reinicio del worker: una respuesta por revisión y ninguna captura duplicada. | PENDING |
| BURST-09 | Error de lectura/transcripción: conservar originales y lecturas completas; reintentar sin repetir OCR exitoso ni inventar información. | PENDING |
| BURST-10 | Dos cargas del mismo proveedor para empresas diferentes: IDs distintos y contexto correcto. | PENDING |
| BURST-11 | Cuenta sin membresía, empresa revocada o ADMIN sin rol TRAVELER: rechazar materialización fuera de permisos. | PENDING |
| BURST-12 | Saludo/ayuda y consulta de proveedores sin carga pendiente: instrucciones o derivación a web, sin borrador vacío. Respuesta a pregunta pendiente: interpretar con contexto. | PENDING |

Registrar IDs del lote, revisión y capturas en el resultado de UAT; no pegar
transcripciones, teléfonos ni datos sensibles en logs. Ver
[arquitectura y orden de activación](../architecture/whatsapp-bursts.md).

## UAT-WA-STABILIZATION — aceptación de integridad y continuidad (PENDING EVIDENCE)

Estos son escenarios de aceptación por completar con evidencia. Su inclusión no implica que todos hayan sido reportados o reproducidos. Registrar por separado si cada caso fue reportado, reproducido, implementado y validado; los fixtures sintéticos no sustituyen medios reales ni UAT.

| Caso | Escenario y evidencia de aceptación | Estado UAT |
| --- | --- | --- |
| WA-INT-01 | Frente y reverso de una tarjeta del mismo proveedor: originales, orden y procedencia preservados en una sola captura correcta. | PENDING |
| WA-INT-02 | Fotografías consecutivas de proveedores diferentes: cada original queda separado; no se agrupa por proximidad temporal. | PENDING |
| WA-INT-03 | Foto + audio + comentario sobre producto: cada evidencia queda atribuida al producto correcto o pendiente de aclaración. | PENDING |
| WA-INT-04 | FOB/MOQ enviados después de la imagen: se preservan como evidencia comercial y se aplican sólo tras identificar inequívocamente el producto. | PENDING |
| WA-INT-05 | Múltiples productos de un proveedor: datos, evidencias y totales quedan separados por producto. | PENDING |
| WA-INT-06 | Reconocimiento de persona y empresa: ambas identidades se conservan y se distinguen en datos y evidencia. | PENDING |
| WA-INT-07 | Cambio de proveedor durante la conversación: no se transfieren referencias ni condiciones del proveedor anterior. | PENDING |
| WA-INT-08 | Aclaración que llega después de otros mensajes: se correlaciona con la pregunta correcta sin perder mensajes posteriores. | PENDING |
| WA-INT-09 | Ráfagas de 20 a 50 mensajes después de recuperar conectividad: recepción, orden y progreso terminal reconciliables. | PENDING |
| WA-INT-10 | Reintentos y reinicio: ninguna evidencia, operación, reply o captura se pierde o duplica. | PENDING |
| WA-INT-11 | Información comercial libre: se conserva literalmente como nota cuando no corresponde a un campo estructurado. | PENDING |
| WA-INT-12 | Confirmaciones y errores: el usuario entiende qué quedó persistido, pendiente, fallido o requiere acción. | PENDING |
| WA-INT-13 | Totales Web: cada cifra coincide con registros realmente persistidos y con sus estados; no cuenta evidencia descartada o no confirmada como guardada. | PENDING |

La validación automática NHA-001 cubre una terminalidad de aclaración y su recuperación PostgreSQL local; no valida estos escenarios de recepción multimedia con transporte real.

En el candidato `6cc4175`, WA-INT-09 obtuvo **PASS sólo para recepción sintética**: 30 eventos de texto/metadatos de imagen/audio y tres duplicados dejaron 30 mensajes únicos y timestamps en DB. La asociación multimedia, procesamiento y worker real siguen PENDING. WA-INT-13 obtuvo **PASS parcial de Web/API sintética**: el producto DRAFT contó como pendiente y no como confirmado; la confirmación explícita invirtió esos contadores. Los demás WA-INT conservan PENDING real aunque exista replay local determinístico.

### UAT-WA-PRODUCT — Productos para proveedores existentes (PENDING STAGING)

| Caso | Resultado esperado | Estado |
| --- | --- | --- |
| PRODUCT-01 | «Agregá producto Taladro a Alfa Tools», foto y audio: un producto DRAFT asociado al proveedor correcto; proveedor sin cambios y sin nueva SupplierCapture. | PENDING |
| PRODUCT-02 | Homónimos en empresas/ciudades diferentes: preguntar opciones y aceptar selección; proveedor inexistente: preguntar destino, conservando evidencias. | PENDING |
| PRODUCT-03 | Dos productos del mismo proveedor en una ráfaga: condiciones y fotos separadas. Audio con ambos: segmentar sin perder texto. | PENDING |
| PRODUCT-04 | Reentregas y fallo después de guardar: mismo producto, sin duplicados ni pérdida de correcciones humanas. | PENDING |
| PRODUCT-05 | En web revisar fuentes/fotos/audio, editar y confirmar. Producto sin nombre exige completarlo. Informes y métricas excluyen DRAFT hasta confirmar. | PENDING |
| PRODUCT-06 | Revocar empresa/membresía o proponer un ID ajeno: impedir asociación. Mantener límites por viaje y empresa. | PENDING |

Regresión PostgreSQL PASS con servicios externos simulados; no equivale a UAT físico.

Al finalizar la captura, el producto debe seguir DRAFT incluso con nombre, foto y
audio asociados. Sólo la acción explícita de confirmación en la web puede cambiarlo
a CONFIRMED; reintentar la misma ráfaga conserva ese estado sin duplicar el producto.

## UAT-WA-TOOLS — v3 (PENDING STAGING)

1. En modo avión enviar foto/audio de proveedor y foto/audio de otro; reconectar y verificar agrupación, una aclaración conjunta y evidencia por carga.
2. Cargar dos productos en un audio al proveedor existente y verificar FOB/MOQ independientes y originales.
3. Buscar proveedor/producto; elegir el segundo homónimo mediante `2` y comprobar empresa correcta.
4. Cargar proveedor nuevo con productos: todos DRAFT. Confirmar proveedor en web y comprobar productos vinculados todavía DRAFT.
5. Corregir un borrador y verificar que los campos omitidos se conservaron.
6. Proponer edición de confirmado: verificar resumen, ausencia de escritura antes del sí, aplicación tras sí y cancelación sin escritura.
7. Editar en web mientras existe una propuesta, luego responder sí: exigir nuevo resumen/aprobación. Repetir con propuesta expirada.
8. Reiniciar worker durante escritura/copia del medio: no duplicar registros ni adjuntos. Apagar flag: drenar operación pendiente sin abrir nuevas v3.
9. Iniciar conversación nueva con «agregale este producto»: debe preguntar destino. Verificar ayuda nueva y confirmación de borradores exclusiva en web.
