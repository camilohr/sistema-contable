# Historial de cambios

## [2.2.0] - 2026-08-06

Cierre de pendientes de V2.1, endurecimiento de la lógica contable y rediseño
profesional de la interfaz. Alcance definido en el plan V2.2 (Partes 1-3); sin reglas
contables nuevas más allá de los casos límite endurecidos y sin dependencias externas.

### Parte 1 — Cierre de V2.1
- CSS Modules completado: las 18 pantallas restantes usan el sistema compartido de
  `index.css`; se corrigió la convención camelCase en `Reportes.module.css` y
  `Resumen.module.css` (clases que no se aplicaban en runtime).

### Parte 2 — Endurecimiento contable
- **Consecutivo de comprobantes atómico**: nueva `backend/src/lib/consecutivo.ts`
  (`SELECT ... FOR UPDATE` dentro de la transacción) que elimina la carrera en la
  asignación del consecutivo bajo creación concurrente (test con `Promise.all`).
- Tests de partida doble: rechazo de comprobante con un solo asiento y de montos
  negativos en débito/crédito.
- Cierre anual: cuentas de resultado (clases 4-7) en cero tras el cierre y control de
  rol AUXILIAR (403).
- Redondeo de depreciación con fracción de centavo mantiene el asiento cuadrado.
- **Aislamiento entre empresas**: `backend/tests/aislamiento-empresas.test.ts` con 117
  casos parametrizados sobre todas las rutas protegidas por `requireEmpresa` (403 sin
  vínculo a la empresa).

### Parte 3 — Diseño profesional de la interfaz (UI V2.2)
- Sistema de diseño en `frontend/src/index.css` (design tokens en `:root`): paleta azul
  institucional, escala tipográfica y de espaciado, radios, elevación y semáforo
  formalizado. Tipografía **Inter local** (`@fontsource/inter`, sin CDN) e iconografía
  `lucide-react`.
- UI kit reutilizable en `frontend/src/components/ui/` (Button, Input/Select/Textarea,
  Badge, Card, Modal accesible, Table).
- Login y Layout rediseñados (sidebar oscura agrupada por pasos del proceso, topbar con
  selector de empresa y chip de usuario/rol, responsivo a 1024px y 768px).
- Pantallas de datos densos (Comprobantes, Reportes, Indicadores), Dashboard con
  módulos e iconos, y aplicación del sistema al resto de pantallas.
- Accesibilidad: `:focus-visible`, foco gestionado en modales y contraste AA.
- QA visual Playwright de las 24 pantallas en `docs/qa-v2.2-screenshots/` y recorrido
  funcional sin regresiones, documentado en `docs/qa-v2.2.md`.

## [2.1.0] - 2026-08-06

Estabilización de la fase de transición a CSS Modules, correcciones de QA y
preparación para el endurecimiento contable y rediseño de interfaz (V2.2).
Alcance definido en el plan de cierre V2.1; sin reglas contables nuevas.

### Correcciones de QA (validadas con Playwright)
- Panel de cartera de clientes ahora incluye todas las empresas para un ADMIN global
  (antes solo mostraba la empresa activa).
- Corrección de la colisión CSS `.estado-titulo` y de columnas sin estilo en
  `ComprobanteForm` (Fase 2 de estabilización).
- Migración parcial a CSS Modules (9 pantallas): Comprobantes, Reportes, Resumen,
  Login, AdjuntosLista, AlertasPanel, Procesos, Layout y Conciliaciones. `index.css`
  reducido de 1006 a 520 líneas.

### Hallazgos corregidos durante el QA (3/3)
1. **Eliminar un periodo con presupuesto no funcionaba:** `periodos.controller.ts`
   ahora cuenta las dependencias del periodo (comprobantes, presupuestos,
   conciliaciones, nóminas, provisiones, depreciaciones) y `eliminar` responde `400`
   con mensaje claro en lugar de lanzar un error no controlado. `Periodos.tsx`
   deshabilita el botón Eliminar con tooltip cuando hay dependencias. Tests nuevos en
   `backend/tests/presupuesto.test.ts`.
2. **CSS Modules en kebab-case:** `ComprobanteForm.module.css` usaba kebab-case y
   `styles.asientosHead` era `undefined`; renombrado a camelCase, consistente con el
   resto de módulos.
3. **`cuentaId` como string:** el formulario enviaba `cuentaId` como string y el
   backend espera número; corregido con `Number(e.target.value)` en `ComprobanteForm.tsx`.

### Otras mejoras
- Distinción de persona natural (CC/CE/pasaporte) vs persona jurídica (NIT) en
  terceros y clientes, con sus respectivos flujos y tablas.

## [2.0.0] - 2026-08-05

Estudio contable multicliente, seguimiento por proceso y exportación de informes.
Alcance definido en [Roadmap V2.0](docs/roadmap-v2.0.md); reestructuración estructural
(multientidad), integración, seguimiento y exportación — sin nuevas reglas contables.

### Fase 1 — Multientidad
- Cada fila de negocio pertenece a una empresa (`empresaId`); una sola base de datos
  multientidad, nunca una BD por cliente. Scoping por tabla y unicidades compuestas
  (`[empresaId, ...]`) en consecutivos, códigos y periodos.
- Modelos `Empresa` y `UsuarioEmpresa` (acceso y rol por cliente); `Cuenta`,
  `ParametroNomina` y `ParametroProvision` globales con override por empresa.
- Header `X-Empresa-Id` + middleware `requireEmpresa`: empresa activa y rol efectivo
  (el más restrictivo entre el rol global y el de la empresa); un ADMIN global accede
  a todas las empresas sin fila.
