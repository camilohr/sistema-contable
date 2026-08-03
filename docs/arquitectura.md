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
│   │   ├── routes/              # Rutas por módulo
│   │   ├── controllers/         # Lógica por módulo
│   │   ├── services/            # Reglas de negocio contable
│   │   ├── middleware/          # Auth, roles, validación, errores
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
│   │   ├── api/                 # Cliente HTTP (fetch/axios)
│   │   ├── context/             # Estado de sesión (JWT)
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
