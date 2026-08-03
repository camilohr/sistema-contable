# Historial de cambios

## [1.0.0] - 2026-08-03

Primera versión liberada: sistema contable completo según normatividad colombiana, desplegable en un servidor local.

### Fase 0 — Diseño y planificación
- Documento de diseño y planificación del sistema contable.

### Fase 1 — Base del proyecto
- Backend Node.js + TypeScript + Express + Prisma, frontend React + Vite y base de datos PostgreSQL.
- Autenticación JWT + bcrypt y modelos base.

### Fase 2 — Catálogo de cuentas PUC
- Importación del PUC con derivación automática de clase, grupo, naturaleza y tipo de saldo.
- CRUD de cuentas, cuenta nueva por código y bloqueo de cuentas con movimiento.

### Fase 3 — Terceros
- CRUD de terceros con tipos de documento y validación de NIT.

### Fase 4 — Comprobantes y asientos
- Comprobantes de tipo ingresos, egresos y soporte; partida doble validada (débitos = créditos).
- Periodos contables y control de comprobantes (borrador, contabilizado, anulado).
- Asiento automático de cartera e inventario al contabilizar.

### Fase 5 — Libros y reportes
- Libro diario, libro mayor y balance de comprobación con filtros por periodo, fechas y cuenta.

### Fase 6 — Estados financieros
- Balance general (ecuación contable) y estado de resultados con agrupación por clase.

### Fase 7 — Cartera e inventario
- Cuentas por cobrar y por pagar con abonos (recibos/pagos) y cierre automático.
- Productos con kardex de movimientos (entradas, salidas, ajustes) y costo promedio.

### Fase 8 — Respaldo, red local y manuales
- Respaldo y restauración de la base (pg_dump) con retención y verificación.
- Despliegue en un solo puerto: el backend sirve la UI construida; firewall de Windows y PM2.
- Manuales de usuario y de operación, y script de datos demo idempotente.

### Fase 9 — Gestión de usuarios y contraseña inicial
- Página de usuarios (solo ADMIN) para crear usuarios con rol y contraseña inicial.
- Cambio de contraseña obligatorio en el primer ingreso (flag `debeCambiarPassword`), con bloqueo de la API hasta cambiarla.

### Fase 10 — Control de acceso por roles
- Escritura restringida a ADMIN/CONTADOR en todas las rutas de negocio (comprobantes, cuentas, terceros, periodos, productos, CxC/CxP); usuarios solo ADMIN.
- Frontend oculta acciones según rol (AUXILIAR solo lectura) y dashboard/menú por rol.
- 59 pruebas nuevas de roles (172 pruebas en total).

### Fase 11 — Empaquetado y liberación
- README de instalación desde cero, CHANGELOG y tag `v1.0.0`.
- Repositorio remoto y publicación.