- Frontend con `EmpresaContext`, selector de empresa y rutas `/empresa/:empresaId/...`.

### Fase 2 — Procesos contables y seguimiento
- Modelos `ProcesoContable` (uno por empresa y año), `ActividadProceso` (checklist de
  7 actividades) y `NotaSeguimiento`; plantilla por defecto en código.
- Endpoints `/api/procesos` (listar, crear, detalle, estado, marcar actividad, notas,
  cartera global) e integración automática: cierre, nómina, provisión, presupuesto y
  comprobantes marcan su actividad dentro de la misma transacción.
- Página de Seguimiento por procesos y cartera de clientes con semáforo en el frontend.

### Fase 3 — Navegación por proceso
- `GET /api/resumen`: vista consolidada de la empresa activa (periodo objetivo,
  proceso con avance, estado de cada área y alertas por severidad).
- Landing por empresa ("Resumen del proceso"), menú lateral agrupado por el ciclo del
  proceso y página de módulos.

### Fase 4 — Conciliación, soportes y exportación
- Conciliación bancaria: modelos `Conciliacion` y `MovimientoExtracto`, importación de
  extracto CSV idempotente (hash de fila), cruce automático con asientos, aprobación
  que marca la actividad del proceso.
- Adjuntos por comprobante y empresa (máx. 15 MB, hash SHA-256), carpeta `adjuntos/`
  incluida en el respaldo (`*.adjuntos.zip`) y extraída en la restauración.
- Exportación de informes: PDF completados (balance general, estado de resultados,
  indicadores), CSV/XLSX de los seis reportes y paquete ZIP por periodo/año, todo
  local (módulo `zip-lite.mjs` sin dependencias).

### Fase 5 — Permisos por cliente y administración
- `GET /api/usuarios`, `/api/usuarios/disponibles`, `POST /api/usuarios/:id/vincular`,
  `PATCH /api/usuarios/:id/rol` y `DELETE /api/usuarios/:id` (retiro), con bloqueo de
  auto-operación y auditoría.
- `GET /api/empresas/administracion`, creación/edición de clientes con su proceso del
  año, activación/desactivación y **baja ordenada**: `POST
  /api/empresas/:empresaId/informes/paquete-final` valida procesos e informes y
  entrega el ZIP final del cliente antes de desactivarlo.
- `enum AccionAuditoria` ampliado con 12 acciones (empresa y proceso).
- Frontend: páginas "Usuarios" (rol por empresa, asignar disponibles, retirar) y
  "Clientes" (listado con conteos, crear/editar, baja ordenada, reactivar, paquete).

### Fase 6 — Consolidación, respaldo y manuales
- Respaldo global verificado con **informe por empresa**: conteos por cliente
  (objetos y adjuntos) impresos y registrados en `backup.log` tras cada copia.
- Manuales de usuario y de operación actualizados al flujo multicliente, incluida la
  exportación de informes.
- Cierre: este CHANGELOG, versión 2.0.0 y tag `v2.0.0`.

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

### Módulo 8 — Alertas y recordatorios internos
- Modelo `ReglaAlerta` (migración `regla_alerta`) con `tipo` único, `dias` (umbral opcional) y `activa`; `enum TipoAlerta` con `CARTERA_VENCE`, `PERIODO_SIN_CERRAR`, `ACTIVO_SIN_BAJA` y `TERCERO_SIN_MOVIMIENTO`. Se siembran las 4 reglas por defecto (cartera 15 días, cliente sin movimientos 90 días) en `npm run db:seed`.
- `backend/src/lib/alertas.ts`: evaluación de las reglas activas contra el estado actual — cartera por cobrar/pagar con saldo vencida (ALTA) o próxima a vencer (MEDIA), periodos que terminaron y siguen abiertos (MEDIA), activos totalmente depreciados sin dar de baja (MEDIA) y clientes sin movimientos recientes (BAJA) — con fallback a los valores por defecto si no hay reglas.
- Endpoints `/api/alertas` (GET, todos los roles), `/api/alertas/reglas` (GET todos, PUT ADMIN/CONTADOR para activar/desactivar y ajustar el umbral de días).
- Panel "Alertas y recordatorios" en el Dashboard del frontend: lista con badge de severidad y edición de reglas para ADMIN/CONTADOR.
- 11 pruebas nuevas (315 en total).

### Módulo 7 — Presupuesto y control presupuestal
- Modelo `Presupuesto` (migración `presupuesto`) con `cuentaId`, `periodoId` y `valor` `Decimal(15,2)`, único por cuenta y periodo; sin modelos extra de reportes.
- `PUT /api/presupuesto/:periodoId` (ADMIN/CONTADOR): reemplaza el presupuesto completo del periodo (upsert + eliminación del resto), valida cuentas activas con `permiteMovimiento`, rechaza cuentas inexistentes o sin movimiento y valores negativos.
- `GET /api/presupuesto/:periodoId` (consulta) y `GET /api/presupuesto/:periodoId/ejecucion`: ejecución sobre comprobantes `CONTABILIZADO` del periodo por cuenta (presupuestado, ejecutado, variación y porcentaje de ejecución), con totales.
- `enum AccionAuditoria` extendido con `CARGAR_PRESUPUESTO`; cada carga registra la acción en la bitácora (módulo 2) con el detalle de partidas y total.
- Página de Presupuesto en el frontend: selector de periodo, edición de partidas con búsqueda de cuentas activas con movimiento, guardado por reemplazo y consulta de ejecución presupuestal; edición solo ADMIN/CONTADOR.
- 13 pruebas nuevas (304 en total).

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
