# Matriz de pruebas y UAT de Nihao Negocios

Fecha de corte: 2026-10-09  
Fecha de auditoría: 2026-10-10 UTC  
Commit productivo auditado: `ac61c49`

## Criterio de clasificación

| Estado | Significado en esta auditoría |
|---|---|
| **VALIDADO REAL** | Ejecutado de punta a punta por una persona o dispositivo real sobre el SHA y entorno indicados, con evidencia verificable. |
| **VALIDADO AUTOMÁTICO** | Cubierto por una prueba determinística que ejercita una parte representativa del código actual; no equivale a UAT real. |
| **IMPLEMENTADO NO VALIDADO** | Existe código para el escenario, pero no hubo prueba reproducible suficiente sobre el SHA actual. |
| **ROTO** | Existe evidencia reproducible u operativa de que el comportamiento actual incumple el resultado esperado. |
| **NO DETERMINADO** | No hay evidencia suficiente para afirmar implementación o resultado. |

No se clasificó ningún escenario como **VALIDADO REAL**: durante esta auditoría read-only no se enviaron mensajes reales, no se consumieron proveedores live y no se alteraron datos productivos. Los estados operativos y logs son evidencia del sistema, pero no sustituyen una UAT controlada.

## Evidencia automática disponible

- Continuación sobre PostgreSQL local aislado `nihao_audit`: 29/29 migraciones aplicadas; suite general 756 tests, 746 pasaron, 8 fallaron y 2 fueron omitidos sólo por HTTP autenticado/IA real explícitamente deshabilitados.
- Las suites PostgreSQL, lifecycle, agent, memory, burst, handoff y replay dejaron de omitirse. El replay recorded expuso 8 fallos: M, O, G, H y K; tres aserciones complementarias repiten M/G. M/O/H/K agotan `agentMock`; G espera 0 confirmaciones automáticas y obtiene 1.
- Evals sin llamada IA live: merge 7/7, channel 9/10, whatsapp-batches 8/9 (incluye integración PostgreSQL). Text/transcript requieren Mistral y quedaron en ERROR deliberado; whatsapp-products y whatsapp-agent también exigen proveedores reales y no se ejecutaron.
- El runner de evals no devuelve exit code distinto de cero ante un caso `fail`; hoy no puede ser gate confiable.
- Build, lint, typecheck, Prisma generate/validate y `git diff --check` se evalúan por separado en el informe principal.

## IDENTIDAD

| Escenario | Estado actual | Evidencia/observación | Criterio de aceptación pendiente |
|---|---|---|---|
| Traveler conocido con un viaje | VALIDADO AUTOMÁTICO | El resolver por `User.whatsappPhone` y `TripMember` tiene cobertura unitaria; no se ejecutó UAT real actual. | Mensaje real resuelve exactamente user/trip/company esperados y persiste receipt sin ambigüedad. |
| Traveler conocido con múltiples viajes | IMPLEMENTADO NO VALIDADO | El código ordena ACTIVE/PLANNED y v3 puede pedir aclaración; producción contiene al menos un caso elegible múltiple, no ejercitado. | Siempre pregunta cuando quedan dos opciones válidas; selección persiste y sobrevive restart. |
| Traveler con empresa | VALIDADO AUTOMÁTICO | `TripCompanyMember` y catálogo v3 están cubiertos parcialmente por tests de dominio. | Resolver la afiliación correcta de punta a punta y no mezclar empresas de otro viaje. |
| Traveler sin empresa | IMPLEMENTADO NO VALIDADO | v3 elimina viajes sin compañías elegibles y el fallback legacy puede responder con semántica distinta. | Estado explícito y copy aprobado; nunca saltar silenciosamente de pipeline. |
| Teléfono no vinculado | VALIDADO AUTOMÁTICO | El gate inbound devuelve respuesta controlada/sin procesamiento según tests; no hubo envío real. | No revelar viajes ni crear burst/captura; ofrecer proceso seguro de vinculación si fue aprobado. |
| Teléfono con formatos 54/549 | ROTO | El normalizador sólo elimina signos/separadores y compara dígitos exactos; no canoniza `54/549/0/15`. | Corpus argentino resuelve equivalencias válidas y deriva colisiones a revisión manual. |
| Usuario removido | IMPLEMENTADO NO VALIDADO | Al no existir membresía elegible puede quedar tratado como no vinculado/silencioso; política no está formalizada. | Deny-by-default, mensaje seguro y cero acceso a contexto previo no autorizado. |
| ADMIN usando WhatsApp | ROTO | El resolver exige `TripMember.role=TRAVELER`; el rol global ADMIN no habilita el canal y puede quedar silencioso. | Política aprobada y prueba para ADMIN con/sin membresía, sin bypass accidental. |
| Invitado con `User` pero sin `Account` | IMPLEMENTADO NO VALIDADO | El esquema permite identidad de dominio separada de Better Auth; queries actuales no encontraron casos sin account. | Invitación/onboarding y uso del canal siguen una política explícita sin duplicar User. |
| Persona con más de una empresa | IMPLEMENTADO NO VALIDADO | Existen selectores/herramientas; el replay PostgreSQL actual ejecutó rutas relacionadas, pero no un caso dedicado con dos empresas elegibles. | Presentar opciones estables, aceptar nombre/número y persistir la elección correcta. |
| Persona con múltiples números/alias | NO DETERMINADO | No hay modelo canónico de alias telefónico ni prueba de colisión. | Alias auditables, unicidad canónica y resolución manual de conflictos. |

