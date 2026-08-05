# Modelo de Datos

## 1. Convenciones

- Identificadores: `id` UUID (o serial) como llave primaria.
- Todas las tablas incluyen `createdAt` y `updatedAt`.
- Los importes se almacenan como `DECIMAL(15,2)` (nunca `float`) para evitar errores
  de redondeo en contabilidad.
- `Boolean` para estados/banderas; `enum` para tipos fijos.

## 2. Diagrama de entidades

```
empresas ──< terceros
empresas ──< cuentas
empresas ──< periodos
empresas ──< comprobantes
empresas ──< consecutivos
empresas ──< cuentas_por_cobrar
empresas ──< cuentas_por_pagar
empresas ──< productos
empresas ──< activos_fijos
empresas ──< auditoria
empresas ──< cierres_anuales
empresas ──< parametros_nomina / parametros_provision / parametros_cuenta_nomina

usuarios ──< usuarios_empresas >── empresas
usuarios ──┬──< comprobantes (usuario_creo)
           └──< auditoria

terceros ──< comprobantes (tercero_id)
terceros ──< asientos (tercero_id)
terceros ──< cuentas_por_cobrar
terceros ──< cuentas_por_pagar
terceros ──< recibos
terceros ──< pagos

periodos ──< comprobantes

cuentas ──< asientos (cuenta_id)
cuentas ──< activos_fijos (cuenta_id)

comprobantes ──< asientos
comprobantes ──< recibos
comprobantes ──< pagos

productos ──< inventario_movimientos
comprobantes ──< inventario_movimientos

activos_fijos ──< depreciaciones
periodos ──< depreciaciones
```

## 3. Tablas

### 3.1 `usuarios`
Usuarios del sistema con rol.

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| nombre | string | |
| email | string | único |
| password_hash | string | bcrypt |
| rol | enum | `ADMIN`, `CONTADOR`, `AUXILIAR` |
| activo | bool | permite o bloquea el acceso |
| createdAt / updatedAt | datetime | |

### 3.2 `terceros`
Clientes y proveedores (personas naturales o jurídicas).

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| tipo | enum | `CLIENTE`, `PROVEEDOR`, `AMBOS` |
| tipo_documento | enum | `CC`, `NIT`, `CE`, `PASAPORTE` |
| documento | string | único por tipo de documento |
| nombre_razon_social | string | |
| direccion | string | |
| telefono | string | |
| email | string | |
| ciudad | string | |
| activo | bool | |

### 3.3 `cuentas` (Catálogo PUC)
Plan Único de Cuentas para comerciantes.

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| codigo | string | único, ej. `110505` |
| nombre | string | ej. "Caja" |
| nivel | int | 1 = clase, 2 = grupo, 3 = cuenta, 4 = subcuenta, 5 = auxiliar |
| clase | int | 1..9 |
| grupo | int | |
| cuenta | int | |
| subcuenta | int | |
| naturaleza | enum | `DEUDORA`, `ACREEDORA` |
| permite_movimiento | bool | solo las hojas/nivel 4-5 reciben asientos |
| afecta_resultado | bool | true si es ingresos/gastos/costos |
| requiere_tercero | bool | obliga a asociar un tercero en el asiento |
| activa | bool | |

### 3.4 `periodos`
Periodos contables (meses o años fiscales).

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| nombre | string | ej. "2026-01" |
| fecha_inicio | date | |
| fecha_fin | date | |
| estado | enum | `ABIERTO`, `CERRADO` |

### 3.5 `comprobantes`
Documentos de soporte de los asientos.

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| tipo | enum | `DIARIO`, `INGRESO`, `EGRESO` |
| consecutivo | int | único por tipo |
| fecha | date | |
| periodo_id | FK → periodos | |
| tercero_id | FK → terceros | opcional |
| concepto | string | |
| total_debito | DECIMAL(15,2) | |
| total_credito | DECIMAL(15,2) | |
| estado | enum | `BORRADOR`, `CONTABILIZADO`, `ANULADO` |
| usuario_creo | FK → usuarios | |
| usuario_anulo | FK → usuarios | nullable |
| fecha_anulacion | datetime | nullable |

### 3.6 `asientos`
Líneas del comprobante (partida doble).

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| comprobante_id | FK → comprobantes | |
| cuenta_id | FK → cuentas | |
| tercero_id | FK → terceros | opcional |
| debito | DECIMAL(15,2) | |
| credito | DECIMAL(15,2) | |
| detalle | string | |

Regla: en cada comprobante, `suma(debito) = suma(credito)`.

