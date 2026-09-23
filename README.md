# Sistema Contable para Contador Particular

Sistema contable local con normatividad colombiana (PUC), base de datos PostgreSQL y acceso desde la red local. Incluye comprobantes/asientos con partida doble, catálogo de cuentas, terceros, periodos, inventario, CxC/CxP, libros y estados financieros, con control de acceso por roles.

## Estado del proyecto

**V1 completa y estable — sistema contable multicliente listo para producción** en red
local. La aplicación cubre el ciclo contable completo para un estudio (comprobantes con
partida doble, cierre anual, nómina, activos fijos, provisión de cartera, presupuesto,
libros oficiales e informes) en un modelo multicliente con seguimiento por proceso y
respaldo automático verificado con copia externa opcional. Detalle versión por versión
en [CHANGELOG](CHANGELOG.md).

## Stack

- **Backend:** Node.js 20+ + TypeScript + Express + Prisma ORM
- **Frontend:** React + TypeScript + Vite
- **Base de datos:** PostgreSQL 18
- **Autenticación:** JWT + bcrypt con roles (ADMIN, CONTADOR, AUXILIAR)
- **Despliegue:** PM2 en servidor local, un solo puerto (3000)

## Requisitos previos

- Node.js 20+ y npm
- PostgreSQL 18 (motor) con un usuario con permisos para crear la base
- Opcional: PM2 (`npm install -g pm2`) para reinicio automático y logs

## Instalación desde cero

```powershell
# 1. Dependencias
cd backend
npm install
cd ../frontend
npm install

# 2. Configuración del backend
cd ../backend
Copy-Item .env.example .env
# Edita .env: DATABASE_URL con tu usuario/password y base "contabilidad",
# y define un JWT_SECRET largo.

# 3. Crear la base y aplicar migraciones
npm run db:migrate
npm run db:seed          # crea admin@sistema.local (ADMIN_INITIAL_PASSWORD o aleatoria impresa una vez) y el PUC

# 4. Compilar backend y frontend
npm run build
cd ../frontend
npm run build
cd ../backend

# 5. (Opcional) datos de demostración
npm run db:seed:demo

# 6. Arrancar
npm run start            # o con PM2: pm2 start ecosystem.config.cjs && pm2 save
```

En el primer ingreso, el sistema exige cambiar la contraseña inicial.

## Acceso

- Web: `http://localhost:3000`
- Estado: `http://localhost:3000/api/health`
- Desde la red local: `http://<IP-del-servidor>:3000` (abrir el puerto 3000 en el firewall de Windows, perfil Privado; ver `docs/despliegue.md`).

### Usuarios y roles

| Rol | Alcance |
|---|---|
| **ADMIN** | Todo, incluida la gestión de usuarios |
| **CONTADOR** | Crear/editar comprobantes, cuentas, terceros, periodos, productos y cartera; ver reportes |
| **AUXILIAR** | Solo lectura y consulta de reportes |

## Scripts útiles

| Comando (en `backend/`) | Descripción |
|---|---|
| `npm run dev` | Backend en desarrollo (tsx watch) |
| `npm test` | Suite de pruebas (Vitest + Supertest) |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm run db:migrate` | Aplica migraciones Prisma |
| `npm run db:seed` | Seed base (admin + PUC) |
| `npm run db:seed:demo` | Datos de demostración idempotentes |
| `npm run backup` / `backup:list` | Respaldo y verificación de la BD |

## Documentación

- [Arquitectura](docs/arquitectura.md)
- [Modelo de datos](docs/modelo-datos.md)
- [Normatividad contable](docs/normatividad.md)
- [Respaldo y restauración de BD](docs/respaldo.md)
- [Despliegue en red local](docs/despliegue.md)
- [Manual de usuario](docs/manual-usuario.md)
- [Manual de operación](docs/manual-operacion.md)
- [Datos de prueba (demo)](docs/datos-demo.md)
- [Roadmap V1.1 (funcionalidades adicionales)](docs/roadmap-v1.1.md)
- [Roadmap V2.0 (estudio multicliente y seguimiento por proceso)](docs/roadmap-v2.0.md)
- [Historial de cambios](CHANGELOG.md)

## Estado del proyecto

Sistema contable **completo y estable para uso en producción** en red local (estudio
multicliente), resultado de la evolución encadenada:

| Etapa | Alcance |
|---|---|
| **V1.0** | Base contable: PUC, terceros, comprobantes con partida doble, periodos, libros, estados financieros, cartera, inventario, respaldo, red local, roles |
| **V1.1** | Activos fijos y depreciación, bitácora de auditoría, cierre anual, provisión de cartera, indicadores, libros oficiales PDF, presupuesto, nómina, alertas |
| **V2.0** | Estudio multicliente (empresa por cliente), seguimiento por proceso, conciliación bancaria, adjuntos y exportación de informes |
| **V2.1 / V2.2** | Estabilización, aislamiento entre empresas, rediseño profesional de la interfaz y respaldo robustecido |

La versión interna actual es **2.2.0** (el cierre de la etapa se marcó como Release de
GitHub sobre el tag `v2.2.0`). El detalle versión por versión está en
[CHANGELOG](CHANGELOG.md), la instalación desde cero en "Instalación desde cero" más
arriba y el despliegue en red local en [docs/despliegue.md](docs/despliegue.md).
