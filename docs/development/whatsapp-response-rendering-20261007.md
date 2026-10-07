# Respuestas de WhatsApp: presentación simplificada

Cambio limitado a rendering. No modifica decisiones, escrituras de dominio, estados,
modelos, prompts, reasoning, thresholds, OCR, agrupación ni confirmación.
Los cambios previos de persistencia que ya estaban en el workspace se conservan.

## Ejemplo BEFORE / AFTER

Antes:

```text
Ráfaga: 7 evidencias, 5 cargas.

• 3 procesadas
• 0 pendientes
• 2 para revisar
• 0 fallidas
```

Después, con todos los registros guardados y dos datos por confirmar:

```text
✅ 3 proveedores cargados
📦 2 productos cargados

Necesito confirmar algunos datos:

• **YKO blocks manufactory:** lo cargué como borrador. Necesito confirmar el teléfono.

• **PANLOS:** lo cargué como borrador. Necesito confirmar los datos extraídos.
```

Sin dudas:

```text
✅ 3 proveedores cargados
📦 2 productos cargados

Todo listo.
```

## Archivos de implementación de este cambio

Todos bajo `lib/channels/whatsapp/`:

- `clarification-rendering.ts`: conteos de recibos completos, borradores, dudas concretas a partir de lecturas existentes, aclaraciones y representación legible de propuestas. Helper técnico explícito independiente.
- `agent-tools.ts`: delegación del rendering de recibos.
- `agent-orchestrator.ts`: rendering uniforme en respuestas normales y recuperación de respuestas terminales.
- `agent-service.ts`: resumen final sin duplicación de recibos; respuestas sin operaciones nuevas conservan su contenido.
- `burst-service.ts`, `batch-service.ts`: rutas anteriores con el mismo formato de resultados.
- `capture-formatter.ts`: borrador explícito y un campo por bullet; conserva campos extraídos presentes.
- `supplier-picker.ts`: la lista usa el texto ya renderizado sin reintroducir texto interno; conserva IDs y selección numérica.
- `prisma-burst-store.ts`: mensaje de reintento breve, con saltos de línea.
- `help-reply.ts`: reemplazo del término «cargas» en ayuda.

## Tests

Nuevo `tests/bot/whatsapp-response-rendering.test.mts`, 12 casos:
conteos mixtos; tipos ausentes y singular; borrador; proveedor nuevo automático;
bullets separados; viaje independiente; resultados parciales; inmutabilidad de
estados/contadores y debug; respuesta corta; dudas por campo; lista/outbox y
fallback a texto; aprobación legible.

Expectativas de presentación actualizadas en:

- `tests/bot/whatsapp-agent-priorities.test.mts`
- `tests/bot/whatsapp-burst-boundaries.test.mts`
- `tests/bot/whatsapp-capture-persistence.test.mts`
- `tests/bot/whatsapp-capture.test.mts`
- `tests/bot/whatsapp-context-clarification.test.mts`
- `tests/bot/whatsapp-multimodal.test.mts`
- `tests/bot/whatsapp-replay.test.mts`

Las aserciones de persistencia, estados, identidad y trazabilidad se mantienen.

## Verificación

Suite completa con PostgreSQL local dedicado:
`EVAL_AGENT_DATABASE_URL=postgresql://franc@127.0.0.1:15436/nihao_agent_test pnpm test`.
526 tests: 522 pasan, 2 omitidos, 2 fallos preexistentes en
`trip-insights.test.mts` y `trip-roles.test.mts`: sus expectativas del filtro Prisma
no incluyen `deletedAt: null`. No se modificaron esos tests ni la lógica de dominio.

`pnpm typecheck`: pasa.
`pnpm lint`: sin errores; 4 warnings preexistentes en componentes de la web.
`git diff --check`: pasa.

Sin push ni deploy.

## Publicación posterior autorizada

El 7 de octubre de 2026 el usuario pidió subir estos cambios a producción.
Se publicó el workspace por CLI, sin push de Git.

- Railway `nihao-bot`, entorno `production`: deployment `8a628787-165c-458d-a0a3-7ea9f1b63589`, `SUCCESS`.
- Vercel: deployment `dpl_9X6zNP3Lhy7rU5gZDBn2QXkA3mvV`, `READY`, con alias `www.nihaonegocios.com`.
- Los dos builds remotos completaron. Railway confirmó que no hay migraciones pendientes.
- Smoke de lectura: web y `/app` devuelven 200; sesión anónima devuelve 200/null en web y backend; viajes y cron del backend rechazan solicitudes sin autorización con 401.
- No se enviaron WhatsApps de prueba ni se crearon datos de prueba en producción.
