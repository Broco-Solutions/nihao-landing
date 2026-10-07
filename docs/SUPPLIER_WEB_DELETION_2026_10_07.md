# Eliminación de proveedores desde la web

- El detalle del proveedor ofrece Eliminar proveedor → confirmación explícita → Eliminar definitivamente / Cancelar.
- Disponible con los mismos permisos de edición existentes: membership del viaje y scoping de empresa para viajeros; administrador del viaje con acceso al registro.
- DELETE /api/bot/suppliers/:supplierId?tripId=… requiere sesión y valida el recurso en una transacción.
- Se elimina el Supplier y, mediante las relaciones existentes, sus contactos y productos. También se eliminan borradores sin supplierId de su captura; no productos pertenecientes a otro proveedor.
- Se conserva SupplierCapture y los archivos/adjuntos originales. Las relaciones de imágenes a productos usan SetNull. No se elimina ningún objeto del storage.
- La captura registra deletedAt/deletedById. Se bloquea su reconfirmación y edición, evitando recrear un proveedor eliminado desde su antiguo captureId.
- La captura se excluye de listas, métricas administrativas y análisis comerciales activos. Sigue existiendo para auditoría y lectura autorizada de evidencia.
- La UI explica la eliminación de productos/contactos y su carácter irreversible, muestra errores sin perder el detalle, impide doble clic durante la operación y regresa a la lista correspondiente.

Migración aditiva: 20261007030000_supplier_web_deletion, dos columnas nullable en SupplierCapture. No modifica registros históricos ni borra proveedores al aplicarse. Su ejecución en producción está autorizada dentro del despliegue solicitado.

Validación previa: generación Prisma, typecheck, Prisma validate, lint (0 errores / 4 warnings preexistentes) y git diff --check. El build local quedó bloqueado al descargar fuentes Google por el problema DNS del entorno; la compilación de producción se verifica en Railway/Vercel. No se agregó ni ejecutó una suite de tests para esta funcionalidad.

Archivos: SupplierDetail.tsx; API supplier route; supplier-deletion.ts; supplier-edit.ts; company-access.ts; prisma-repository.ts; prisma-trip-admin-dashboard-repository.ts; trip-insights.ts; schema.prisma; migración y este documento.

No se eliminó ningún proveedor real durante el desarrollo/despliegue. La acción sobre registros sólo se ejecuta cuando un usuario autorizado confirma desde la web.
