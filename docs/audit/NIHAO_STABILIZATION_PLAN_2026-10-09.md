# Plan de estabilización de Nihao Negocios

Fecha de corte: 2026-10-09  
Fecha de auditoría: 2026-10-10 UTC  
Alcance: plan propuesto; este documento no implementa cambios.

## Principios de ejecución

- Congelar cambios funcionales hasta eliminar los bloqueos operativos y establecer una línea base reproducible.
- Adoptar consolidación gradual, no reescritura: preservar lo que funciona, retirar rutas antiguas sólo después de migrar estado y validar replay.
- Tratar `User.whatsappPhone` como identificador de enlace, pero introducir una identidad telefónica canónica persistida y auditable.
- Hacer de v3 el único pipeline de WhatsApp para mensajes nuevos; los estados v1/v2 deben migrarse o terminarse mediante una ruta explícita.
- Ningún cambio de esquema llega a producción sin ensayo sobre una copia sanitizada, verificación de compatibilidad hacia atrás y rollback documentado.
- Promover exactamente el mismo artefacto o SHA que pasó staging/UAT.
- Un `200` del webhook o cron no constituye éxito de procesamiento; el estado terminal persistido y sus métricas sí.

## Orden y puertas de salida

| Fase | Resultado requerido para avanzar |
|---|---|
| 0 — Congelamiento | SHAs, entornos, datos de referencia y owners congelados; ramas protegidas temporalmente. |
| 1 — Blockers | Worker sin loops, backlog drenado de forma controlada, webhook autenticado y observabilidad accionable. |
| 2 — Identidad/personas | Teléfonos canónicos, resolución determinística de viaje/empresa y casos ADMIN/removido definidos y probados. |
| 3 — Pipeline WhatsApp | Un único ingreso v3 para mensajes nuevos, state machine formal, replay determinístico verde y fallbacks explícitos. |
| 4 — Web/regresión | Flujos Web y offline validados con la misma semántica de dominio y sin pérdida de evidencia. |
| 5 — CI/release | Gates obligatorios, staging actualizado desde el candidato y promoción/rollback repetibles. |
| 6 — Producción | Canary aprobado, métricas estables, UAT humana firmada y runbook operativo vigente. |

## FASE 0 — congelamiento

### F0.1 — Declarar línea base y congelar releases

- **Objetivo:** fijar `ac61c49` como línea base productiva observada y detener cambios funcionales hasta aprobar Fase 1.
- **Archivos/módulos afectados:** proceso GitHub/Vercel/Railway; sin cambios de aplicación.
- **Test de aceptación:** GitHub, Vercel, Railway y base productiva muestran el SHA/migration set registrado en la auditoría; toda excepción tiene owner, ticket y aprobación.
- **Dependencia:** ninguna.
- **Estimación:** S.
- **Requiere migration:** No.
- **Requiere deploy:** No.
- **Rollback:** retirar el freeze sólo mediante decisión explícita del responsable de producto y del responsable técnico.

### F0.2 — Capturar baseline operativo y preservar evidencia

- **Objetivo:** registrar métricas de bursts por estado/revisión, edad del backlog, receipts, latencia, errores, versión de Evolution y configuración efectiva sin secretos.
- **Archivos/módulos afectados:** consultas read-only; paneles/logs; documentación operativa futura.
- **Test de aceptación:** snapshot fechado y anonimizado reproducible por otro operador, con queries versionadas y sin PII/secrets.
- **Dependencia:** F0.1.
- **Estimación:** S.
- **Requiere migration:** No.
- **Requiere deploy:** No.
- **Rollback:** no aplica; es una captura read-only.

### F0.3 — Nombrar owners y criterio de incidente

- **Objetivo:** asignar responsables de WhatsApp, identidad/datos, Web, plataforma y UAT; definir cuándo pausar el canal.
- **Archivos/módulos afectados:** runbook/proceso.
- **Test de aceptación:** cada alerta P1 tiene owner primario/secundario, SLA y canal de escalamiento.
- **Dependencia:** F0.1.
- **Estimación:** S.
- **Requiere migration:** No.
- **Requiere deploy:** No.
- **Rollback:** revertir el cambio organizativo mediante aprobación de los mismos responsables.

