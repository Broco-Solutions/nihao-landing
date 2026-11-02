# Fallos de WhatsApp: diagnóstico y corrección local — 2/11/2026

Base revisada: `main@af621b2`. Candidato en `fix/whatsapp-finalization-20261102`, sin merge ni despliegue productivo. La investigación usó logs Railway, consultas PostgreSQL con `default_transaction_read_only=on`, reconstrucción con PostgreSQL local 16.15 y una imagen sintética para verificar el contrato de Mistral. No se enviaron mensajes/correos ni se modificaron datos productivos. Credenciales, conversaciones y lecturas privadas quedan fuera de Git.

## Seguimiento de correos — 2/11, 11:29 UTC

Los correos más recientes comprobados son recordatorios de incidentes ACTIVE, no confirmaciones de una recuperación. El de las 08:24 UTC corresponde a `b311a3cf…`, abierto el 1/11 a las 06:53 UTC. La cadencia diaria de incidentes históricos publicada el 31/10 funciona, pero no corrige ni recupera esos trabajos. También hubo nuevas ráfagas FAILED el 2/11 a las 02:37 y 03:01 UTC: no se puede atribuir todo el correo a incidentes anteriores a la última investigación.

Railway confirma bot y monitor SUCCESS sobre **`af621b217f0d67758d6c305f2ff5cdcd2e47b792`**, publicados el 31/10. El [PR #92](https://github.com/Broco-Solutions/nihao-landing/pull/92), con las correcciones detalladas abajo, continúa abierto. Antes de este seguimiento, su SHA `bfd87b4` tenía `verify`, `browser-uat` y Vercel Preview aprobados. Tener el parche y CI verde no equivale a haberlo publicado.

Snapshot PostgreSQL en transacción READ ONLY, 11:29:32 UTC:

- **7 alertas activas:** una PROCESSING_FAILURE con 7 ráfagas FAILED y seis FUNCTIONAL_TOOL_ERROR individuales; **13 ráfagas afectadas** en total.
- 170 ráfagas: 72 DONE, 91 WAITING y 7 FAILED. WAITING por sí solo no significa un fallo: también representa aclaraciones/revisión. Una cola ejecutable vacía tampoco demuestra recuperación de FAILED.
- 281 mensajes: 171 STORED y 110 NOT_REQUIRED. 217 respuestas: 50 DELIVERED y 167 READ. No había originales ni respuestas pendientes según el estado del monitor; este snapshot no vuelve a comprobar objetos R2 ni recepción física en dispositivos.
- Evolution `open`, webhook válido en los logs contemporáneos, cero errores de consulta de Evolution; Web y raíz API HTTP 200. No se detectaron receipts de creación repetidos hacia el mismo recurso en la consulta disponible; no certifica ausencia universal de duplicados comerciales.

El auditor `scripts/audit-whatsapp-reliability.mts` ahora incluye estado del monitor, alertas activas y datos de intentos/último error, separados del inventario. Se ejecutó la versión ampliada contra producción usando una sesión READ ONLY y sin cargar clientes de proveedores. Evidencia privada: `auditorias/reliability-20261102/nihao-alert-followup-20261102.json`, fuera de Git. El auditor no modifica alertas ni recupera ráfagas.

### Recuperación pendiente por tipo de incidente

| Incidente | Evidencia y acción requerida después de publicar |
| --- | --- |
| PROCESSING_FAILURE: `55925002…`, `dcf022af…`, `211fb3f3…`, `f7fef3b2…`, `98f078c9…`, `c019ac72…`, `ee281b10…` | Cinco intentos por ráfaga y error histórico genérico `Error`; la reconstrucción previa reprodujo la discrepancia de identidad en tres casos. Los otros cuatro fallos no se declaran reproducidos individualmente. Revisar cada fuente y destino con el candidato; reutilizar los tres efectos ya persistidos en `55925002…`. No reabrir las siete en bloque ni descartar su estado. |
| `c58e48eb…` / INVALID_QUOTE | Revisión durable, sin escrituras. La prevención de repetición ya está en producción; la corrección de código no borra el error histórico. Verificar la fuente antes de conciliarlo como revisión. |
| `da31f1af…` / PRODUCT_CANNOT_CREATE_SUPPLIER | Sin operaciones; tres cargas en revisión. La prevención de asociación ya deriva a aclaración autorizada. Conservar la selección del proveedor para revisión, sin crear uno sustituto. |
| `b4f447bb…` / UNFINISHED_OPERATION | Sin operaciones; dos cargas en revisión. La prevención de cierres repetidos no recupera automáticamente esta revisión anterior. |
| `3145af27…` / OPTIONAL_PRODUCT_DETAILS | Una verificación superior fallida y dos cargas GROUPED. La corrección visual puede eliminar el fallo previo; la recuperación y el recorrido posterior de esta ráfaga siguen sin comprobarse. No admite conciliación directa mientras conserve trabajo activo. |
| `60516fc7…` / UNGROUNDED_NAME | Cinco cargas en revisión, fallos visuales previos y dos aclaraciones rechazadas; sin escrituras. El candidato corrige el contrato visual, pero no se afirma que elimine toda posible generación de nombres no fundamentados por el modelo. Mantener las guardas de evidencia y revisar las fuentes. |
| `b311a3cf…` / UNVERIFIED_RESPONSE | Dos productos ya persistidos, respuesta READ y una carga EVIDENCE en revisión. El candidato corrige el rechazo del cierre. Verificar efectos y evidencia restante sin crear de nuevo los productos. |

La herramienta existente de conciliación requiere fuentes durables, entrega confirmada, operaciones y cargas quietas y una resolución auditada ligada al error/revisión exactos. No reejecuta FAILED ni resuelve decisiones comerciales por inferencia. Ninguna de estas trece ráfagas se marcó recuperada en este seguimiento.

### Publicación concreta preparada, pendiente de autorización

1. Integrar únicamente #92 después de los checks del SHA final; publicar ese código en Web, bot y monitor existentes. Registrar SHA y deployments actuales de rollback: bot `b46fbc02-46cc-4afa-83d9-9bfe694727ac`, monitor `7419af56-048b-45a7-9727-40378973ea67`; identificar el artefacto Web antes de promover. No requiere migración.
2. Verificar despliegues terminados, webhook, monitor y auditor READ ONLY. No usar el estado Online de Railway como criterio único de cierre.
3. Recuperar cada incidente con sus fuentes, operaciones y destinos actuales; dejar revisión explícita donde falte una decisión humana. No reenviar respuestas históricas ni ejecutar reingesta ciega. Las escrituras de recuperación requieren autorización específica de producción.
4. Observar al menos dos ciclos del monitor después de cada recuperación válida; verificar que desaparece el hallazgo correspondiente y conservar los avisos de otros problemas reales. El monitor puede emitir su correo normal de recuperación; no se envió ninguno manualmente.

La instrucción AGENTS.md del responsable exige intervención para deploy, merge a main y modificaciones de datos reales. Por eso este seguimiento deja el diagnóstico y la preparación completos sin ejecutar esas acciones. No se promete ausencia futura de errores ni se certifica WhatsApp físico o semántica de IA sin evidencia.

Validación repetida en este seguimiento: **144 tests focalizados, 143 PASS, 0 FAIL y 1 SKIP PostgreSQL**; typecheck PASS. La suite completa PostgreSQL y Chromium del candidato constan abajo y en CI; no se presentaron como repetidos localmente en esta sesión, donde no hay PostgreSQL local disponible.

## Causas y cambios

1. **La verificación visual de respaldo enviaba un parámetro inválido.** `readOriginalImage` enviaba `reasoning_effort: none` a `mistral-large-4-0`. Una solicitud real con imagen sintética reprodujo HTTP 400, código 3051: sólo admite `low`, `medium`, `high`. Desde el 1/11, el inventario leído contiene 15 errores `INVALID_ASSET_OR_RESPONSE/superior_vision` y tres `support_verification`. Se cambia a `low`; la misma prueba sintética devuelve HTTP 200 y una lectura aceptada por el parser. No se alteran modelo, claves ni guardas de reconciliación. Una lectura genuinamente ambigua sigue requiriendo revisión.
2. **Dos etapas interpretaban distintas fuentes para elegir proveedor.** La ingesta automática resolvía con el caption del viajero; `write` volvía a resolver con la descripción visual incorporada a los FACTS. Frases descriptivas como «estantería para revistas» activaban la heurística de destino explícito. Tres ráfagas de fotos productivas quedaron FAILED tras cinco intentos, sin operaciones del agente; su código histórico sólo conserva `Error`. La reconstrucción aislada con sus lecturas, medios sintéticos y un proveedor de prueba reprodujo `AMBIGUOUS_TARGET`; después del cambio produce 1, 1 y 2 productos respectivamente. La validación de destino usa ahora captions y texto/audio aportado por el viajero; OCR/descripción visual sigue fundamentando el producto, sin aportar instrucciones de destino. Se mantienen autorización, selección, conflictos, leases e idempotencia.
3. **Una prosa inocua invalidaba un cierre después de escrituras reales.** Una ráfaga con dos productos persistidos terminó `UNVERIFIED_RESPONSE` cuando el modelo respondió con una explicación general sin nuevas escrituras. En turnos con recibos COMPLETED y sin QUERY, se omite `response`: el renderizador comunica exclusivamente los efectos verificados. Se siguen validando outcomes, tipo de operación, FACTS, cargas y propuestas pendientes; una escritura incompleta no se completa por omitir la prosa. Las consultas y los turnos sin escrituras conservan las guardas contra afirmaciones no verificadas.

## Validación

- Regresiones sintéticas PostgreSQL: tres descripciones con «para», producto/adjunto/proveedor correctos y reintento sin duplicación.
- Regresión de cierre: prosa inocua o afirmación falsa se omite ante efectos persistidos; la salida sólo muestra recibos reales. Escrituras declaradas sin recibo propio siguen rechazadas.
- Contrato visual: regresión offline del esfuerzo admitido y prueba real Mistral con imagen sintética (400 antes, 200 después).
- Suite completa con PostgreSQL local: **985 tests, 983 PASS, 0 FAIL, 2 SKIP** (evaluaciones de IA real opt-in); código de salida 0.
- `pnpm typecheck`, `pnpm prisma:validate`, `pnpm lint`, `pnpm build` y `git diff --check`: **PASS**. Lint conserva tres advertencias previas (dos navegaciones y un import sin uso).
- No se ejecutó UAT física ni Luna real. El ensayo real de Mistral usa únicamente una imagen sintética. Los logs de validación y las lecturas privadas se conservan fuera de Git en `auditorias/reliability-20261102/`.

Para repetir la suite, usar exclusivamente PostgreSQL aislado en loopback y base `/nihao_audit`: establecer `DATABASE_URL`, `EVAL_AGENT_DATABASE_URL` y `WHATSAPP_BURST_TEST_DATABASE_URL` a esa instancia, aplicar migraciones locales y ejecutar `pnpm test`. No cargar variables productivas en ese proceso.

## Alcance pendiente

Estos cambios no están en producción. No se reprocesaron las ráfagas fallidas, no se conciliaron alertas ni se resolvieron decisiones comerciales históricas. Publicar y recuperar datos reales requiere autorización según las instrucciones del proyecto. La reconstrucción aislada demuestra el defecto de lógica y su corrección; no sustituye observar el recorrido físico WhatsApp → almacenamiento → escritura → respuesta → Web después de publicar.


## Preparación adicional del candidato

- Cinco regresiones seleccionadas ejecutadas contra `main@af621b2`: **0 PASS / 5 FAIL**, con las mismas pruebas y esquema PostgreSQL. Contra el candidato: **5 PASS / 0 FAIL**. Esto demuestra que los controles detectan los defectos anteriores.
- Recorrido nuevo con `PrismaBurstStore`, lector y dominio reales, PostgreSQL y almacenamiento local: recepción de foto → hash/original → proveedor → producto/adjunto → caída antes del cierre → recuperación → outbox → redelivery → proyección Web. **PASS**, con un producto, un adjunto y una respuesta; descarga y lectura visual se ejecutan una sola vez. IA y entrega Evolution simuladas; sin mensajes externos.
- Prueba negativa: el OCR no cambia el proveedor; un caption explícito sí conserva autoridad y se rechaza un destino contradictorio sin escribir. Prueba adicional: el cierre no resuelve otra carga fuera del alcance activo.
- Navegador Chromium local: **6/6 PASS**, recorrido de negociación y evidencias de TRAVELER/ADMIN, permisos y filtros de actividad. Dependencias instaladas dentro del worktree para evitar que Turbopack rechace el symlink temporal de `node_modules`.

### Protección de integración pendiente

La API de GitHub devuelve `Branch not protected` para `main` y la consulta de reglas activas devuelve `[]`. Las regresiones se ejecutan en el workflow existente, pero hoy un cambio puede integrarse sin exigir su aprobación. Se deja una [configuración propuesta](../../.github/protection/main.proposed.json) que exige `verify` y `browser-uat`, rama actualizada, aplicación también a administradores y bloqueo de force push/borrado. **No está aplicada**: cambia las reglas de integración sobre `main` y queda para autorización junto con la publicación.

Antes de aplicar la propuesta, verificar que estos sigan siendo los nombres de los checks del PR y conservar cualquier protección creada por otro trabajo concurrente; no sobrescribir ajustes nuevos. La publicación debe identificar el SHA efectivo en Web/bot/monitor, verificar recepción y originales sin mensajes de prueba a clientes y evaluar la recuperación de cada incidente preservando los receipts. El script de conciliación existente no reprocesa ráfagas FAILED ni sustituye esa recuperación.


## Dependencias y gate de seguridad del candidato

Durante la preparación del PR se detectaron alertas críticas preexistentes en la rama base. Se actualizan `next`/`eslint-config-next` de 16.3.8 a 16.4.3, `better-auth`/`@better-auth/prisma-adapter` de 1.7.5 a 1.7.7, el override `fast-uri` a 3.1.9 y sólo la rama `zod@4` a 4.6.6. Versiones fijadas y lockfile actualizado. Referencias primarias: [aviso de seguridad de Next.js](https://nextjs.org/blog/nextjs-security-update-october-14-2026) y [release Better Auth 1.7.7](https://github.com/better-auth/better-auth/releases/tag/v1.7.7).

El audit de producción pasa de **3 CRITICAL / 4 HIGH / 5 MODERATE / 4 LOW** a **0 CRITICAL / 1 HIGH / 3 MODERATE / 0 LOW**. Los conteos de Dependabot pueden duplicar manifiesto y lockfile; estas cifras son de `pnpm audit --prod` sobre el candidato. Se agrega `pnpm audit --prod --audit-level critical` al job `verify`; se verificó su salida 0. Una crítica nueva hace fallar ese check sin ocultar los demás hallazgos.

Hallazgos residuales y límites de alcance:

- **HIGH, deepmerge-ts 7.1.5:** llega por `@prisma/config`. El import observado está dentro de `loadConfigTsOrJs`, que procesa configuración del repositorio. Las rutas de aplicación usan el cliente generado y el adapter PostgreSQL. No se identificó una ruta de requests que entregue grafos recursivos del usuario a ese cargador. La versión corregida es 8.0.0 (major).
- **MODERATE, uuid 8.3.2:** ExcelJS sólo invoca `v4()` sin buffer en los usos inspeccionados; el aviso afecta v3/v5/v6 con buffer. La versión corregida es 11.1.1 (major).
- **Dos MODERATE, minimatch 3.1.5/5.1.9:** llegan por los helpers glob de archiver/unzipper de ExcelJS. La exportación de la aplicación construye un workbook y llama `xlsx.writeBuffer()`; no expone patrones glob a partir de datos del viajero. La versión corregida es 11.0.1 (major).

No se fuerzan estos majors transitivos ni se declaran inexistentes sus alertas. El alcance está sustentado por el árbol de dependencias y los usos inspeccionados; no es una certificación universal de seguridad. El esquema Prisma permanece igual. La configuración de autenticación usa email/password y `nextCookies`, sin los plugins Magic Link/OAuth Proxy; la publicación igualmente debe coordinar todos los servicios que comparten autenticación y revisar la guía de actualización del proveedor.

La validación de navegador se repitió con las dependencias corregidas: **6/6 PASS**. Build, typegen/typecheck y lint PASS (tres warnings previos); suite completa **985 tests, 983 PASS, 0 FAIL, 2 SKIP** también sobre las dependencias corregidas. Los logs se registran en los artefactos privados de esta auditoría. El candidato y los checks del PR deben corresponder al último SHA, no al primer preview.
