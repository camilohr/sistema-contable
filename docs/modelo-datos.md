# Modelo de Datos

## 1. Convenciones

- Identificadores: `id` UUID (o serial) como llave primaria.
- Todas las tablas incluyen `createdAt` y `updatedAt`.
- Los importes se almacenan como `DECIMAL(15,2)` (nunca `float`) para evitar errores
  de redondeo en contabilidad.
- `Boolean` para estados/banderas; `enum` para tipos fijos.

## 2. Diagrama de entidades

```
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

parametros (tabla singleton de configuración)
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