## FASE 1 — blockers

### F1.1 — Corregir la invariancia de revisión del worker

- **Objetivo:** garantizar que todo resultado terminal registra la revisión evaluada y que una revisión no modificada no vuelve a procesarse indefinidamente.
- **Archivos/módulos afectados:** `lib/whatsapp/burst/agent-orchestrator.ts`, `lib/whatsapp/burst/agent-service.ts`, `lib/whatsapp/burst/prisma-burst-store.ts`, state/result types y pruebas del worker.
- **Test de aceptación:** fixture que reproduce un burst terminal con aclaración en revisión N termina `WAITING` o `DONE`, persiste `evaluatedRevision=N`, no se reclama otra vez y permite procesar el siguiente sender; prueba PostgreSQL obligatoria.
- **Dependencia:** F0.2.
- **Estimación:** M.
- **Requiere migration:** No, salvo que se agregue una restricción/columna de lease; esa decisión debe separarse.
- **Requiere deploy:** Sí, backend.
- **Rollback:** redeploy del artefacto anterior y pausa explícita del cron; no revertir datos terminales sin script revisado.

### F1.2 — Drenar el backlog con un procedimiento controlado

- **Objetivo:** resolver los bursts abiertos/esperando sin duplicar capturas ni perder replies, después de F1.1.
- **Archivos/módulos afectados:** runbook de recuperación, queries de inspección, receipts y estados persistidos.
- **Test de aceptación:** cero bursts vencidos no explicados; cada mensaje queda asociado a un receipt/captura o a un estado de revisión explícito; reconciliación antes/después firmada.
- **Dependencia:** F1.1 desplegado y verificado en staging.
- **Estimación:** M.
- **Requiere migration:** No.
- **Requiere deploy:** No necesariamente; sí requiere una operación productiva aprobada.
- **Rollback:** detener el drenaje; restaurar desde backup sólo ante corrupción demostrada. Toda transición debe ser idempotente y registrada.

### F1.3 — Autenticar el webhook de Evolution

- **Objetivo:** impedir que payloads fabricados activen procesamiento, proveedores o escrituras.
- **Archivos/módulos afectados:** route del webhook, parser/config de Evolution, proxy/WAF si corresponde, tests de autenticación.
- **Test de aceptación:** request válido firmado/autorizado se acepta; request sin credencial, alterado o de instancia distinta se rechaza sin crear mensajes, bursts ni capturas; rotación ensayada.
- **Dependencia:** acceso administrativo a Evolution y confirmación del mecanismo compatible con su versión real.
- **Estimación:** M.
- **Requiere migration:** No.
- **Requiere deploy:** Sí, backend y cambio coordinado en Evolution.
- **Rollback:** ventana de doble-validación temporal con dos credenciales; nunca volver a aceptación anónima como rollback silencioso.

### F1.4 — Hacer observable el resultado real del cron/worker

- **Objetivo:** separar `accepted` de `completed` y alertar loops, starvation, backlog y fallas terminales.
- **Archivos/módulos afectados:** endpoint batch, `after()`/worker, logging estructurado, métricas y alertas.
- **Test de aceptación:** un job fallido produce estado/métrica correlacionable por run ID; alerta por edad máxima y repetición de la misma revisión; un `200 accepted` no marca el trabajo como exitoso.
- **Dependencia:** F1.1.
- **Estimación:** M.
- **Requiere migration:** Posible, si se persisten ejecuciones; decidir mediante ADR.
- **Requiere deploy:** Sí.
- **Rollback:** desactivar sólo la nueva persistencia/alerta, conservando logs; no eliminar métricas históricas.

### F1.5 — Reparar catálogo español faltante

- **Objetivo:** eliminar el error runtime `services.academy.cardText` para locale `es`.
- **Archivos/módulos afectados:** catálogos i18n y prueba de completitud de claves.
- **Test de aceptación:** comparación automática de claves entre locales sin faltantes; render del módulo en español sin warnings.
- **Dependencia:** ninguna técnica; puede viajar con release F1.
- **Estimación:** S.
- **Requiere migration:** No.
- **Requiere deploy:** Sí, frontend.
- **Rollback:** redeploy del catálogo anterior; el gate de completitud debe permanecer.

