# Prompt caching del agente WhatsApp

Implementado en `lib/channels/whatsapp/agent-provider.ts`, usando la [guía oficial de OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching), consultada el 2026-10-07.

Para llamadas con tools y mensajes system:

- GPT-5.6 y posteriores: `prompt_cache_options: { mode: "implicit", ttl: "30m" }`. El último mensaje system se envía como bloque `input_text` con `prompt_cache_breakpoint: { mode: "explicit" }`, manteniendo exactamente su texto y role. Hay un solo breakpoint agregado por el adaptador. El punto explícito permite reutilizar el prefijo estable aunque cambie la batch; modo implicit conserva oportunidades de reutilizar contexto/historial entre rondas.
- Modelos anteriores: caching implícito y `prompt_cache_key` estable, calculada con SHA-256 de modelo, textos system, tools y formato de salida. No incluye mensajes de usuario ni IDs de batch. No se envían opciones explícitas ni se fuerza una retención incompatible.
- Llamadas de extracción/segmentación sin tools, o llamadas sin system, mantienen la representación anterior y el comportamiento de caching por defecto del proveedor.

Se conservan modelo, reasoning, `store=false`, texto completo del prompt, tools disponibles, su orden, schemas, tool_choice, contexto dinámico e historial/checkpoints. No se expone una tool inhabilitada para mejorar cache hits. El conjunto dinámico de tools y los bloques pending/memory pueden cambiar el prefijo y provocar misses; cada variante necesita cachearse y coincidir exactamente. No se agrega padding para alcanzar mínimos.

Según la guía actual, GPT-5.6+ requiere al menos 1.024 tokens visibles cacheables. La coincidencia y disponibilidad de entradas la decide OpenAI; enviar los parámetros no garantiza un hit. La retención de cache es independiente de almacenar respuestas (`store=false` permanece); no se habilita almacenamiento de conversaciones en OpenAI ni se crea una caché de respuestas de negocio en la aplicación.

Cada respuesta del agente registra `WhatsApp OpenAI prompt cache` con:

- `model`, `latencyMs`;
- `inputTokens`;
- `cachedTokens`, desde `usage.input_tokens_details.cached_tokens`;
- `cacheWriteTokens`, desde `usage.input_tokens_details.cache_write_tokens`.

Si el proveedor omite una métrica se registra null. No se registran prompts, mensajes, teléfonos, nombres ni keys. El objeto usage original sigue devolviéndose a los consumidores/evals. Comparar reads, writes y latencia entre solicitudes: misses y cache writes también influyen en coste, no sólo cachedTokens.

## Validación

Tres pruebas nuevas verifican transporte moderno, estabilidad de prefijo entre batches, compatibilidad legacy, invalidación por cambio de tools, preservación de usage, aislamiento de llamadas de extracción y ausencia de texto del usuario en logs.

Suite completa: 470 pruebas, 449 pass, 21 skipped por prerrequisitos de integración, 0 fail. Typecheck y lint de archivos modificados: correctos. `git diff --check`: correcto.

Se intentaron dos llamadas sintéticas a OpenAI, forzando `get_context` sin ejecutar ninguna tool ni acceder a base de datos o WhatsApp. El primer fetch falló por `ENOTFOUND api.openai.com`; el reintento fuera del sandbox falló igual. Por ello no se verificaron hits reales ni ahorro monetario. No hubo push ni deploy.
