# Correcciones históricas revisadas y reversibles

La herramienta `scripts/historical-corrections.mts` opera únicamente sobre staging. No descubre asociaciones por parecido ni realiza fusiones. Admite mover una fotografía entre capturas del mismo viajero, empresa y viaje, o invalidar lógicamente un producto espurio comprobado.

## Preparación

1. Restaurar un backup privado en DB/R2 aislados de staging. No incluir dumps, contactos, fotos ni resultados de diagnóstico en Git.
2. Configurar `NIHAO_RUNTIME_ENV=staging`, `DATABASE_URL` y `NIHAO_STAGING_DATABASE_HOST` con el hostname exacto de esa DB. Para aplicar, configurar `R2_BUCKET` y `NIHAO_STAGING_R2_BUCKET` con el mismo bucket aislado; `NIHAO_PRODUCTION_DATABASE_HOST` y `NIHAO_PRODUCTION_R2_BUCKET` permiten negar explícitamente los destinos productivos conocidos. Variables de despliegue `production` bloquean el comando.
3. Usar como `actorId` un ADMIN global que sea ADMIN del viaje; `context.userId` corresponde al dueño de las capturas y debe estar asignado a la empresa.
4. Revisar manualmente los originales y preparar el manifiesto en una carpeta privada fuera del repo. Cada prueba necesita ID de adjunto, storageKey exacta, tamaño y SHA-256 del original revisado.

## Manifiesto

```json
{
  "version": 1,
  "id": "correccion-unica-revisada",
  "actorId": "admin-staging",
  "reviewed": true,
  "reason": "Motivo concreto y evidencia que elimina la ambigüedad",
  "context": { "userId": "viajero", "tripId": "viaje", "companyId": "empresa-del-viaje" },
  "beforeHash": "",
  "evidence": [{ "attachmentId": "foto", "storageKey": "clave-original", "sha256": "SHA256_REAL_DE_64_CARACTERES", "size": 1234 }],
  "operation": { "type": "moveAttachment", "attachmentId": "foto", "sourceCaptureId": "origen", "destinationCaptureId": "destino" }
}
```

Para invalidación, usar `operation: { "type": "invalidateProduct", "productId": "id-revisado" }`. Las pruebas deben ser adjuntos de la captura de ese producto.

## Diagnóstico, aplicación y reversión

- `pnpm exec tsx scripts/historical-corrections.mts diagnose /carpeta-privada/manifiesto.json` devuelve el snapshot y `beforeHash`; no modifica registros. Revisar el resultado, guardar el hash en el manifiesto y conservarlo privadamente.
- `pnpm exec tsx scripts/historical-corrections.mts apply /carpeta-privada/manifiesto.json` vuelve a leer cada original, verifica SHA/tamaño, exige el estado revisado exacto y aplica dentro de una transacción serializable.
- `pnpm exec tsx scripts/historical-corrections.mts revert correccion-unica-revisada admin-staging` exige que todo el estado afectado coincida con el resultado de la aplicación; cualquier edición o upload posterior produce conflicto y no se sobrescribe.

Cada ID se aplica una sola vez y no admite reutilización con otro manifiesto. Un ID revertido tampoco se vuelve a aplicar; una nueva revisión requiere otro ID. La auditoría conserva actor, motivo, manifiesto y snapshots anterior/posterior. El movimiento reutiliza la operación normal de reasociación, conserva claves/bytes/receipts y deja a revisión el análisis afectado. La invalidación preserva la fila y excluye el producto de consultas activas e informes. La reversión restaura únicamente los metadatos alterados; jamás borra originales.

Los snapshots contienen datos privados: limitar accesos y conservarlos bajo la política vigente. Las credenciales de esta herramienta nunca se entregan al modelo conversacional. Los ejemplos no son un manifiesto aplicable hasta reemplazar IDs y hashes por evidencia real revisada.