## FASE 2 — identidad/personas

### F2.1 — Definir el contrato canónico de identidad

- **Objetivo:** formalizar `User`, persona/contacto, teléfono, `TripMember`, rol por viaje y afiliación `TripCompanyMember`, incluyendo invitados, removidos y administradores.
- **Archivos/módulos afectados:** ADR de identidad; repositorios de identidad; esquema Prisma futuro; UX de vinculación.
- **Test de aceptación:** tabla de decisión aprobada para todos los escenarios de identidad de la matriz; ninguna resolución depende del pipeline que recibió el mensaje.
- **Dependencia:** F0.3.
- **Estimación:** M.
- **Requiere migration:** No para la definición; probablemente Sí para la implementación F2.2.
- **Requiere deploy:** No para la definición.
- **Rollback:** versionar el ADR; cualquier cambio posterior debe documentar compatibilidad y migración.

### F2.2 — Canonicalizar teléfonos argentinos y preservar alias

- **Objetivo:** resolver de forma inequívoca `+54`, `549`, prefijos `0` y `15`, sin destruir el valor original ni fusionar personas automáticamente.
- **Archivos/módulos afectados:** normalizador único, modelo de teléfono/aliases, imports/invitaciones, webhook y pantallas administrativas.
- **Test de aceptación:** corpus versionado de formatos argentinos e internacionales; colisiones generan revisión manual; búsqueda y unicidad usan el valor canónico; backfill dry-run reporta impacto antes de escribir.
- **Dependencia:** F2.1 y aprobación de reglas de negocio/países soportados.
- **Estimación:** L.
- **Requiere migration:** Sí.
- **Requiere deploy:** Sí, compatible hacia atrás en fases expand/backfill/contract.
- **Rollback:** conservar columnas/alias anteriores durante al menos un ciclo; feature flag de lectura dual; backup y reporte de backfill reversible.

### F2.3 — Unificar resolución de viaje y empresa

- **Objetivo:** usar un único servicio de dominio para Web, v3, migración legacy y futuras integraciones.
- **Archivos/módulos afectados:** identity repository, `trip-catalog`, conversation repository, selectors/tools y pruebas de permisos.
- **Test de aceptación:** misma entrada produce la misma lista/elección en todos los canales; múltiples viajes/empresas siempre aclaran; cero empresas no cae silenciosamente a otra semántica.
- **Dependencia:** F2.1; F2.2 para teléfono.
- **Estimación:** L.
- **Requiere migration:** No necesariamente.
- **Requiere deploy:** Sí.
- **Rollback:** feature flag por resolver, con telemetría de comparación shadow; retirar el resolver anterior sólo tras equivalencia aprobada.

### F2.4 — Definir ADMIN, removidos e invitados en WhatsApp

- **Objetivo:** reemplazar silencios ambiguos por decisiones de autorización explícitas y mensajes seguros.
- **Archivos/módulos afectados:** gate inbound, servicio de identidad, permisos por viaje, copys y pruebas.
- **Test de aceptación:** ADMIN con/sin membresía, miembro removido e invitado no vinculado reciben el resultado definido sin filtrar información de viajes/empresas.
- **Dependencia:** F2.1 y decisión humana sobre política ADMIN.
- **Estimación:** M.
- **Requiere migration:** Posible para invitaciones/aliases, no para la política básica.
- **Requiere deploy:** Sí.
- **Rollback:** flag de política por rol; conservar deny-by-default.

### F2.5 — Reforzar integridad de ownership

