# Sistema Contable para Contador Particular

Sistema contable local con normatividad colombiana, base de datos PostgreSQL y acceso desde la red local.

## Stack

- **Backend:** Node.js + TypeScript + Express + Prisma ORM
- **Frontend:** React + TypeScript + Vite
- **Base de datos:** PostgreSQL 18
- **Autenticación:** JWT + bcrypt con roles (administrador, contador, auxiliar)
- **Despliegue:** PM2 en servidor local

## Documentación

- [Arquitectura](docs/arquitectura.md)
- [Modelo de datos](docs/modelo-datos.md)
- [Normatividad contable](docs/normatividad.md)
- [Respaldo y restauración de BD](docs/respaldo.md)

## Fases de desarrollo

| Fase | Estado |
|---|---|
| 0. Diseño y planificación | Completada |
| 1. Base del proyecto (backend + frontend + BD) | Completada |
| 2. Catálogo de cuentas PUC | Completada |
| 3. Terceros | Completada |
| 4. Comprobantes y asientos | Completada |
| 5. Libros y reportes | Completada |
| 6. Estados financieros | Completada |
| 7. CxC / CxP e inventario | Completada |
| 8. Respaldo, red local y manuales | En curso (respaldo de BD completado) |
