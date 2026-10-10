# Nihao Negocios — Estado de estabilización

Referencia operativa vigente. Los informes de [`audit/`](../audit/) conservan el diagnóstico histórico completo.

## Snapshot

- Baseline auditado: `main@ac61c49ceac083988f25d0015f0444a2a30b1d2d`; confirmado vigente al iniciar esta iteración: `main`, `origin/main` y la rama de auditoría apuntaban al mismo SHA.
- Código candidato: `stabilize/nihao`, basado en el baseline; el commit local de implementación se registra al cerrar esta iteración.
- Producción conocida por la auditoría del 2026-10-10: Vercel y Railway en `ac61c49`; no reconsultado durante esta iteración. Staging no es una referencia equivalente confirmada.
- Cambios de esta iteración: sólo locales. No hay despliegues, cambios de variables, Evolution ni bases remotas.
- Fase actual: Fase 1 — blockers; alcance exclusivo NHA-001.

## Hallazgos

- **NHA-001 — worker loop/starvation:** reportado con evidencia de producción y reproducido automáticamente antes del fix; fix implementado localmente y validado en tests unitarios/PostgreSQL. No desplegado ni validado en staging/UAT real.
- **Abiertos:** NHA-002 identidad/personas; NHA-003 autenticidad del webhook; NHA-004 CI/release; NHA-005 staging; NHA-006 rutas/contexto WhatsApp; NHA-007 política de roles; NHA-008 ownership/integridad; NHA-009 eval runner; NHA-010 certificación/UAT; NHA-011 observabilidad; NHA-012 i18n; NHA-013 documentación histórica; NHA-014 trazabilidad de deploys; NHA-015 schema/migraciones; NHA-016 offline/privacidad; NHA-017 replay; NHA-018 inventario/retención R2. Evidencia y severidades: [auditoría](../audit/NIHAO_SYSTEM_AUDIT_2026-10-09.md) y [matriz](../audit/NIHAO_TEST_MATRIX_2026-10-09.md).

## Iteración 1 — base documental + worker

- **Problema/evidencia:** un terminal de la revisión 3 conservaba `evaluatedRevision=2`. El fast path retornaba sin actualizarla; `finish()` lo trataba como supersedido y dejaba el burst `OPEN`, permitiendo que el worker reclamara repetidamente el mismo sender.
- **Decisión y causa raíz:** conservar el flujo, locking, fencing e idempotencia; corregir sólo el checkpoint terminal para persistir la revisión actual aunque el marcador terminal ya exista. Una revisión posterior sigue invalidando el terminal anterior y pasa de nuevo por el agente.
- **Trabajo:** informes históricos guardados en commit documental separado; invariante registrada en arquitectura; guard de PostgreSQL limitado a loopback + `/nihao_audit`; regresiones de fast path, revisión nueva, tres senders, persistencia, reply idempotente y estado `WAITING`.
- **Archivos:** `lib/channels/whatsapp/agent-orchestrator.ts`, tests de bursts/DB, `evals/whatsapp-agent/environment.ts`, documentación de producto/UAT/arquitectura/estado/índice.
- **Riesgo/límite:** no prueba transporte real, scheduler de producción, interacción con backlog existente ni precisión del modelo. El fix no altera bursts ya persistidos ni drena backlog.
- **Estado:** implementado localmente; no desplegado; staging no validado; UAT real pendiente.

## Integridad de evidencia y fuentes

Toda evidencia recibida debe conservar original y procedencia aunque falle IA; no se asocia por proximidad temporal ni se comunica “guardado” antes de persistencia duradera. HTTP 200 no prueba persistencia; no se promete recepción de mensajes que nunca llegaron al servidor. Aplican las políticas autorizadas de acceso y retención. Regla permanente: [experiencia de producto](../product/nihao-bot-product-experience.md#29-principios-de-producto).

En el filesystem local revisado (`/home/rcoirini/proyectos-bs`) no se encontraron las especificaciones BOT originales, minutas de mayo/junio, correcciones 1.0, conversaciones Nihao ↔ Broco, exports Nihao ↔ BOT ni fotos/medios reales. Sí están los tres informes de auditoría, documentación histórica del repositorio y fixtures sintéticos de replay. No se presupone acceso local a adjuntos enviados en ChatGPT ni se inventa contenido de fuentes ausentes.

La [matriz UAT](../uat/mvp-uat-plan.md) agrega criterios WA-INT-01..13. Su inclusión no declara que todos hayan sido reportados o reproducidos. Cada caso debe distinguir reporte, reproducción, implementación y validación con evidencia.

## Validación

- Reproducción antes del cambio: **FAIL esperado**, `evaluatedRevision` quedó en 2 para snapshot 3.
- Test unitario de bursts: **PASS**, 17/17, incluyendo terminal y revisión nueva.
- PostgreSQL local `nihao_audit`: **PASS**, 30/30 tests relacionados de bursts y agente; tres bursts distintos terminan sin que el primero monopolice reclamos. Crear un store nuevo tras finalizar confirma que PostgreSQL conserva revisión/pregunta y `WAITING`; segunda finalización conserva un solo reply y cero operaciones/capturas duplicadas en el caso terminal.
- Typecheck: **PASS**. Lint: **PASS**, cero errores y cuatro warnings preexistentes. `git diff --check`: **PASS**.
- Suite general: **FAIL** por los ocho fallos preexistentes de replay NHA-017 (tests M, O, G, H y K y aserciones dependientes); el test de replay aislado dio 22 PASS / 8 FAIL / 0 SKIP. Los mocks y expectativas no se modificaron.
- Tests, suite y typecheck corrieron con PostgreSQL local `nihao_audit`; guards sólo aceptan host loopback y ese nombre exacto. No hubo IA live, WhatsApp real ni writes remotos.
- Automáticamente validado: contrato terminal, revisión nueva, persistencia PostgreSQL, fairness del caso reproducido e idempotencia del reply.
- Validado mediante UAT real: nada en esta iteración.

## Decisiones y siguiente paso

- Aprobadas: rama única `stabilize/nihao`; informes de auditoría como baseline inmutable; corrección mínima NHA-001; sólo escritura de tests en PostgreSQL local `nihao_audit`; sin deploy/push ni cambios remotos.
- Pendientes: recuperación controlada de los tres bursts reportados; aceptación de staging equivalente y UAT humano; triage separado de NHA-017; disponibilidad y autorización de las fuentes funcionales ausentes.
- Próxima iteración recomendada: validar NHA-001 en un staging equivalente y preparar, con evidencia de lectura, un plan de drenaje para los bursts afectados. No iniciar identidad, asociación multimedia ni prompts hasta cerrar esta puerta.
- Bloqueos: staging no equivalente confirmado, falta de fuentes originales locales y ocho regresiones replay abiertas. Producción y backlog no fueron modificados.