- **Objetivo:** impedir nuevas capturas con trip/company/creator/traveler incoherentes y clasificar las históricas sin borrarlas.
- **Archivos/módulos afectados:** servicios de captura, constraints/triggers viables, scripts de auditoría y UI de revisión.
- **Test de aceptación:** transacciones inválidas fallan antes del commit; fixtures históricos permanecen legibles; reporte de excepciones queda en cero o con waiver documentado.
- **Dependencia:** F2.1 y análisis de la captura huérfana productiva.
- **Estimación:** L.
- **Requiere migration:** Sí, si se incorporan constraints o tabla de excepciones.
- **Requiere deploy:** Sí, expand/contract.
- **Rollback:** constraints inicialmente `NOT VALID`/equivalente y validación posterior; rollback de código compatible, nunca borrado automático.

## FASE 3 — pipeline WhatsApp

### F3.1 — Formalizar una state machine única

- **Objetivo:** definir estados, eventos, invariantes y transiciones de mensaje, burst, aclaración, operación y evidencia.
- **Archivos/módulos afectados:** tipos de dominio, store, service/orchestrator, receipts, pending evidence y documentación técnica.
- **Test de aceptación:** modelo ejecutable cubre duplicado, mensaje tardío, reply viejo, restart, timeout y retry; transiciones imposibles son rechazadas y auditadas.
- **Dependencia:** F1.1 y F2.3.
- **Estimación:** L.
- **Requiere migration:** Probable para constraints/versionado/eventos.
- **Requiere deploy:** Sí, por etapas.
- **Rollback:** lectores compatibles con ambas versiones de estado; migración reversible o forward-fix ensayado.

### F3.2 — Convertir v3 en ingreso canónico para mensajes nuevos

- **Objetivo:** eliminar selección implícita entre simple, card v1, batch v1, burst v2 y v3 para tráfico nuevo.
- **Archivos/módulos afectados:** webhook router, flags, burst dispatcher, legacy handlers y tests end-to-end.
- **Test de aceptación:** cada `externalMessageId` entra en un solo pipeline y genera un único receipt; ningún fallback cambia semántica sin evento explícito.
- **Dependencia:** F3.1 y replay verde.
- **Estimación:** L.
- **Requiere migration:** Posible para marcar/migrar conversaciones legacy.
- **Requiere deploy:** Sí, canary por instancia/allowlist.
- **Rollback:** flag explícito a un adaptador legacy delimitado, no fallback automático; preservar receipts para evitar reproceso.

### F3.3 — Migrar o finalizar estados legacy

- **Objetivo:** inventariar cada conversación/batch v1/v2 no terminal y darle una transición segura a v3 o cierre explicable.
- **Archivos/módulos afectados:** tablas legacy, adaptadores, herramienta de dry-run y runbook.
- **Test de aceptación:** cero estados legacy activos sin plan; conteos antes/después coinciden; mensajes/capturas no se duplican.
- **Dependencia:** F3.1 y F3.2 listos en staging.
- **Estimación:** L.
- **Requiere migration:** Posible.
- **Requiere deploy:** Sí si el adaptador se ejecuta en runtime; operación separada y aprobada para datos.
- **Rollback:** snapshot/backup, dry-run y lote pequeño; reversión por mapping persistido, no por heurística.

### F3.4 — Consolidar contexto y memoria

- **Objetivo:** una sola fuente persistida y versionada de foco/contexto, con TTL y procedencia explícitos.
- **Archivos/módulos afectados:** `WhatsAppAgentContext`, burst state, recent memory, pending evidence, conversation/batch context y prompt assembly.
- **Test de aceptación:** restart/deploy no altera el resultado; reply a pregunta vieja se correlaciona por ID; contexto expirado no se reutiliza; replay produce el mismo contexto.
- **Dependencia:** F3.1.
- **Estimación:** L.
- **Requiere migration:** Sí, probablemente.
- **Requiere deploy:** Sí.
- **Rollback:** lectura dual y escritura versionada; conservar snapshots anteriores hasta cerrar UAT.

### F3.5 — Hacer explícitos los fallbacks de IA y transporte

- **Objetivo:** diferenciar retry técnico, degradación, revisión humana y rechazo, sin confirmar información no sustentada.
- **Archivos/módulos afectados:** provider resilience, OCR/audio/text, agent tools, evidence policy, mensajes al usuario y métricas.
- **Test de aceptación:** fallas Mistral/OpenAI/R2/Evolution simuladas terminan en estados definidos; ninguna ruta confirma datos sin evidencia requerida; circuit breaker visible.
- **Dependencia:** F3.1.
- **Estimación:** M.
- **Requiere migration:** Posible para reason/error codes.
- **Requiere deploy:** Sí.
- **Rollback:** flag de política de fallback; nunca volver a confirmación silenciosa.