## WHATSAPP

| Escenario | Estado actual | Evidencia/observación | Criterio de aceptación pendiente |
|---|---|---|---|
| Texto aislado | VALIDADO AUTOMÁTICO | Parser, extracción/merge y canal tienen tests determinísticos; proveedor live no fue llamado. | UAT real crea/actualiza una sola captura con evidencia y receipt. |
| Foto aislada | VALIDADO AUTOMÁTICO | OCR/visual, attachments y routing tienen tests mock/recorded parciales. | Imagen real sube a R2, OCR queda trazable y la captura exige revisión según política. |
| Tarjeta frente/reverso | VALIDADO AUTOMÁTICO | Replay PostgreSQL recorded E y suites de burst ejecutados localmente; no equivale a envío/imagen real. | Ambas caras quedan en una captura, sin mezclar otra ráfaga y con campos sustentados. |
| Audio | VALIDADO AUTOMÁTICO | Replay PostgreSQL recorded D/G y suites de burst ejecutados localmente; no se hizo transcripción Voxtral live. | Audio se transcribe, correlaciona con la evidencia correcta y maneja baja confianza. |
| Ráfaga mixta | VALIDADO AUTOMÁTICO | Evals de batches 8/9 y pruebas PostgreSQL cubren agrupación; el único fail debe cerrarse como NHA-009 antes de gate. | Texto/imagen/audio tardíos forman el burst correcto y llegan a un estado terminal único. |
| Mismo mensaje duplicado | VALIDADO AUTOMÁTICO | Unique IDs, advisory locks y receipts tienen cobertura; no se validó contra Evolution real. | Dos entregas del mismo external ID producen un solo mensaje, operación y captura. |
| Mensaje retrasado | VALIDADO AUTOMÁTICO | La lógica de revisión/ingestion contempla cambios de revision; el defecto operativo demuestra que no todos los terminales cierran bien. | Mensaje tardío incrementa revisión una vez, reevalúa sin loop y no roba turno a otros senders. |
| Reply a una pregunta vieja | ROTO | El replay PostgreSQL K-document-reply queda en `model_error`/`resume_limit` porque el fixture agota `agentMock`; no alcanza el estado esperado. | Reply se une por prompt/message ID o se rechaza explícitamente; no usa foco más reciente por heurística. |
| “para Broco” | VALIDADO AUTOMÁTICO | Selectores/herramientas de compañía y reglas lingüísticas tienen fixtures determinísticos. | UAT confirma selección de la empresa correcta sin inventar una nueva. |
| Selección por nombre | VALIDADO AUTOMÁTICO | Los selectores aceptan candidatos textuales en tests de dominio. | Ambigüedad/typo se aclara; nombre único confirma sólo el ID mostrado. |
| Selección por número | VALIDADO AUTOMÁTICO | Los flujos de selección indexada tienen tests de parsing/estado. | Índice fuera de rango no muta datos; opción válida usa el catálogo presentado, incluso tras restart. |
| Contexto después de deploy/restart | ROTO | Tres bursts productivos quedaron OPEN vencidos; una rama terminal no persiste `evaluatedRevision` y se reprocesa. | Estado persistido produce la misma decisión tras restart; no hay loop ni pérdida de pregunta/foco. |
| Dos empresas | IMPLEMENTADO NO VALIDADO | v3 puede listar/seleccionar; las suites DB ya se ejecutan, pero falta un caso dedicado de dos empresas elegibles. | Siempre aclara cuando ambas son elegibles; no elige por orden accidental. |
| Dos productos | VALIDADO AUTOMÁTICO | Herramientas/product flows y suites PostgreSQL ejercitan receipts idempotentes; no sustituye UAT real. | UAT selecciona/crea sólo el producto autorizado y conserva evidencia del candidato. |
| Error IA | VALIDADO AUTOMÁTICO | Provider resilience, retries/circuit breaker y errores parciales tienen tests sin consumo live. | Estado visible de retry/revisión; no autoconfirma ni duplica en recuperación. |
| Error R2 | VALIDADO AUTOMÁTICO | El adapter y manejo de subida tienen tests; no se alteró el bucket real. | Fallo deja evidencia reintentable y captura consistente; éxito posterior no duplica objeto/captura. |
| Timeout | VALIDADO AUTOMÁTICO | Providers definen timeout/retry y los tests simulan errores. | Timeout termina en código de error/estado observable y libera lease/concurrencia. |
| Retry | ROTO | Aunque hay idempotencia local, el worker productivo reclamó repetidamente la misma revisión y bloqueó trabajos posteriores. | Retry acotado con backoff, attempt/revision persistidos y avance justo entre senders. |
| Aclaración pendiente + nuevo mensaje | ROTO | Un burst productivo muestra revisión 3, `evaluatedRevision=2`, aclaración pendiente y estado OPEN vencido. | Nuevo mensaje invalida/reformula la pregunta una vez y alcanza WAITING/DONE estable. |
| Fallback legacy | IMPLEMENTADO NO VALIDADO | El webhook aún puede devolver `null` desde v3/burst y continuar por rutas antiguas. | Todo handoff es explícito, metrificado, idempotente y no cambia reglas de identidad/contexto. |
| Webhook sin autenticación | ROTO | El endpoint valida estructura/instance, no firma o secreto de origen. | Payload anónimo/alterado se rechaza antes de cualquier escritura o llamada a proveedor. |
| Burst siguiente mientras líder está atascado | ROTO | El worker toma el más antiguo y repite hasta el límite; dos bursts quedaron detrás del líder. | Scheduler evita starvation y procesa otros senders elegibles aun cuando uno falla. |

