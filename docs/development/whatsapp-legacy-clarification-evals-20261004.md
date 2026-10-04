# Aclaraciones pendientes de WhatsApp — 4 de octubre de 2026

## Diagnóstico confirmado

El vaso de vidrio permanecía en un inbox v1 del 2 de octubre sin empresa, análisis ni capturas creadas. Ese lote bloqueaba el recorrido v3, aunque el webhook de Evolution apuntaba al backend actualizado y el flag de tools estaba activo. El fallback clasificaba `para broco` como ayuda antes de leer la selección pendiente, y el selector sólo aceptaba números. Los mensajes originales seguían guardados.

La corrección prioriza la aclaración, acepta nombres únicos y transfiere únicamente lotes sin contexto ni procesamiento previo. Conserva originales, archivos, lecturas y opciones de empresa. Las selecciones de viaje y operaciones ya procesadas siguen con su procesador. No se modificaron manualmente datos ni se enviaron mensajes de WhatsApp durante la investigación.

## Validación

- 244 tests PASS, sin omisiones, con PostgreSQL local aislado v2/v3. Incluyen el fallo original, entregas concurrentes, deduplicación, opciones numéricas, originales de imagen/audio y lotes excluidos de la transferencia.
- TypeScript, lint de los archivos modificados y build Next aprobados.
- Gate final `whatsapp-legacy-routing-gate-20261005`: 8/8 PASS; 0 FAIL/ERROR y 0 alucinaciones críticas. Mistral real y PostgreSQL real aislado.
- Las evals nuevas atraviesan el webhook Evolution simulado, store, transferencia, lectura, worker, tools y outbox; el envío se captura localmente. No prueban entrega física por WhatsApp.
- Reportes iniciales conservados: primera ejecución 0/2; segunda 0/2; aceptación intermedia 7/8 (falló WP06). Se corrigieron la interpretación de empresa, la evidencia de la aclaración y las instrucciones que afectaban a conversaciones sin pregunta pendiente. No se cambiaron las expectativas para obtener PASS.
- El nombre del reporte utiliza fecha UTC del runner; la fecha del incidente y de este documento corresponde a Argentina.

| Caso | Resultado |
| --- | --- |
| WP06-homonyms-company | PASS |
| WA26-memory-continue | PASS |
| WA27-memory-last-product | PASS |
| WA28-memory-expired | PASS |
| WA29-memory-ambiguous | PASS |
| WA30-memory-explicit-destination | PASS |
| WA31-legacy-product-company-name | PASS |
| WA32-legacy-product-company-number | PASS |

Los cinco casos de memoria y WP06 ya cuentan con [conversaciones documentadas](whatsapp-agent-memory-evals-20261004.md); esta ejecución volvió a comprobarlos con la corrección actual.

## Conversaciones nuevas

### WA31-legacy-product-company-name — PASS

La pregunta inicial se reconstruye de una conversación legacy pendiente. A partir de la respuesta de empresa se ejecuta el recorrido real del agente.

**Usuario:**

```text
Tengo un vaso de vidrio con precio fob de 30 usd y leedtime de 60 dias
```

**Nihao:**

```text
¿Para qué empresa es el próximo proveedor? Respondé con el número:
1. Broco Solutions
2. Kendal Salud
```

**Usuario:**

```text
para broco
```

**Nihao:**

```text
¿A qué proveedor corresponde este producto?
```

**Usuario:**

```text
Es del proveedor Alfa Tools
```

**Nihao:**

```text
📋 Producto «vaso de vidrio» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.
```

**Resultado verificado en PostgreSQL:**

```json
{
  "transferred": "TRANSFERRED",
  "originals": 1,
  "firstWaiting": true,
  "initialProducts": 0,
  "products": 1,
  "drafts": 0,
  "name": "vaso de vidrio",
  "fob": 30,
  "currency": "USD",
  "days": 60,
  "moq": null,
  "status": "DRAFT",
  "finalDone": true,
  "supplier": "Alfa Tools",
  "company": "Broco Solutions"
}
```

Un único producto DRAFT, asociado al proveedor existente; ningún proveedor nuevo. La aclaración conserva los FACTS originales y MOQ sigue vacío porque no fue informado.

### WA32-legacy-product-company-number — PASS

La pregunta inicial se reconstruye de una conversación legacy pendiente. A partir de la respuesta de empresa se ejecuta el recorrido real del agente.

**Usuario:**

```text
Tengo un vaso de vidrio con precio fob de 30 usd y leedtime de 60 dias
```

**Nihao:**

```text
¿Para qué empresa es el próximo proveedor? Respondé con el número:
1. Broco Solutions
2. Kendal Salud
```

**Usuario:**

```text
1
```

**Nihao:**

```text
¿A qué proveedor corresponde este producto?
```

**Usuario:**

```text
Es del proveedor Alfa Tools
```

**Nihao:**

```text
📋 Producto «vaso de vidrio» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.
```

**Resultado verificado en PostgreSQL:**

```json
{
  "transferred": "TRANSFERRED",
  "originals": 1,
  "firstWaiting": true,
  "initialProducts": 0,
  "products": 1,
  "drafts": 0,
  "name": "vaso de vidrio",
  "fob": 30,
  "currency": "USD",
  "days": 60,
  "moq": null,
  "status": "DRAFT",
  "finalDone": true,
  "supplier": "Alfa Tools",
  "company": "Broco Solutions"
}
```

Un único producto DRAFT, asociado al proveedor existente; ningún proveedor nuevo. La aclaración conserva los FACTS originales y MOQ sigue vacío porque no fue informado.