### 3.7 `cuentas_por_cobrar`
Documentos pendientes de cobro a clientes.

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| tercero_id | FK → terceros | |
| comprobante_id | FK → comprobantes | opcional |
| numero_documento | string | ej. factura, recibo |
| fecha_emision | date | |
| fecha_vencimiento | date | |
| valor | DECIMAL(15,2) | |
| saldo | DECIMAL(15,2) | valor - abonos |
| estado | enum | `PENDIENTE`, `ABONADA`, `CANCELADA`, `VENCIDA` |

### 3.8 `cuentas_por_pagar`
Obligaciones pendientes con proveedores.

Misma estructura que `cuentas_por_cobrar`, estado `PENDIENTE`, `ABONADA`, `CANCELADA`, `VENCIDA`.

### 3.9 `recibos`
Recibos de caja: pagos de clientes contra CxC.

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| numero | string | consecutivo |
| fecha | date | |
| tercero_id | FK → terceros | |
| cxc_id | FK → cuentas_por_cobrar | opcional |
| comprobante_id | FK → comprobantes | asiento generado |
| valor | DECIMAL(15,2) | |
| forma_pago | enum | `EFECTIVO`, `CHEQUE`, `TRANSFERENCIA` |

### 3.10 `pagos`
Comprobantes de egreso: pagos a proveedores contra CxP. Misma estructura que `recibos`.

### 3.11 `productos`
Artículos para inventario básico.

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| codigo | string | único |
| nombre | string | |
| categoria | string | |
| unidad | string | ej. und, kg |
| costo_promedio | DECIMAL(15,2) | método promedio ponderado |
| cantidad_actual | DECIMAL(15,2) | |
| activo | bool | |

### 3.12 `inventario_movimientos`
Entradas y salidas de inventario.

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| producto_id | FK → productos | |
| comprobante_id | FK → comprobantes | |
| tipo | enum | `ENTRADA`, `SALIDA` |
| cantidad | DECIMAL(15,2) | |
| costo_unitario | DECIMAL(15,2) | |
| fecha | date | |

### 3.13 `activos_fijos`
Activos depreciables (propiedad, planta y equipo).

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| cuenta_id | FK → cuentas | cuenta de activo (grupo 15) |
| nombre | string | |
| fecha_adquisicion | date | |
| valor | DECIMAL(15,2) | |
| vida_util_meses | int | |
| depreciacion_acumulada | DECIMAL(15,2) | |
| metodo | enum | `LINEA_RECTA` |

### 3.14 `depreciaciones`
Registro mensual de depreciación por activo.

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| activo_id | FK → activos_fijos | |
| periodo_id | FK → periodos | |
| valor | DECIMAL(15,2) | |

### 3.15 `parametros`
Configuración general (tabla de una sola fila).

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| nombre_empresa | string | |
| nit | string | |
| direccion | string | |
| telefono | string | |
| moneda | string | COP |
| año_fiscal_inicio | int | mes de inicio del año fiscal |
| mensaje_recibo | string | texto en recibos/comprobantes |

> **V2.0:** esta tabla se absorbió en `empresas` (§6.1); la configuración pasó a ser
> datos de cada empresa.

### 3.16 `auditoria`
Bitácora de acciones críticas.

| Campo | Tipo | Notas |
|---|---|---|
| id | PK | |
| usuario_id | FK → usuarios | |
| accion | string | ej. CONTABILIZAR, ANULAR, CERRAR_PERIODO |
| detalle | string | |
| fecha | datetime | |

## 4. Vistas derivadas (se calculan, no se almacenan)

- **Libro diario:** comprobantes contabilizados ordenados por fecha y consecutivo.
- **Libro mayor:** agrupación de asientos por cuenta (débitos, créditos, saldo).
- **Balance de comprobación:** sumas de débitos/créditos y saldos por cuenta.
- **Balance general:** saldos de las clases 1 (activo), 2 (pasivo), 3 (patrimonio).
- **Estado de resultados:** saldos de las clases 4 (ingresos), 5 (gastos), 6 (costo de ventas).

## 5. Cobertura de módulos (Fase 0)

| Módulo V1 | Tablas que lo soportan |
|---|---|
| 1. Usuarios y roles | `usuarios`, `auditoria` |
| 2. Catálogo de cuentas | `cuentas` |
| 3. Terceros | `terceros` |
| 4. Comprobantes | `comprobantes`, `asientos`, `periodos`, `parametros` |
| 5. Libro diario y mayor | derivado de `comprobantes` + `asientos` |
| 6. Balance de comprobación | derivado de `asientos` |
| 7. Estados financieros | derivado de `asientos` + `cuentas` |
| 8. CxC | `cuentas_por_cobrar`, `recibos` |
| 9. CxP | `cuentas_por_pagar`, `pagos` |
| 10. Inventario | `productos`, `inventario_movimientos` |
| 11. Activos fijos / depreciación | `activos_fijos`, `depreciaciones` |
| 12. Reportes y respaldo | derivados + respaldo de la BD |

