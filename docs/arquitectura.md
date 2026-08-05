# Arquitectura del Sistema Contable

## 1. Visión general

Aplicación **web** que se ejecuta en el servidor local (máquina del contador) y es
accesible desde cualquier equipo de la misma red local mediante un navegador. No se
instala software en los equipos clientes.

```
                    RED LOCAL (LAN)
┌───────────────────────────────────────────────┐
│                                               │
│   Equipo Cliente 1   ─┐                       │
│   (navegador)         │  HTTP                │
│   Equipo Cliente 2   ─┼──────────────────────►│
│   (navegador)         │    http://IP:3000     │
│   ...                 │                       │
│                       │                       │
│   SERVIDOR LOCAL (máquina del contador)       │
│   ┌───────────────────────────────┐           │
│   │  Frontend React (Vite)  ─────┐│           │
│   │  (build estático servido     ││           │
│   │   por el backend o Nginx)    ││           │
│   ├──────────────────────────────┼│           │
│   │  API REST Express + TS       ││  Prisma   │
│   │  (puerto 3000)  ────────────►┼├──────────►│  PostgreSQL 18
│   │  JWT auth · roles · validación││          │  (puerto 5432)
│   └──────────────────────────────┘│           │
│                                    └──────────►│
└───────────────────────────────────────────────┘
```

## 2. Stack técnico

| Capa | Tecnología | Justificación |
|---|---|---|
| Backend | Node.js 24 + TypeScript + Express | Stack que ya tiene el usuario; tipado seguro |
| ORM | Prisma | Migraciones versionadas y consultas tipadas |
| Frontend | React 18 + TypeScript + Vite | SPA rápida; solo el servidor necesita el build |
| BD | PostgreSQL 18 | Datos contables transaccionales; concurrencia de red |
| Auth | JWT (access token) + bcrypt | Sesión stateless; roles por token |
| Despliegue | PM2 (proceso Node) | Reinicio automático y logs en Windows |
| Editor | VS Code | Entorno de desarrollo del usuario |

## 3. Estructura del monorepo

```
Default Project/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma        # Modelo de datos (Fase 1)
│   ├── src/
│   │   ├── server.ts            # Punto de entrada
│   │   ├── routes/              # Rutas por módulo (incl. empresas)
│   │   ├── controllers/         # Lógica por módulo (incl. empresas)
│   │   ├── services/            # Reglas de negocio contable
│   │   ├── middleware/          # Auth, roles, requireEmpresa, validación, errores
│   │   ├── lib/prisma.ts        # Cliente Prisma
│   │   └── utils/               # Utilidades (consecutivos, números)
│   ├── seed/
│   │   └── puc.ts               # Importación del PUC (Fase 2)
│   ├── tests/                   # Pruebas de fuego por módulo
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/               # Vistas por módulo
│   │   ├── components/          # Componentes reutilizables
│   │   ├── api/                 # Cliente HTTP (inyecta X-Empresa-Id)
│   │   ├── context/             # Sesión (JWT) + empresa activa
│   │   ├── hooks/
│   │   └── App.tsx
│   ├── index.html
│   └── package.json
├── docs/                        # Documentación
└── backups/                     # Respaldos de BD (generados)
```

## 4. Flujo de autenticación

1. Usuario ingresa correo + contraseña.
2. El backend valida contra `usuarios` con bcrypt y emite un JWT con `rol`.
3. El frontend guarda el token y lo envía en cada petición (`Authorization: Bearer`).
4. Middleware valida el token y verifica el rol requerido por la ruta.

El sistema es **multientidad por fila** (Fase 1 de V2.0): cada petición además
identifica la empresa activa mediante el header `X-Empresa-Id`, validada por el
middleware `requireEmpresa` (§8). El rol efectivo se resuelve por request combinando el
rol global del usuario con su rol en esa empresa.

## 5. Reglas contables transversales (backend)

- **Partida doble:** todo comprobante exige `suma(débitos) = suma(créditos)`.
- **Inmutabilidad:** un comprobante contabilizado **no** se edita ni se borra; solo
  se anula con un contrasiento (se conserva el registro original para auditoría).
