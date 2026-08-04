# AGENTS.md

Sistema contable local para contador particular, normatividad colombiana (PUC), PostgreSQL y acceso desde la red local.

## Stack y estructura

- `backend/` — Node 20+ · TypeScript · Express · Prisma ORM · PostgreSQL · JWT + bcrypt (roles ADMIN, CONTADOR, AUXILIAR)
- `frontend/` — React 19 · TypeScript · Vite · React Router · axios
- `docs/` — arquitectura.md, modelo-datos.md, normatividad.md, manual-usuario.md, manual-operacion.md, despliegue.md, respaldo.md, datos-demo.md
- `scripts/` — utilidades de despliegue en PowerShell (`desplegar.ps1`, `abrir-puerto.ps1`)
- `backend/prisma/schema.prisma` — fuente de verdad del modelo de datos
- `backend/tests/*.test.ts` — tests de API (Vitest + supertest). El frontend no tiene tests.

## Comandos

Backend (workdir `backend/`):
- `npm run dev` — servidor en modo watch (`tsx`)
- `npm run build` — compila con `tsc` a `dist/`
- `npm run start` — ejecuta el build (`node dist/index.js`)
- `npm test` — Vitest (`backend/tests`). Usa una base de datos separada (`contabilidad_test`), derivada de `DATABASE_URL` con sufijo `_test` o sobreescrita con `DATABASE_URL_TEST`; el global setup la crea, aplica migraciones y siembra el PUC automáticamente. Nunca toca la base de producción.
- `npm run db:migrate` — Prisma migrate dev
- `npm run db:seed` — crea `admin@sistema.local` / `Admin123!` y catálogo PUC
- `npm run db:seed:demo` — datos demo idempotentes
- `npm run backup`, `backup:list`, `restore` — respaldos

Frontend (workdir `frontend/`):
- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — oxlint

## Reglas

- Antes de tocar lógica contable, leer `docs/arquitectura.md`, `docs/modelo-datos.md` y `docs/normatividad.md`.
- Partida doble obligatoria en comprobantes (ver `backend/tests/comprobantes.test.ts`).
- Al cambiar el esquema Prisma: generar migración con `npm run db:migrate`; no editar migraciones a mano.
- Respetar roles de acceso; cada ruta nueva con control por rol debe tener test en `backend/tests`.
- No romper el flujo de primer ingreso (cambio de contraseña obligatorio).
- Antes de terminar: `npm test` (backend) y `npm run lint` (frontend).
- Nunca imprimir ni editar `backend/.env` (ignorado por git; JWT_SECRET y DATABASE_URL son sensibles).

## Entorno local

- Web: `http://localhost:3000` · Health: `http://localhost:3000/api/health`
- PostgreSQL local (URL en `backend/.env`). Para inspeccionar la BD usar las herramientas MCP `postgres` (prefijo `postgres_*`); es solo lectura/consulta.
- Para validar el frontend con navegador: levantar primero backend y frontend, y usar las herramientas MCP `playwright`.
- PM2: `pm2 start ecosystem.config.cjs && pm2 save` (puerto 3000). Detalles en `docs/despliegue.md`.

## Herramientas MCP disponibles

- `postgres` — consultas e inspección de la base de datos del proyecto.
- `playwright` — navegador para validar flujos del frontend.