## WEB

| Escenario | Estado actual | Evidencia/observación | Criterio de aceptación pendiente |
|---|---|---|---|
| Auth | IMPLEMENTADO NO VALIDADO | Better Auth, trusted origins y gates compilan; no hubo sesión browser real en esta auditoría. | Login/logout/session expiry/redirect probados en staging candidato y dominios finales. |
| Invitación | IMPLEMENTADO NO VALIDADO | Existe flujo de miembros/invitación y tests DB locales; falta UAT browser/email real. | Invitado correcto acepta una vez, obtiene rol esperado y no crea identidad duplicada. |
| Onboarding | IMPLEMENTADO NO VALIDADO | Rutas y estado existen; no se recorrieron con browser/datos UAT. | Usuario completa/reanuda onboarding y queda asociado al viaje/empresa correctos. |
| Captura | VALIDADO AUTOMÁTICO | Lifecycle PostgreSQL y los servicios/actions se ejecutaron contra DB aislada; no es UAT browser. | Captura real persiste ownership/evidencia correctos y aparece en revisión. |
| Edición | VALIDADO AUTOMÁTICO | Mutaciones y permisos están cubiertos parcialmente por tests. | Cambios autorizados persisten; usuario no miembro recibe deny sin fuga de datos. |
| Confirmación | VALIDADO AUTOMÁTICO | Lifecycle/confirmación PostgreSQL se ejecutaron localmente; falta UAT browser. | Confirmación respeta evidencia, permisos y estado; doble submit es idempotente. |
| Dashboards | IMPLEMENTADO NO VALIDADO | Páginas/build correctos; no hubo comparación visual ni de totales contra DB. | Totales/filtros coinciden con queries de referencia y respetan acceso por viaje. |
| Personas | IMPLEMENTADO NO VALIDADO | UI y servicios existen, pero la semántica persona/User/TripMember no está formalizada por completo. | Alta/edición/remoción reflejan identidad, roles y canal sin dejar memberships incoherentes. |
| Viajes | IMPLEMENTADO NO VALIDADO | CRUD/permisos existen; no hubo UAT actual. | Estados/fechas/membresías gobiernan Web y WhatsApp de la misma forma. |
| Empresas | IMPLEMENTADO NO VALIDADO | Company/TripCompany/TripCompanyMember existen; no hubo UAT completa. | Afiliación y catálogo están limitados al viaje correcto y manejan ausencia/duplicidad. |
| Reports | IMPLEMENTADO NO VALIDADO | Rutas/build presentes; resultados no se reconciliaron con dataset conocido. | Reporte reproduce conteos/importes de query de referencia y aplica permisos/filtros. |
| Exports | IMPLEMENTADO NO VALIDADO | Código presente; no se inspeccionó un archivo exportado real. | Formato, encoding, columnas, zona horaria y permisos validados con dataset controlado. |
| Offline/reconnect | VALIDADO AUTOMÁTICO | IndexedDB queue, client IDs y reintentos tienen tests unitarios; no hay UAT física actual. | Refresh/restart/reconnect sincroniza una vez, preserva blobs y muestra conflictos. |
| Cambio de usuario con datos offline | IMPLEMENTADO NO VALIDADO | El store aplica filtros lógicos por user/trip, pero los blobs no están cifrados y no hubo UAT de aislamiento. | Logout/cambio de cuenta no expone evidencia; retención y borrado siguen política aprobada. |
| Aplicación instalable/PWA offline completa | NO DETERMINADO | No se encontró service worker/manifest que certifique una PWA completa. | Alcance offline aprobado y probado; si no es requisito, documentarlo explícitamente. |