- **Consecutivos:** por tipo de comprobante (diario/ingreso/egreso), sin saltos.
- **Catálogo protegido:** una cuenta con movimientos no puede eliminarse.
- **Periodos:** los asientos solo se registran en periodos abiertos; el cierre de
  periodo impide modificar movimientos anteriores.

## 6. Seguridad

- Contraseñas con bcrypt (sal + hash).
- Tokens JWT firmados; secretos solo en variables de entorno.
- Validación de entrada en cada ruta.
- Registro de auditoría de acciones críticas (contabilizar, anular, borrar, cierre).

## 7. Despliegue en red local

1. Instalar PostgreSQL en el servidor y crear la base de datos y usuario del sistema.
2. Compilar el frontend (`npm run build`) y servirlo junto al backend.
3. Levantar el backend con PM2 en el puerto 3000.
4. Configurar el firewall de Windows para permitir el puerto 3000 en la red local.
5. Fijar una IP estática (o reserva DHCP) en el servidor.
6. Los clientes acceden a `http://<IP-del-servidor>:3000`.

## 8. Multientidad (Fase 1 de V2.0)

Cada fila de negocio pertenece a una empresa (`empresaId`); nunca hay una BD por
cliente. Modelo y scoping por tabla en `docs/modelo-datos.md` (§6); decisiones de
diseño en `docs/roadmap-v2.0.md` (§4).

### 8.1 Identificación de la empresa activa (frontend)

- `EmpresaContext` (`src/context/EmpresaContext.tsx`) carga las empresas del usuario
  (`GET /api/empresas`), mantiene la empresa activa y la persiste en `localStorage`
  (`empresaId`).
- El cliente HTTP (`src/api/client.ts`) envía el header `X-Empresa-Id` en cada
  petición (con fallback al valor de la URL `/empresa/:id/...` en la primera carga).
- Las rutas llevan la empresa en la URL (`/empresa/:empresaId/...`), lo que permite
  varias pestañas y enlaces compartibles; el selector de la barra superior navega al
  Dashboard de la empresa elegida.

### 8.2 Middleware `requireEmpresa` (backend)

Por cada request valida:

1. Header `X-Empresa-Id` presente (case-insensitive), empresa existente y activa.
2. `UsuarioEmpresa` con `activo = true` para el usuario (un ADMIN global pasa sin fila:
   acceso implícito a todas las empresas).
3. Puebla `req.empresaId` (string), `req.empresa` y `req.rolEfectivo` — el más
   restrictivo entre `Usuario.rol` y `UsuarioEmpresa.rol`.

Los controladores de negocio filtran sus consultas por `req.empresaId`; las unicidades
compuestas (`[empresaId, ...]`, ver modelo-datos §6.4) impiden que consecutivos,
códigos y periodos colisionen entre empresas.

### 8.3 Tablas globales y excepciones por empresa

- **PUC base compartido:** `Cuenta` con `empresaId` nulo + cuentas propias por cliente.
  La búsqueda prefiere la cuenta de la empresa activa y cae al catálogo base.
- **`ParametroNomina` / `ParametroProvision`:** registro global (`empresaId` nulo) con
  override por empresa; misma regla de precedencia.
- **`ParametroCuentaNomina`:** por empresa. **`ReglaAlerta`:** global.
- `Parametro` (V1) se absorbió en `Empresa`; la empresa actual del sistema pasó a ser
  el primer cliente en la migración de datos.

### 8.4 Endpoint `/api/empresas`

`GET /api/empresas` devuelve las empresas del usuario autenticado — todas para un
ADMIN global; solo las asignadas (`UsuarioEmpresa` activa) para CONTADOR/AUXILIAR —
con el rol efectivo en cada una.

## 9. Procesos contables y seguimiento (Fase 2 de V2.0)

### 9.1 Modelo

`ProcesoContable` (uno por empresa y año, `@@unique([empresaId, anio])`) con su
checklist de `ActividadProceso` (orden, estado, fechas esperada/real) y sus
`NotaSeguimiento`. Detalle completo de campos en `docs/modelo-datos.md` (§6) y
decisiones en `docs/roadmap-v2.0.md` (Fase 2).

