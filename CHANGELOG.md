# Historial de cambios

## [1.1.0] - en desarrollo

Siguiente iteración sobre la V1.0.0; alcance definido en [Roadmap V1.1](docs/roadmap-v1.1.md).

### Módulo 1 — Activos fijos y depreciación
- Modelos `ActivoFijo` y `Depreciacion` (migración `activos_fijos_depreciacion`), con cuentas de activo (grupo 15), depreciación acumulada (1596) y gasto (5160/5260).
- Alta de activos con método línea recta, vida útil en meses y valor residual.
- Depreciación por periodo en un solo comprobante DIARIO contabilizado (partida doble), con bloqueo por periodo y control de doble generación (`@@unique([activoId, periodoId])`).
- Transición automática a `DEPRECIADO_TOTAL` al completar la vida útil y exclusión del cálculo mensual.
- Baja de activo con asiento de retiro (salida del costo y de la depreciación acumulada) en periodo abierto.
- Endpoints `/api/activos-fijos` (listar, crear, editar, depreciar, baja, historial) con control de roles (escritura ADMIN/CONTADOR).
- Página de Activos Fijos en el frontend (listado, alta, depreciación por periodo, baja, historial).
- 17 pruebas nuevas (189 en total).

### Módulo 2 — Bitácora de auditoría
- Modelo `Auditoria` (migración `auditoria`) con `AccionAuditoria` tipada, `detalle` JSON y registro inmutable de solo lectura (sin endpoints de borrado/edición).
- Helper `lib/auditoria.ts` (`registrarAuditoria`) que escribe dentro de la misma transacción del cambio, garantizando atomicidad.
- Integración en los puntos críticos: contabilizar/anular/eliminar comprobante, cerrar/reabrir periodo, crear usuario, crear/editar cuenta y acciones de activos fijos (crear, editar, depreciar, baja).
- Endpoint `GET /api/auditoria` (solo ADMIN) con filtros por usuario, entidad, acción, rango de fechas y paginación por cursor.
- Página de Bitácora de auditoría en el frontend (solo ADMIN) con filtros y "cargar más".
- 13 pruebas nuevas (202 en total).

### Módulo 3 — Cierre de ejercicio anual
- Modelo `CierreAnual` (migración `cierre_anual`) con `anio` único y referencia al comprobante de cierre, la cuenta de utilidades y el usuario que lo ejecutó.
- `POST /api/cierre-anual/:anio` (solo ADMIN): traslada los saldos de las cuentas de resultado (clases 4 a 7) a la cuenta de utilidades del patrimonio (3605 por defecto o la indicada en clase 3), generando un comprobante DIARIO contabilizado con partida doble (débitos = créditos).
- Reglas de negocio: todos los periodos del año deben estar cerrados, un año solo se cierra una vez, sin cuentas de resultado con saldo el cierre se rechaza y la cuenta de utilidades debe ser activa y permitir movimiento.
- Bloqueo posterior al cierre: nuevos comprobantes con cuentas de resultado (clases 4-7) en el año cerrado se rechazan aunque se reabra un periodo; los comprobantes de balance (clases 1-3) siguen permitidos.
- `GET /api/cierre-anual` (listado) y `GET /api/cierre-anual/:anio` (detalle con asiento) para todos los roles autenticados.
- Registro de la acción `CERRAR_ANIO` en la bitácora de auditoría (módulo 2).
- Página de Cierre anual en el frontend: listado de años cerrados, formulario de ejecución (solo ADMIN) y detalle del asiento de cierre.
- 15 pruebas nuevas (217 en total).

