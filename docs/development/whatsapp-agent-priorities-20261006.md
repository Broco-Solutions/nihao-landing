# Agente Nihao: mejoras prioritarias, etapa 1 — 2026-10-06

Implementado y validado localmente. No se hizo push, despliegue ni cambio de configuración productiva. Se conserva GPT-5.6 Luna, Responses API, `reasoning.effort=medium`, sin `temperature`.

## Arquitectura inspeccionada

Webhook/store persisten mensajes de viajeros autorizados, y el worker reclama la ráfaga con revisión y lease. `agent-service.ts` obtiene el catálogo autorizado antes de leer medios. `burst-reader.ts` conserva originales, OCR, visión y transcripción. `agent-orchestrator.ts` ejecuta el loop y checkpoint de historial; `agent-provider.ts` adapta su interfaz interna a `/v1/responses`, incluyendo outputs de functions y razonamiento cifrado.

`agent-contract.ts` define las 15 tools, `agent-tools.ts` prepara evidencia literal, resuelve contexto/preguntas y renderiza recibos. `PrismaAgentDomain` autoriza cada acción, bloquea la conversación, verifica revisión/lease y persiste operación más mutación en una transacción. Las propuestas sobre confirmados requieren envío previo, aprobación textual nueva, versión coincidente y vigencia. El estado durable incluye preguntas, opciones, evidencia, recibos e historial.

Proveedor borrador = `SupplierCapture`; confirmado = `Supplier` vinculado por `captureId` único. Producto = `SupplierProduct` con estado propio. Los assets ya están en `SupplierAttachment` y tienen `productId`. El problema encontrado: cualquier imagen que no fuese tarjeta se clasificaba como producto, y los updates no copiaban su evidencia multimedia. La solución local conserva la clasificación positiva y el vínculo real al asset en los JSON existentes; no hay migración.

## Cambios realizados, en orden

1. Las 15 function tools tienen `strict=true`, objetos cerrados, required completo y opcionales nullable. Enums para tipos, roles y campos de borrado. Patches de proveedor/producto separados. `clearFields` distingue un borrado explícito de un slot null que conserva el dato. Se mantienen validaciones y recuperación de llamadas históricas dispersas.
2. Contexto operacional inicial derivado del catálogo autorizado; selección única de viaje/empresa, sin obligación de `get_context`. Memoria reciente sigue limitada a cinco conversaciones/24 horas y sólo se consulta ante referencias; se conserva `resolve_recent_reference` y la prioridad de destino explícito/pregunta pendiente.
3. Soft 12/hard 24 con progreso semántico y watchdog durable: evidencias nuevas, registros/versiones resueltos, cambios de recibos, preguntas/propuestas o terminal. Repetición idéntica sin progreso dos veces, o cuatro rondas estancadas, detiene. Seis motivos de terminación persistidos y logs; `max_rounds` informa el límite y ofrece reintentar. Recuperación de terminal completa su motivo si un crash ocurrió antes de guardarlo.
4. Gating central y conservador según FACTS, destinos consultados/creados y propuesta pendiente. Decisiones autónomas inequívocas usan la ruta determinística; la cancelación compuesta conserva el pedido adicional. Invocar una tool no ofrecida se rechaza también en backend.
5. Completitud central de proveedor: nombre más contacto válido soportado. Nombre/web/ciudad/persona sin medio no alcanzan. Promoción transaccional conserva datos, contactos y productos, sin exigir categoría para esta nueva regla del agente. La confirmación manual web mantiene su comportamiento.
6. Completitud central de producto: nombre real más imagen válida vinculada al producto, con clasificación positiva y archivo copiado. Los updates también adjuntan media; un draft con nombre se confirma al agregar foto. Tarjetas, documentos, OCR aislado, CONTEXT y lecturas legacy sin prueba no alcanzan. Confirmaciones existentes se conservan, sin transiciones duplicadas.
7. El modelo no envía ni decide confirmación. Los recibos incluyen `resourceStatus`, `confirmationReason` sólo al promover y `completedRevision`. El resumen se genera desde esos resultados reales y evita repetir confirmaciones de turnos anteriores.
8. Idempotencia técnica existente conservada y reforzada frente al cambio de tipo del proveedor al promocionarse. Se leen claves anteriores. Media por operación/mensaje, `WRITTEN` recuperable y aprobación aplica una sola vez. No se deduplican productos por nombre.
9. Ajustes mínimos de prompt y descripciones: contexto inicial, nullable/clearFields y estado determinado por servidor; sin reescritura ni reglas de confirmación delegadas a Luna. Se corrigió un fallo encontrado por la prueba obligatoria del update comercial: un producto sin FOB/MOQ/plazo necesita valores base para completar sólo los componentes solicitados.

## Comportamientos anteriores que cambian

- Completar el mínimo requerido confirma automáticamente, tanto en creación como en update del draft. Un registro ya confirmado sigue necesitando propuesta/aprobación para editarlo.
- Los lotes pueden continuar después de 12 rondas si avanzan; nunca superan 24. Lecturas repetidas sin avance ahora terminan antes con motivo visible.
- El primer llamado recibe viajes/empresas directamente; no trae conversaciones recientes salvo una referencia y llamada condicional.
- Tools disponibles varían por estado; null en patches estrictos no vacía campos sin `clearFields`.
- Evidencia documental deja de contar implícitamente como foto del producto. Los updates conservan sus archivos y pueden completar un draft.
- Cancelar una propuesta puede ir seguido de una operación nueva en el mismo mensaje. Aprobar sigue requiriendo respuesta autónoma.