**Prueba de fuego Fase 0:** el modelo cubre los 12 módulos, respeta la partida doble,
la inmutabilidad de asientos y el PUC de 9 clases con naturaleza deudora/acreedora.

## 6. Multientidad (Fase 1 de V2.0)

Desde V2.0 el modelo es **multientidad por fila**: las tablas de negocio pertenecen a
una `empresa` (cliente del contador) mediante `empresaId`. Nunca hay una BD por
cliente. La fuente de verdad es `backend/prisma/schema.prisma` (los nombres de esta
sección usan la nomenclatura de Prisma).

### 6.1 `Empresa`

| Campo | Tipo | Notas |
|---|---|---|
| id | PK (uuid) | |
| nombre | string | |
| nit | string | |
| direccion / telefono | string? | |
| moneda | string | COP |
| anioFiscalInicio | int | mes de inicio del año fiscal |
| mensajeRecibo | string? | texto en recibos/comprobantes |
| activa | bool | da de baja al cliente |
| createdAt / updatedAt | datetime | |

Absorbió la tabla `parametros` (§3.15).

### 6.2 `UsuarioEmpresa` (acceso y rol por cliente)

| Campo | Tipo | Notas |
|---|---|---|
| id | PK (uuid) | |
| usuarioId | FK → usuarios | |
| empresaId | FK → empresas | |
| rol | enum | `ADMIN`, `CONTADOR`, `AUXILIAR` (rol en esa empresa) |
| activo | bool | |
| createdAt / updatedAt | datetime | |

- `@@unique([usuarioId, empresaId])`.
- Un ADMIN global accede a todas las empresas sin fila; CONTADOR/AUXILIAR solo a las
  asignadas (`activo = true`).
- El rol efectivo en una empresa es el más restrictivo entre el rol global del usuario
  y su rol en `UsuarioEmpresa`.

### 6.3 Scoping por tabla

- `empresaId` **obligatorio** (scoping directo): `Tercero`, `Periodo`, `Comprobante`,
  `Consecutivo`, `CuentaPorCobrar`, `CuentaPorPagar`, `Producto`, `ActivoFijo`,
  `CierreAnual`, `ParametroCuentaNomina`. (`Auditoria` lleva `empresaId` opcional para
  poder filtrar por cliente.)
- `empresaId` **nulo = global, con override por empresa**: `Cuenta` (catálogo PUC base
  compartido), `ParametroNomina`, `ParametroProvision`. Al buscar se prefiere el
  registro de la empresa activa y se cae al global (`empresaId` nulo).
- **Sin `empresaId` propio** (heredado a través de su tabla padre, que ya es directo, o
  global): `Asiento`, `Recibo`, `Pago`, `InventarioMovimiento`, `Depreciacion`,
  `ProvisionCartera`, `Empleado`, `Nomina`, `ProvisionNomina`, `Presupuesto`,
  `ReglaAlerta` (global).

### 6.4 Unicidades compuestas

- `Cuenta`: `[empresaId, codigo]`
- `Tercero`: `[empresaId, tipoDocumento, documento]`
- `Periodo`: `[empresaId, nombre]`
- `Comprobante`: `[empresaId, tipo, consecutivo]`
- `Consecutivo`: `[empresaId, tipo]` (clave primaria compuesta)
- `Producto`: `[empresaId, codigo]`
- `CierreAnual`: `[empresaId, anio]`
- `ParametroNomina`: `[empresaId, anio]`
- `ParametroProvision`: `[empresaId, diasDesde, diasHasta]`
- `ParametroCuentaNomina`: `[empresaId, concepto]`
- `UsuarioEmpresa`: `[usuarioId, empresaId]`

### 6.5 Identificación de la empresa activa

- Frontend: `EmpresaContext` mantiene la empresa activa (persistida en `localStorage`)
  y el cliente HTTP envía el header `X-Empresa-Id` en cada petición.
- Backend: el middleware `requireEmpresa` valida el header y el acceso del usuario
  (§6.2) y puebla `req.empresaId`, `req.empresa` y `req.rolEfectivo`; todo filtrado de
  negocio pasa por `req.empresaId`. Detalle en `docs/arquitectura.md` (§8).

## 7. Procesos contables y seguimiento (Fase 2 de V2.0)

El seguimiento por cliente/año se modela con tres tablas (scoping directo heredado de
`Empresa`). Fuente de verdad: `backend/prisma/schema.prisma`.

### 7.1 `ProcesoContable`

| Campo | Tipo | Notas |
|---|---|---|
| id | PK (uuid) | |
| empresaId | FK → empresas | scoping directo |
| anio | int | año fiscal del proceso |
| estado | enum | `SIN_INICIAR`, `EN_PROCESO`, `PENDIENTE`, `AL_DIA`, `CERRADO` |
| createdAt / updatedAt | datetime | |