### Módulo 4 — Provisión de cartera (deterioro)
- Modelos `ParametroProvision` (rangos de días de mora y porcentaje, `@@unique([diasDesde, diasHasta])`) y `ProvisionCartera` (un registro por periodo, con el total calculado y referencia opcional al comprobante).
- Cuentas PUC nuevas en el seed: `1399` "Provisión de cartera" y `5199` "Provisión de cartera" (gasto), más parámetros por defecto (1-30 días: 1%, 31-60: 5%, 61-90: 10%, 91+: 20%).
- `POST /api/cartera/provision/calcular/:periodoId` (ADMIN/CONTADOR): calcula el deterioro con base en la mora de las cuentas por cobrar al cierre del periodo y contabiliza solo el incremento no registrado — débito a 5199 y crédito a 1399, o reversión en el caso contrario — mediante un comprobante DIARIO contabilizado. Si el incremento es cero se registra la provisión sin comprobante.
- Cálculo incremental sobre lo ya contabilizado (saldo de la cuenta 1399 en comprobantes contabilizados); un solo cálculo por periodo; anular el comprobante permite recalcular.
- `PUT /api/cartera/provision/parametros` (ADMIN/CONTADOR) con validación de rangos (sin solapamiento ni duplicados, solo el último rango sin límite superior); `GET` para consulta.
- `GET /api/cartera/provision/:periodoId` con el detalle del asiento para todos los roles autenticados.
- Registro de la acción `CALCULAR_PROVISION` en la bitácora de auditoría (módulo 2).
- Refactor: `lib/comprobantes.ts` centraliza `crearComprobanteDiario` (partida doble y consecutivo), ahora usado por activos fijos, cierre anual y provisión de cartera.
- Página de Provisión de cartera en el frontend: cálculo por periodo, resumen del ajuste, desglose de cartera por días de mora, consulta por periodo y edición de parámetros.
- 18 pruebas nuevas (235 en total).

### Módulo 5 — Indicadores financieros y análisis comparativo
- `backend/src/lib/indicadores.ts` con funciones puras sobre los saldos agregados (misma fuente que los reportes): clasificación corriente/no corriente por convención PUC (activo corriente grupos 11-14, pasivo corriente 21-26), inventario (14) y cartera (13).
- Razones financieras: razón corriente, prueba ácida, endeudamiento, margen neto, rotación de cartera y rotación de inventario; división por cero devuelve `null`.
- `GET /api/reportes/indicadores/:periodoId` (todos los roles): razones y datos base del periodo.
- `GET /api/reportes/indicadores/comparativo?desde=&hasta=`: razones lado a lado (las rotaciones del periodo final usan el saldo promedio de ambos periodos), análisis vertical (participación de cada cuenta sobre su sección en ambos periodos) y análisis horizontal (variación absoluta y porcentual por cuenta y sección).
- Sin modelos nuevos ni migración: 100% cálculo sobre datos ya contabilizados.
- Página de Indicadores financieros en el frontend: vista individual y comparativo con tablas vertical/horizontal.
- 14 pruebas nuevas (249 en total).

### Módulo 6 — Exportación de libros oficiales a PDF
- `backend/src/lib/pdf.ts`: clase `DocumentoPdf` sobre `pdfkit` con encabezado de empresa/NIT/dirección/teléfono (desde `Parametro`), pie con numeración de folio, tablas con paginación y repetición de encabezado, y fila de firma del contador.
- Endpoints `GET /api/reportes/libro-diario.pdf`, `libro-mayor.pdf` y `libro-inventarios.pdf` (todos los roles), con `Content-Type: application/pdf` y `Content-Disposition: inline`; usan los mismos filtros de los reportes JSON (periodo, fechas, cuenta).
- Refactor: consultas de libro diario, libro mayor y balance general extraídas a helpers reutilizables (`datosLibroDiario`, `datosLibroMayor`, `datosBalanceGeneral`) sin cambiar las respuestas JSON existentes.
- El libro de inventarios equivale al balance general del periodo (activos, pasivos y patrimonio valorados) con totales, sección de firma y advertencia si la ecuación contable no cuadra.
- Página de Libros y reportes: botones de descarga PDF según la pestaña activa, respetando los filtros seleccionados.
- 5 pruebas nuevas (254 en total).