### F3.6 — Convertir replay y evals en gates representativos

- **Objetivo:** ejecutar el código productivo con PostgreSQL local aislado, proveedores grabados y fixtures anonimizados de regresiones reales.
- **Archivos/módulos afectados:** scripts de replay/evals, tapes, fixtures, configuración de DB efímera y reporting.
- **Test de aceptación:** suites A–J y casos de identidad/bursts pasan desde cero; cualquier `fail` devuelve exit code distinto de cero; no hay llamadas live.
- **Dependencia:** entorno de test aislado y F1.1 fixture.
- **Estimación:** M.
- **Requiere migration:** Sólo en la DB efímera de test, nunca en staging/producción.
- **Requiere deploy:** No.
- **Rollback:** revertir fixtures/runner; conservar reportes de comparación.

## FASE 4 — Web/regresión

### F4.1 — Alinear captura Web y WhatsApp al mismo dominio

- **Objetivo:** compartir reglas de ownership, proveedor/producto, evidencia, confirmación y revisión humana.
- **Archivos/módulos afectados:** capture services/actions, WhatsApp tools, schemas de extracción y validadores.
- **Test de aceptación:** el mismo caso produce entidades e invariantes equivalentes en Web y WhatsApp; diferencias de UX quedan documentadas.
- **Dependencia:** F2.5 y F3.1.
- **Estimación:** L.
- **Requiere migration:** No necesariamente.
- **Requiere deploy:** Sí.
- **Rollback:** rutas de presentación separadas sobre servicios de dominio versionados; volver al servicio anterior por flag temporal.

### F4.2 — Ejecutar UAT Web completa

- **Objetivo:** validar auth, invitación, onboarding, capturas, edición, confirmación, dashboards, personas, viajes, empresas, reportes y exports.
- **Archivos/módulos afectados:** suite browser/UAT, fixtures y runbook; aplicación sólo si aparecen fixes aprobados.
- **Test de aceptación:** todos los escenarios Web de la matriz con evidencia, actor, entorno, SHA y resultado; cero P0/P1 abiertos.
- **Dependencia:** staging en el mismo candidato y datos UAT sanitizados.
- **Estimación:** L.
- **Requiere migration:** No para UAT.
- **Requiere deploy:** No adicional al candidato de staging.
- **Rollback:** restaurar dataset UAT; no tocar producción.

### F4.3 — Validar y endurecer offline/reconnect

- **Objetivo:** probar aislamiento por usuario, reconexión, duplicados, expiración de sesión y protección local de evidencia.
- **Archivos/módulos afectados:** IndexedDB/offline queue, sync, auth boundary y UI de conflictos.
- **Test de aceptación:** refresh/restart/reconnect no duplica; cambio de usuario no expone blobs; logout y retención cumplen política aprobada; conflictos son visibles.
- **Dependencia:** F4.1 y decisión de seguridad sobre cifrado/retención local.
- **Estimación:** M.
- **Requiere migration:** No de servidor; puede requerir versión/migración IndexedDB.
- **Requiere deploy:** Sí.
- **Rollback:** versionar el store local y mantener lectura compatible; no borrar blobs sin confirmación/sync.

## FASE 5 — CI/release

### F5.1 — Adoptar `main` como única rama permanente

- **Objetivo:** aplicar la estrategia B: ramas cortas, preview por PR, staging con el candidato exacto y promoción del mismo artefacto a producción.
- **Archivos/módulos afectados:** GitHub settings, Vercel/Railway deployment policy y runbook.
- **Test de aceptación:** `develop` deja de desplegar; staging y producción reportan el mismo SHA durante promoción; no existe merge directo fuera del procedimiento de emergencia.
- **Dependencia:** aprobación humana de estrategia y limpieza de ramas luego de preservar referencias necesarias.
- **Estimación:** M.
- **Requiere migration:** No.
- **Requiere deploy:** Cambio de configuración; no un deploy funcional por sí solo.
- **Rollback:** reactivar temporalmente el flujo anterior sólo con incidente documentado; conservar branch pointers hasta cerrar transición.