## DATOS, WORKERS Y RELEASE

| Escenario | Estado actual | Evidencia/observación | Criterio de aceptación pendiente |
|---|---|---|---|
| Frontend/backend/DB del mismo release en producción | VALIDADO AUTOMÁTICO | Frontend y backend apuntan a `ac61c49`; producción tiene las 29 migrations del repo. | Verificador automático bloquea promoción si SHA/manifest/migrations divergen. |
| Staging representa producción | ROTO | Staging está en `97b2f31`, 52 commits y 15 migrations detrás. | Staging ejecuta el candidato exacto a promover y un schema compatible. |
| Worker sin backlog vencido | ROTO | Hay 3 bursts OPEN vencidos aproximadamente tres horas al momento de la consulta. | Cero vencidos no explicados y alerta por edad/revisión repetida. |
| Idempotencia de capturas/operaciones | VALIDADO AUTOMÁTICO | IDs cliente, unique constraints, advisory locks y receipts están presentes y testeados parcialmente. | Replay DB y redelivery real prueban cero duplicados a través de restart/deploy. |
| Integridad trip/company/creator | ROTO | Se detectó 1 captura productiva cuyo creator no es miembro del viaje; el schema no impone la relación. | Política histórica decidida; nuevas inconsistencias bloqueadas y excepciones auditadas. |
| Migration set reproducible | VALIDADO AUTOMÁTICO | `prisma migrate deploy/status` confirmó 29/29 en `nihao_audit`; suites PostgreSQL escribieron y limpiaron datos allí. | CI crea DB vacía, aplica todas y ejecuta constraints/replay en cada PR. |
| Release protegido por CI | ROTO | No hay workflows, required checks ni branch protection/rulesets; cada commit a main despliega. | Merge imposible sin gates y promoción separada con aprobación/rollback. |
| Resultado de eval bloquea release | ROTO | Un caso `fail` no cambia el exit code del runner. | Cualquier fail/error/xpass no autorizado devuelve no-cero y publica reporte. |
| Evolution real/version/webhook | IMPLEMENTADO NO VALIDADO | Lectura autenticada: API 2.3.7, instancia `open`, endpoint de webhook 200/habilitado con 2 eventos. No se envió WhatsApp ni se expuso número/URL. | UAT autorizada confirma entrega y firma/authenticidad de entrada. |
| R2 real/permisos/retención | IMPLEMENTADO NO VALIDADO | Inventario read-only: 429 objetos; 159 `SupplierAttachment` con objeto correspondiente; 12 objetos `trips/` sin fila y 258 `whatsapp/` fuera de ese modelo. CORS/lifecycle responden `AccessDenied`. | Acceso de auditoría a CORS/lifecycle y decisión de retención para los 12 objetos; no borrar por este informe. |

## Secuencia UAT mínima antes de producción

1. Incorporar la DB efímera ya validada al CI, reparar NHA-017 y hacer obligatorios todos los tests PostgreSQL/replay.
2. Cargar fixtures anonimizados para identidad 54/549, múltiples viajes, múltiples empresas, ADMIN y usuario removido.
3. Ejecutar replay determinístico de texto, foto, frente/reverso, audio grabado, ráfaga mixta, duplicado, tardío y reply viejo.
4. Simular timeouts/errores de IA, R2 y Evolution; verificar estados terminales, receipts y ausencia de duplicados.
5. Reiniciar worker entre ingestión, aclaración y confirmación; comparar estado/resultados antes y después.
6. Ejecutar UAT browser en staging para auth, invitación, onboarding, captura, revisión, reportes, export y offline/reconnect.
7. Promover el mismo SHA a canary y repetir un subconjunto real con identidades autorizadas y datos de bajo riesgo.

## Evidencia que debe acompañar cada UAT real

- SHA de frontend y backend, migration set, flags y timestamp UTC.
- Actor/rol y datos anonimizados del escenario.
- IDs enmascarados de mensaje, burst, receipt, captura y evidencia.
- Estado inicial, eventos, estado terminal y duración.
- Capturas/logs/query read-only suficientes para reproducir, sin secrets ni PII completa.
- Resultado esperado/real, aprobador y ticket de cualquier desviación.