## Archivos

Nuevos:

- `lib/bot/record-completeness.ts`
- `lib/channels/whatsapp/agent-policy.ts`
- `tests/bot/whatsapp-agent-priorities.test.mts`
- `tests/bot/whatsapp-agent-confirmation.test.mts`
- Este reporte.

Modificados:

- `lib/channels/whatsapp/agent-contract.ts`
- `lib/channels/whatsapp/agent-memory.ts`
- `lib/channels/whatsapp/agent-orchestrator.ts`
- `lib/channels/whatsapp/agent-provider.ts`
- `lib/channels/whatsapp/agent-service.ts`
- `lib/channels/whatsapp/agent-tools.ts`
- `lib/channels/whatsapp/prisma-agent-domain.ts`
- `lib/channels/whatsapp/burst-reader.ts`
- `lib/channels/whatsapp/burst-types.ts`
- `lib/channels/whatsapp/burst-materializer.ts` (compatibilidad del lector compartido con v2).
- `lib/bot/attachments.ts`
- `lib/bot/supplier-edit.ts`
- `tests/bot/whatsapp-agent-db.test.mts`
- `tests/bot/whatsapp-agent.test.mts`
- `tests/bot/whatsapp-openai-provider.test.mts`
- `tests/bot/whatsapp-bursts.test.mts`
- `docs/architecture/whatsapp-agent-tools.md`
- `docs/development/current-state.md`

Se preservó el documento previo no versionado `whatsapp-agent-prompt-and-tools-20261006.md`; no pertenece a esta implementación.

## Tests y resultados

`whatsapp-agent-confirmation.test.mts` cubre los trece escenarios solicitados en PostgreSQL: teléfono/email, ausencia de nombre/contacto, web sola, completar contacto, preservar confirmado y no duplicar confirmación; producto con/sin nombre o foto, documento OCR, completar foto y update comercial con aprobación. Agrega contactos soportados, assets inválidos/no verificados, tarjetas/CONTEXT, retry de promoción, misma denominación con evidencia distinta, cancelación compuesta y recuperación de update `WRITTEN` tras falla de almacenamiento.

`whatsapp-agent-priorities.test.mts` comprueba las 15 schemas strict y sus objetos anidados, nullable y campos inesperados, patches/borrado explícito, contexto operacional sin memoria automática, selección no arbitraria, gating, aprobaciones/cancelaciones compuestas, diez productos en 22 rondas, límites 12/24, watchdog tras checkpoint, errores de tool/modelo, aclaración/terminal recuperado y rechazo de tools no ofrecidas. Verifica el payload y roundtrip del adaptador Responses con transporte HTTP simulado, `medium`, sin temperature y razonamiento cifrado. Se adaptaron fixtures anteriores al contrato estricto y se comprueba la clasificación positiva en el lector multimedia.

Checks ejecutados sobre el estado final:

```bash
EVAL_AGENT_DATABASE_URL=postgresql://franc@127.0.0.1:15434/nihao_agent_test \
WHATSAPP_BURST_TEST_DATABASE_URL=postgresql://franc@127.0.0.1:15434/nihao_burst_test \
  node --import tsx --test tests/bot/*.test.mts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js
git diff --check
```

- Suite completa: **311 PASS, 0 FAIL, 0 SKIP**; bases exclusivamente locales con las 23 migraciones existentes. No se agregaron migraciones.
- Typecheck: PASS.
- Lint: 0 errores, cuatro warnings preexistentes en `AppShell.tsx`, `ProductCapture.tsx`, `TripsClient.tsx` y `components/app/api.ts`; ningún warning nuevo en archivos cambiados.
- Diff check: PASS.
- No se llamó a OpenAI real, Voxtral ni WhatsApp de clientes durante estas pruebas. No se ejecutó build de frontend: no hubo cambios Next/frontend.

## Riesgos y pendientes

- La clasificación visual sigue dependiendo del proveedor de visión actual. Se exige resultado positivo, asset válido y vínculo al producto; Luna no decide la confirmación. Validar fotos/documentos reales en UAT antes del despliegue.
- Imágenes históricas sin prueba positiva no se confirman por inferencia ni se reclasifican masivamente. Un draft antiguo puede completarse con una foto verificada nueva o mediante la confirmación manual existente.
- Las bases existentes pueden contener registros confirmados que no cumplen el nuevo mínimo. Se preservan, sin democión ni backfill.
- Idempotencia cubre el mismo retry técnico, no una nueva revisión/evidencia; los deletes/traslados siguen fuera de las tools. La limitación previa de reenvío externo entre envío y registro `SENT` no cambia.
- Hard 24 y plazo del worker siguen siendo límites finitos. Se conserva checkpoint y se informa cuándo hace falta continuar; no se promete completar cualquier lote arbitrario en un turno.
- El protocolo Responses está probado con transporte simulado; queda la aceptación con Luna real y WhatsApp físico antes de publicar. Sin nuevo eval framework, batch de creación ni cambios visuales.