### F5.2 — Configurar checks obligatorios y protección

- **Objetivo:** bloquear merges sin install lockfile, generate/validate, lint, typecheck, test, build, replay PostgreSQL y diff check.
- **Archivos/módulos afectados:** `.github/workflows`, branch protection/rulesets, required environments.
- **Test de aceptación:** PR con test fallido, migration drift o eval `fail` no puede mergearse; administrador tampoco bypassea sin evento auditable.
- **Dependencia:** F3.6 estable.
- **Estimación:** M.
- **Requiere migration:** No.
- **Requiere deploy:** No.
- **Rollback:** deshabilitar sólo el check defectuoso con waiver temporal y ticket; conservar el resto.

### F5.3 — Separar migrations de arranque/promoción y ensayar rollback

- **Objetivo:** aplicar migrations una vez, con backup, lock, compatibilidad y aprobación, antes de promover código dependiente.
- **Archivos/módulos afectados:** Railway deploy config, pipeline, Prisma migrations y runbook.
- **Test de aceptación:** ensayo expand/contract en copia sanitizada; dos versiones adyacentes de aplicación funcionan durante la ventana; restore/forward-fix medido.
- **Dependencia:** F5.2 y owner de datos.
- **Estimación:** L.
- **Requiere migration:** No para el pipeline; las releases futuras sí siguen el proceso.
- **Requiere deploy:** Cambio de configuración/pipeline.
- **Rollback:** promoción separada permite volver al artefacto compatible; migration destructiva prohibida sin plan de restore.

### F5.4 — Añadir smoke post-deploy y verificación de release

- **Objetivo:** comprobar SHA, migration set, flags, salud de workers y flujos sintéticos no destructivos.
- **Archivos/módulos afectados:** release verifier, endpoints de salud, métricas y GitHub deployment status.
- **Test de aceptación:** release se rechaza si frontend/backend/DB no coinciden, backlog crece o smoke no llega a estado terminal.
- **Dependencia:** F1.4 y F5.3.
- **Estimación:** M.
- **Requiere migration:** Posible si se guarda release manifest.
- **Requiere deploy:** Sí.
- **Rollback:** volver al artefacto anterior mediante promoción; preservar manifest/logs.

## FASE 6 — producción

### F6.1 — Promover mediante canary controlado

- **Objetivo:** exponer el pipeline estabilizado a un conjunto pequeño de identidades autorizadas antes del total.
- **Archivos/módulos afectados:** configuración de rollout/allowlist, observabilidad y runbook.
- **Test de aceptación:** canary completa matriz prioritaria con cero duplicados, loops o pérdida de contexto; métricas comparadas contra baseline.
- **Dependencia:** fases 1–5 y aprobación de UAT.
- **Estimación:** M.
- **Requiere migration:** Sólo las ya ensayadas/aprobadas.
- **Requiere deploy:** Sí.
- **Rollback:** flag/allowlist revierte tráfico al modo seguro explícito; redeploy del artefacto anterior si es compatible con schema.

### F6.2 — UAT humana productiva de bajo riesgo

- **Objetivo:** validar el canal real, dispositivos y proveedor sin usar datos sensibles innecesarios.
- **Archivos/módulos afectados:** checklist/runbook; no código salvo fixes posteriores aprobados.
- **Test de aceptación:** evidencias firmadas para identidad, texto, imagen, frente/reverso, audio, aclaraciones, restart y retry; cada caso registra SHA y timestamps.
- **Dependencia:** F6.1 estable.
- **Estimación:** M.
- **Requiere migration:** No.
- **Requiere deploy:** No adicional.
- **Rollback:** detener canary y revertir según F6.1.

### F6.3 — Rollout total con ventana de observación