### Infraestructura de pruebas — base de datos separada
- `npm test` ya no toca la base de producción: la suite usa una base de datos dedicada (`contabilidad_test`), derivada automáticamente de `DATABASE_URL` con el sufijo `_test` o sobreescrita con `DATABASE_URL_TEST`.
- Global setup de Vitest (`tests/global-setup.ts`): crea la base si no existe, aplica las migraciones con `prisma migrate deploy` y siembra PUC/parámetros de forma idempotente en cada ejecución.
- La URL de la base de tests se inyecta a los workers vía `test.env` (`vitest.config.ts`); las pruebas que antes borraban tablas de producción ahora lo hacen solo en `contabilidad_test`.
- Documentación de la variable `DATABASE_URL_TEST` en `backend/.env.example` y en `AGENTS.md`.

### Infraestructura de pruebas — CI en GitHub Actions
- `.github/workflows/ci.yml`: en cada push a `master` (o PR) ejecuta dos jobs — backend (`npm ci`, `prisma generate`, `npm test`, `npm run build` con un servicio PostgreSQL 16) y frontend (`npm ci`, `npm run lint`, `npm run build`).
- El CI crea su propia base `contabilidad` como servicio y la suite deriva `contabilidad_test` automáticamente, sin depender de credenciales reales.

### Módulo 9 — Nómina simplificada
- `docs/diseno-nomina.md`: diseño previo a la implementación con las decisiones de alcance V1 (sueldo, auxilio de transporte automático, horas extras y descuentos manuales, aportes, provisión mensual de prestaciones, asientos de nómina y de provisión), parámetros anuales con valores 2026 (SMMLV 1.750.905, auxilio de transporte 249.095), fórmulas con ejemplo numérico, modelo Prisma (Empleado, Nomina, ProvisionNomina, ParametroNomina, ParametroCuentaNomina), mapeo al PUC existente, endpoints y tests sugeridos.
- Modelos Prisma (migraciones `nomina` y `arl_precision`): `Empleado` (documento/tipo, sueldo, auxilio de transporte, ARL variable, fecha de ingreso/retiro, activo), `Nomina` (liquidación mensual por empleado con estado LIQUIDADO/CONTABILIZADO/ANULADO), `ProvisionNomina` (cesantías, intereses, primas y vacaciones), `ParametroNomina` (parámetros anuales con `anio` único) y `ParametroCuentaNomina` (mapeo de conceptos a cuentas PUC). `arlEmpleador` usa `Decimal(5,3)`.
- Endpoints `/api/empleados` (CRUD y retiro con fecha, solo ADMIN/CONTADOR; listado para todos los roles) y `/api/nomina` (parámetros y mapeo de cuentas GET/PUT, liquidar/reliquidar, contabilizar, provisionar y consultar por periodo, con control de roles).
- Liquidación mensual por periodo: sueldo proporcional a días, auxilio de transporte automático (bajo el tope de salarios), IBC con tope de 25 salarios, aportes salud y pensión sobre IBC, parafiscales (caja, ICBF y SENA) si hay 10 o más empleados, aporte solidario, retefuente según tabla de la DIAN y descuentos manuales.
- Contabilización de la nómina en un comprobante DIARIO con partida doble (débitos = créditos) usando el mapeo de cuentas PUC configurable; provisión mensual de prestaciones (cesantías, intereses, prima y vacaciones) en comprobante propio.
- Anulación de nómina: al anular el comprobante de nómina el registro pasa a `ANULADO` y permite reliquidar; la provisión se recalcula según el nuevo total.
- `backend/prisma/seed.ts`: siembra los parámetros 2026 y el mapeo por defecto de cuentas de nómina al PUC existente.
- Páginas de Empleados, Nómina (liquidación, contabilización, provisión y consulta) y Parámetros de nómina en el frontend, con acciones visibles según rol (AUXILIAR solo consulta).
- 37 pruebas nuevas (291 en total).

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