### 9.2 Plantilla por defecto

Al crear un proceso se genera en código (`backend/src/lib/procesos.ts`) la plantilla de
7 actividades: comprobantes, conciliación, nómina, provisión de cartera, presupuesto,
cierre de periodo y cierre de año. La lib expone `marcarActividadProceso(db, empresaId,
anio, tipo, fecha?)`, que acepta tanto el `PrismaClient` global como un cliente de
transacción.

### 9.3 Endpoints `/api/procesos`

- `GET /api/procesos` — procesos de la empresa activa con avance y conteo de notas.
- `POST /api/procesos` `{ anio }` — crea el proceso con su plantilla (ADMIN/CONTADOR).
- `GET/PATCH/DELETE /api/procesos/:id` — detalle (actividades + notas), cambio de
  estado, eliminación (solo ADMIN).
- `PATCH /api/procesos/:id/actividades/:actividadId` — marcar/desmarcar y fecha
  esperada (ADMIN/CONTADOR).
- `POST /api/procesos/:id/notas` — nota de seguimiento (ADMIN/CONTADOR).
- `GET /api/procesos/cartera` — para **todas** las empresas del usuario (no usa
  `requireEmpresa`): semáforo de la cartera de clientes (vista Resumen).

### 9.4 Integración automática

Cierre de periodo y de año, contabilización de nómina, provisión de cartera, carga de
presupuesto y contabilización de comprobantes marcan su actividad como completada
**dentro de la misma transacción** que genera la operación (la marca se revierte si la
operación revierte). Si no existe proceso para la empresa/año no se crea: el
seguimiento es opcional hasta que se crea el proceso.

### 9.5 Frontend

- Página "Seguimiento por procesos" (`/empresa/:empresaId/procesos`): lista por año,
  checklist con fechas, notas, cambio de estado y semáforo.
- Cartera de clientes con semáforo por empresa/proceso (`GET /api/procesos/cartera`),
  integrada en la vista "Resumen del proceso" de cada empresa (componente
  `CarteraProcesos`).

## 10. Resumen por cliente y navegación por proceso (Fase 3 de V2.0)

### 10.1 Endpoint `GET /api/resumen`

Vista consolidada del estado de la **empresa activa** (usa `requireEmpresa`). Devuelve:

- `empresa` — datos del cliente y rol efectivo del usuario.
- `periodoObjetivo` — último periodo abierto (`periodoId`, `nombre`, `anio`).
- `proceso` — proceso contable vigente (año del periodo objetivo) con `avance`.
- `periodos`, `comprobantes`, `nomina`, `provision`, `presupuesto`, `cierreAnio` —
  estado de cada área con los id necesarios para navegar.
- `alertas` — totales por severidad (ALTA/MEDIA/BAJA), usando `evaluarAlertas`.

Cada bloque es el "semáforo" de un paso del proceso; el frontend enlaza cada tarjeta a
su módulo (`procesos`, `comprobantes`, `nomina`, `provision-cartera`, `presupuesto`,
`cierre-anual`).

### 10.2 Navegación

- Landing de cada empresa: **"Resumen del proceso"** (`/empresa/:empresaId` → página
  `Resumen`), que reemplaza al Dashboard como entrada; el grid de módulos se mantiene
  en `/empresa/:empresaId/menu` ("Menú de módulos").
- El menú lateral (`Layout`) se agrupa en secciones por el ciclo del proceso: **Proceso**
  (resumen, seguimiento, periodos, cierre anual), **Ciclo del mes** (comprobantes,
  nómina, parámetros, provisión de cartera, presupuesto), **Información** (reportes,
  CxC, CxP, indicadores), **Catálogos** (cuentas, terceros, productos, activos fijos,
  empleados) y **Administración** (solo ADMIN: usuarios, auditoría).
- `Resumen` incluye el panel de alertas (`AlertasPanel`) y la cartera de clientes
  (`CarteraProcesos`).

### 10.3 Tests

`backend/tests/resumen.test.ts` cubre el resumen por rol y por estado (borrador vs.
contabilizado) de cada área. No hay cambios de esquema en esta fase.