- `@@unique([empresaId, anio])` (un solo proceso por cliente y año) y `@@index([empresaId])`.
- Al crearse recibe su plantilla de actividades (§7.2); la integración automática marca
  actividades existentes pero no crea procesos (ver arquitectura §9.4).

### 7.2 `ActividadProceso` (checklist)

| Campo | Tipo | Notas |
|---|---|---|
| id | PK (autoincrement) | |
| procesoId | FK → procesos | `onDelete: Cascade` |
| tipo | enum | `COMPROBANTES`, `CONCILIACION`, `NOMINA`, `PROVISION_CARTERA`, `PRESUPUESTO`, `CIERRE_PERIODO`, `CIERRE_ANIO` |
| orden | int | posición en la plantilla (1..7) |
| estado | bool | completada o no |
| fechaEsperada / fechaReal | date? | |

Plantilla por defecto (en código, `backend/src/lib/procesos.ts`): comprobantes,
conciliación, nómina, provisión de cartera, presupuesto, cierre de periodo y cierre de
año.

### 7.3 `NotaSeguimiento`

| Campo | Tipo | Notas |
|---|---|---|
| id | PK (uuid) | |
| procesoId | FK → procesos | `onDelete: Cascade` |
| usuarioId | FK → usuarios | autor de la nota |
| texto | string | |
| createdAt | datetime | |

Las notas quedan ligadas al proceso y a su autor, y se incluyen en el respaldo como
parte de la base de datos.

## 8. Conciliación, adjuntos y exportación (Fase 4 de V2.0)

Fuente de verdad: `backend/prisma/schema.prisma`.

### 8.1 `Conciliacion`

| Campo | Tipo | Notas |
|---|---|---|
| id | PK (autoincrement) | |
| empresaId | FK → empresas | scoping directo |
| periodoId | FK → periodos | periodo que se concilia |
| cuentaId | FK → cuentas | cuenta de bancos (1110) |
| saldoLibros | DECIMAL(15,2) | acumulado de asientos de la cuenta hasta `periodo.fechaFin` |
| saldoExtracto | DECIMAL(15,2)? | saldo final del extracto importado |
| diferencia | DECIMAL(15,2)? | `saldoExtracto - saldoLibros` |
| estado | enum | `EN_PROCESO`, `APROBADA`, `ANULADA` |
| aprobadaPor / aprobadaEn | FK → usuarios / datetime? | quién y cuándo aprobó |
| createdAt / updatedAt | datetime | |

- `@@unique([empresaId, periodoId, cuentaId])` (una conciliación por cliente, periodo y
  cuenta de banco) y `@@index([empresaId])`.
- La actividad `CONCILIACION` del proceso se marca al aprobar (arquitectura §9.4).

### 8.2 `MovimientoExtracto`

| Campo | Tipo | Notas |
|---|---|---|
| id | PK (autoincrement) | |
| conciliacionId | FK → conciliaciones | |
| fecha | date | |
| referencia | string | |
| descripcion | string | |
| debito / credito | DECIMAL(15,2) | |
| saldo | DECIMAL(15,2) | saldo acumulado de la fila del extracto |
| hashMovimiento | string | hash determinístico (fecha, referencia, débito, crédito, saldo) |
| conciliado | bool | cruce con un asiento |
| asientoId | FK → asientos? | asiento que cruza la partida (opcional) |
| createdAt | datetime | |

- `@@unique([conciliacionId, hashMovimiento])`: la reimportación del mismo extracto no
  duplica movimientos (idempotencia).

### 8.3 `Adjunto`

| Campo | Tipo | Notas |
|---|---|---|
| id | PK (autoincrement) | |
| empresaId | FK → empresas | scoping directo |
| entidad | enum | `COMPROBANTE`, `EMPRESA` |
| entidadId | string | id de la entidad (comprobante o empresa) |
| nombreOriginal | string | nombre visible del archivo |
| nombreArchivo | string | nombre seguro aleatorio en disco |
| mimeType | string | |
| tamanoBytes | int | límite 15 MB |
| hash | string | SHA-256 del contenido |
| usuarioId | FK → usuarios | quién lo subió |
| createdAt | datetime | |

- `@@index([empresaId, entidad, entidadId])`.
- El **contenido** vive en `backend/adjuntos/` (o `ADJUNTOS_DIR`); el respaldo empaqueta
  esa carpeta en un ZIP junto al `.dump` y la restauración la extrae de vuelta
  (ver `docs/respaldo.md`).

### 8.4 Exportación de informes

No hay tablas nuevas: CSV, XLSX y ZIP se generan en memoria a partir de las consultas
existentes (`exportacion.controller.ts` + `libros-pdf.controller.ts`). El paquete ZIP
usa el módulo sin dependencias `backend/scripts/zip-lite.mjs` (método STORE).
