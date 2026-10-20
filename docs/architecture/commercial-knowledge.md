# Contrato central de conocimiento comercial

## Objetivo

Nihao trata los términos de comercio exterior como datos semánticos, no como nombres de productos. El diccionario compartido vive en `lib/bot/commercial-knowledge.ts` y se reutiliza en extracción Mistral y en el prompt del agente.

## Reglas de normalización

- `MOQ` / `M-O-Q` / “eme o cu” significan cantidad mínima de pedido. `MOC-200` puede ser un modelo y no se convierte automáticamente.
- `FOB` conserva importe, moneda, unidad y texto original. `CIF`, `EXW`, `CFR`, `DAP` y `DDP` no se transforman en FOB.
- Un precio explícito sin Incoterm se guarda como `quotedPrice` (importe, moneda, unidad y texto original) en el producto. Nunca se copia automáticamente a FOB. «Valen 600 usd cada uno» y «200 dólares la unidad», incluso dentro de una transcripción de audio, producen un precio cotizado con FOB ausente.
- Semanas se normalizan a días (`3 semanas = 21 días`); el texto original permanece como evidencia.
- Una composición como “MOQ 200: 100 negras y 100 rojas” conserva el total y la nota de composición sin crear productos adicionales.
- Moneda, unidad, producto, proveedor e Incoterm no se inventan. Las ambigüedades quedan en `reviewFields`.
- «Moq 250» conserva cantidad 250 con unidad nula; la Web indica que falta la unidad.

## Flujo y procedencia

El audio original sigue privado en storage; la transcripción y el modelo Voxtral se conservan en el adjunto Prisma. La extracción recibe `AUDIO_TRANSCRIPT` y conserva `rawSource.text` y `FieldEvidence`. La capa determinista contrasta los campos comerciales contra la transcripción original antes de que el agente pueda escribir. La persistencia y asociación continúan dependiendo de las cargas lógicas, `FACTS`/`CONTEXT`, `sourceEvidence` y receipts existentes.

La incertidumbre material requiere revisión humana. En particular, `moc 200` sin contexto, conflicto entre `MOQ 200` y `MOC-200`, moneda/unidad ausentes en FOB y condiciones sin producto identificado no habilitan una asociación inventada.

## Alcance de vocabulario

El contrato documenta MOQ, FOB, EXW, CIF, CFR, DAP, DDP, lead time, fábrica/trading, OEM/ODM, muestras, personalización, packaging, certificaciones, pagos, variantes, lotes mínimos y HS Code como enriquecimiento posterior. Sólo MOQ, FOB y lead time se normalizan estructuradamente en este slice; el resto queda como texto/nota cuando se expresa explícitamente.

La referencia funcional original es `Especificaciones BOT.pdf`, versión 2.0 (julio de 2026, Google Drive): define score de interés 1–5. El producto vigente usa 1–10 por una decisión posterior registrada en `trip_feedback_scale_10`; este cambio no altera esa escala y deja la diferencia para decisión funcional.