- **Objetivo:** activar gradualmente y cerrar la estabilización sólo después de métricas estables.
- **Archivos/módulos afectados:** rollout config, alertas y status report.
- **Test de aceptación:** durante la ventana acordada: cero bursts vencidos, tasa de duplicación cero, errores bajo umbral, receipts completos y UAT sin regresiones P1.
- **Dependencia:** F6.2 aprobada.
- **Estimación:** M.
- **Requiere migration:** No adicional.
- **Requiere deploy:** Sí, promoción/flag final.
- **Rollback:** reducción inmediata del rollout y redeploy/promoción del último artefacto compatible.

### F6.4 — Cerrar ramas y documentación obsoleta

- **Objetivo:** archivar/eliminar ramas sólo después de documentar su destino y actualizar estado operativo desde evidencia.
- **Archivos/módulos afectados:** ramas Git, documentación de arquitectura/operación, changelog de release.
- **Test de aceptación:** tabla de ramas sin ambigüedad; documentos citan SHA/migration set/fecha; ninguna rama con commits únicos se elimina sin decisión explícita.
- **Dependencia:** rollout estable y decisión sobre PR #9/#1.
- **Estimación:** S.
- **Requiere migration:** No.
- **Requiere deploy:** No.
- **Rollback:** las ramas eliminadas deben ser recuperables por SHA/tag de archivo durante el período acordado.

## Decisiones humanas previas a implementación

1. Aprobar `main` como única rama permanente y definir quién puede promover a producción.
2. Definir política de uso de WhatsApp para ADMIN, usuarios removidos, invitados y personas sin empresa.
3. Aprobar reglas exactas de normalización por país y tratamiento manual de colisiones.
4. Definir si la captura histórica cuyo creador no pertenece al viaje es válida por preservación histórica o inconsistencia a reparar.
5. Confirmar versión/capacidades reales de Evolution y método de autenticación del webhook.
6. Aprobar retención/cifrado de blobs offline y evidencia local.
7. Asignar owners y umbrales de rollout/rollback.

## Priorización resumida

1. Congelar y preservar evidencia.
2. Corregir loop/starvation, autenticar webhook y observar ejecución real.
3. Unificar identidad, teléfono, viaje y empresa.
4. Formalizar state machine y consolidar v3 con replay PostgreSQL obligatorio.
5. Validar Web/offline y UAT integral.
6. Proteger `main`, promover el mismo candidato y separar migrations.
7. Canary, UAT real, rollout gradual y limpieza posterior.

## Continuación de auditoría — 2026-10-10 UTC

La base PostgreSQL local aislada `nihao_audit` ya permitió aplicar/verificar las 29 migraciones y ejecutar las suites antes opt-in. Resultado: 746/756 tests aprobaron, 8 fallaron y sólo 2 skips permanecen, ambos de HTTP autenticado o IA real expresamente no habilitada. Los tests que fallan son el replay recorded M/O/G/H/K y aserciones dependientes: cuatro fixtures agotan el guion `agentMock` y G discrepa sobre una confirmación automática. No habilitar IA live para compensarlo.

Se mantiene la estrategia de consolidación gradual, pero se inserta el siguiente trabajo bloqueante antes de declarar un gate de release:

### F0.3 — Reparar el contrato determinístico de replay

- **Objetivo:** hacer que M/O/G/H/K representen el contrato actual o, si exponen regresión funcional, corregirla con fixture y baseline versionados.
- **Aceptación:** 0 fallos de replay PostgreSQL recorded; la reproducción con tape no llama red y conserva conteos/efectos; un `FAIL` hace que el runner termine distinto de cero.
- **Límite:** no activar OpenAI, Mistral, Voxtral ni Evolution live; no cambiar el fixture sólo para ocultar una divergencia sin decisión de producto.

### F0.4 — Cerrar retención/reconciliación R2

- **Objetivo:** decidir el destino de 12 objetos `trips/` sin `SupplierAttachment` y obtener lectura de CORS/lifecycle.
- **Aceptación:** clasificación documentada de objetos `whatsapp/` frente a `SupplierAttachment`, owner de retención y acceso read-only que permita inspeccionar reglas. Ninguna eliminación automática forma parte de este plan.
