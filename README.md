# Nihao Negocios

Aplicación web para organizar viajes comerciales, capturar proveedores con
texto, tarjetas y audio, revisar propuestas de IA y generar informes. Incluye
administración de empresas y viajeros, agendas individuales y WhatsApp.

## Estado del proyecto

Release de aplicación `84bb417`, publicado el 2 de octubre de 2026.
Frontend: [www.nihaonegocios.com](https://www.nihaonegocios.com).
Backend: Railway, dominio `api.nihaonegocios.com`.

Validación técnica: 162 tests locales, TypeScript, lint sin errores, build y
19 migraciones aplicadas. Sigue pendiente el UAT autenticado y físico; el release
no declara completo el gate del piloto.

Hay una implementación local del procesamiento de WhatsApp por ráfagas (20
segundos o «listo»), aún sin desplegar ni activar. Ver
[arquitectura y activación](docs/architecture/whatsapp-bursts.md).

## Documentación

- [Índice](docs/README.md).
- [Estado técnico y release](docs/development/current-state.md).
- [Estado operativo y UAT](docs/uat/mvp-uat-plan.md).
- [Producto](docs/product/nihao-bot-product-experience.md).
- [Infraestructura](docs/architecture/infrastructure.md).
- [Modelo de datos](docs/architecture/data-model.md).
- [Configuración local](docs/development/local-setup.md).

## Desarrollo local

Requiere Node 24 y pnpm 9.15.9. Consultar la guía local para las variables de
entorno; no usar credenciales de producción por defecto ni versionar secrets.

```bash
pnpm install
pnpm prisma:generate
pnpm dev
```

## Validación

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm prisma:validate
pnpm build
git diff --check
```

Prisma validate/generate requieren `DATABASE_URL`; la guía describe el uso de
un placeholder para operaciones que no se conectan a la base. Las migraciones
requieren verificar el entorno. El build puede necesitar acceso a Google Fonts.
