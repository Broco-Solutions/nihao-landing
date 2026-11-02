# Fallos de WhatsApp: diagnóstico y corrección local — 2/11/2026

Base revisada: `main@af621b2`. Candidato en `fix/whatsapp-finalization-20261102`, sin merge ni despliegue productivo. La investigación usó logs Railway, consultas PostgreSQL con `default_transaction_read_only=on`, reconstrucción con PostgreSQL local 16.15 y una imagen sintética para verificar el contrato de Mistral. No se enviaron mensajes/correos ni se modificaron datos productivos. Credenciales, conversaciones y lecturas privadas quedan fuera de Git.

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
