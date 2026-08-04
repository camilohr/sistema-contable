# Diseño — Módulo 9: Nómina simplificada

> Documento de diseño de la fase previa a la implementación (recomendación 4).
> Complementa `docs/roadmap-v1.1.md` (módulo 9), `docs/modelo-datos.md` y
> `docs/normatividad.md`. Las decisiones de alcance marcadas como **[decisión]**
> deben confirmarse antes de construir.

## 1. Objetivo y alcance

Liquidar la nómina mensual (devengados, deducciones y aportes), provisionar las
prestaciones sociales de forma mensual y generar los asientos contables
correspondientes, con partida doble y periodos abiertos. **No** se conecta con
PILA, DIAN, seguridad social ni nómina electrónica: solo calcula y contabiliza,
dejando la información lista para que el contador la radique externamente.

Perfil objetivo: empleadores micro/pequeños (1–9 trabajadores es lo habitual en
el cliente del contador particular), que ya están exentos de SENA e ICBF.

### Decisiones de alcance V1 [decisión]

| Tema | Propuesta V1 | Alternativa descartada |
|---|---|---|
| Conceptos devengados | Sueldo por días trabajados, horas extras y recargos (valor manual), comisiones, bonificaciones, auxilio de transporte automático | Cálculo de horas extras por tipo de recargo (25/75/100/150 %) — se difiere a V1.1 para no fijar reglas incorrectas |
| Deducciones | Salud 4 %, pensión 4 %, fondo de solidaridad (automático si IBC > 4 SMMLV), libranzas/embargos/retefuente como valores manuales | Tabla de retención en la fuente por UVT — se difiere a V1.1 |
| Aportes empleador | Salud 8,5 %, pensión 12 %, ARL por empleado, parafiscales (caja 4 %, SENA 2 % e ICBF 3 % según umbral de empleados) | — |
| Prestaciones | Provisión mensual: cesantías 8,33 %, intereses 1 %, prima 8,33 %, vacaciones 4,17 % | Liquidación definitiva de cesantías al retiro — se difiere |
| Nómina electrónica / PILA | Fuera de alcance (solo cálculo + asiento) | — |

## 2. Base legal

- **Código Sustantivo del Trabajo:** salario, auxilio de transporte, horas
  extras y recargos (arts. 168–180), cesantías (art. 249), prima (art. 306),
  vacaciones (art. 186) e intereses a las cesantías (Ley 52/1990).
- **Auxilio de transporte:** para quienes devengan hasta 2 SMMLV; no constituye
  salario pero es base de cesantías y prima.
- **Seguridad social:** salud y pensión (Ley 100/1993 y sus reformas), ARL
  (Decreto 1295/1994), parafiscales — SENA/ICBF exentos para empleadores con
  menos de 10 trabajadores (Ley 1607/2012).
- **Fondo de solidaridad pensional:** aporte adicional del empleado cuando el
  IBC supera 4 SMMLV (Ley 100/1993).
- **Decreto 2649/1993:** gastos de personal reconocidos por causación.

## 3. Parámetros (editable por año)

Todo valor normativo vive en `ParametroNomina`, parametrizado por `anio`, para
que el cambio anual (SMMLV, auxilio de transporte, topes) no requiera código.
Valores por defecto 2026 (fuente: Decretos 1469 y 1470 de 2025):

| Parámetro | 2026 |
|---|---|
| `smmlv` | 1.750.905,00 |
| `auxilioTransporte` | 249.095,00 |
| `topeAuxilioTransporteSalarios` (devenga ≤ 2 SMMLV) | 2,00 |
| `topeIbcSalarios` (IBC máximo) | 25,00 |
| `saludEmpleado` | 4,00 % |
| `pensionEmpleado` | 4,00 % |
| `saludEmpleador` | 8,50 % |
| `pensionEmpleador` | 12,00 % |
| `arlEmpleador` (riesgo I, por defecto) | 0,522 % |
| `cajaCompensacion` | 4,00 % |
| `icbf` | 3,00 % |
| `sena` | 2,00 % |
| `umbralParafiscales` (empleados para aplicar SENA/ICBF) | 10 |
| `solidaridadUmbralSalarios` (IBC > n SMMLV) | 4,00 |
| `cesantias` | 8,33 % |
| `interesesCesantias` (anual; 1 % mensual) | 12,00 % |
| `prima` | 8,33 % |
| `vacaciones` | 4,17 % |

La cuenta PUC de cada concepto se parametriza en `ParametroCuentaNomina`
(concepto → `cuentaId`), con los valores por defecto del apartado 6.

## 4. Modelo de datos (Prisma)

```prisma
model Empleado {
  id              String   @id @default(uuid())
  terceroId       String   @unique      // tercero de tipo documento CC
  cargo           String?
  salarioBase     Decimal  @db.Decimal(15, 2)
  fechaIngreso    DateTime @db.Date
  fechaRetiro     DateTime? @db.Date
  ibcAjuste       Decimal  @default(0) @db.Decimal(15, 2) // comisiones/otros que suman al IBC fuera de sueldo
  arlEmpleador    Decimal  @default(0.522) @db.Decimal(5, 2) // % según clase de riesgo
  auxilioTransporteManual Boolean @default(false) // forzar sí/no (por defecto: automático por salario)
  activo          Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tercero        Tercero        @relation(fields: [terceroId], references: [id])
  liquidaciones  Nomina[]
  provisiones    ProvisionNomina[]

  @@index([activo])
}

model Nomina {
  id               Int            @id @default(autoincrement())
  empleadoId       String
  periodoId        Int
  diasTrabajados   Int            @default(30)
  sueldo           Decimal        @default(0) @db.Decimal(15, 2)
  horasExtras      Decimal        @default(0) @db.Decimal(15, 2) // valor manual
  comisiones       Decimal        @default(0) @db.Decimal(15, 2)
  bonificaciones   Decimal        @default(0) @db.Decimal(15, 2)
  auxilioTransporte Decimal       @default(0) @db.Decimal(15, 2)
  otrosDevengados  Decimal        @default(0) @db.Decimal(15, 2)
  saludEmpleado    Decimal        @default(0) @db.Decimal(15, 2)
  pensionEmpleado  Decimal        @default(0) @db.Decimal(15, 2)
  solidaridad      Decimal        @default(0) @db.Decimal(15, 2)
  retefuente       Decimal        @default(0) @db.Decimal(15, 2) // manual
  libranzas        Decimal        @default(0) @db.Decimal(15, 2) // manual
  embargos         Decimal        @default(0) @db.Decimal(15, 2) // manual
  otrosDescuentos  Decimal        @default(0) @db.Decimal(15, 2)
  totalDevengado   Decimal        @db.Decimal(15, 2)
  totalDeducciones Decimal        @db.Decimal(15, 2)
  netoPagar        Decimal        @db.Decimal(15, 2)
  ibc              Decimal        @db.Decimal(15, 2)
  estado           EstadoNomina   @default(BORRADOR)
  comprobanteId    Int?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  empleado    Empleado     @relation(fields: [empleadoId], references: [id])
  periodo     Periodo      @relation(fields: [periodoId], references: [id])
  comprobante Comprobante? @relation(fields: [comprobanteId], references: [id])

  @@unique([empleadoId, periodoId])
  @@index([periodoId, estado])
}

model ProvisionNomina {
  id          Int      @id @default(autoincrement())
  empleadoId  String
  periodoId   Int
  baseCesantias Decimal @db.Decimal(15, 2) // sueldo + auxilio de transporte
  cesantias   Decimal  @db.Decimal(15, 2)
  interesesCesantias Decimal @db.Decimal(15, 2)
  prima       Decimal  @db.Decimal(15, 2)
  baseVacaciones Decimal @db.Decimal(15, 2) // sueldo, sin auxilio de transporte
  vacaciones  Decimal  @db.Decimal(15, 2)
  total       Decimal  @db.Decimal(15, 2)
  comprobanteId Int?
  createdAt   DateTime @default(now())

  empleado    Empleado     @relation(fields: [empleadoId], references: [id])
  periodo     Periodo      @relation(fields: [periodoId], references: [id])
  comprobante Comprobante? @relation(fields: [comprobanteId], references: [id])

  @@unique([empleadoId, periodoId])
}

enum EstadoNomina {
  BORRADOR
  CONTABILIZADO
  ANULADO
}

model ParametroNomina {
  id     Int  @id @default(autoincrement())
  anio   Int  @unique
  smmlv  Decimal @db.Decimal(15, 2)
  auxilioTransporte Decimal @db.Decimal(15, 2)
  topeAuxilioTransporteSalarios Decimal @db.Decimal(5, 2)
  topeIbcSalarios Decimal @db.Decimal(5, 2)
  saludEmpleado  Decimal @db.Decimal(5, 2)
  pensionEmpleado Decimal @db.Decimal(5, 2)
  saludEmpleador Decimal @db.Decimal(5, 2)
  pensionEmpleador Decimal @db.Decimal(5, 2)
  arlEmpleador   Decimal @db.Decimal(5, 2)
  cajaCompensacion Decimal @db.Decimal(5, 2)
  icbf           Decimal @db.Decimal(5, 2)
  sena           Decimal @db.Decimal(5, 2)
  umbralParafiscales Int
  solidaridadUmbralSalarios Decimal @db.Decimal(5, 2)
  cesantias      Decimal @db.Decimal(5, 2)
  interesesCesantias Decimal @db.Decimal(5, 2)
  prima          Decimal @db.Decimal(5, 2)
  vacaciones     Decimal @db.Decimal(5, 2)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model ParametroCuentaNomina {
  id       Int     @id @default(autoincrement())
  concepto String  @unique // SUELDO, HORAS_EXTRAS, COMISIONES, BONIFICACIONES,
                          // AUXILIO_TRANSPORTE, SALUD, PENSION, ARL, CAJA,
                          // ICBF, SENA, CESANTIAS, INTERESES_CESANTIAS, PRIMA,
                          // VACACIONES, RETEFUENTE, SOLIDARIDAD, NETO_POR_PAGAR
  cuentaId Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  cuenta Cuenta @relation(fields: [cuentaId], references: [id])

  @@index([cuentaId])
}
```

La provisión de prestaciones no reutiliza `Asiento` individualmente: cada
concepto se agrega por periodo y se genera un único comprobante DIARIO por
concepto o consolidado (ver apartado 7).

## 5. Reglas de negocio y fórmulas

Cálculo por empleado, con redondeo a 2 decimales en cada concepto:

1. `sueldo = salarioBase * diasTrabajados / 30`.
2. `devengado = sueldo + horasExtras + comisiones + bonificaciones + otrosDevengados`.
3. `IBC = min(sueldo + horasExtras + comisiones + bonificaciones + ibcAjuste, topeIbcSalarios * smmlv)`.
   Nota: el auxilio de transporte **no** es base de cotización ni salarial.
4. `auxilioTransporte`: si `(salarioBase * 12) / 12 <= topeAuxilioTransporteSalarios * smmlv`
   (o `auxilioTransporteManual`), se liquida `auxilioTransporte`; si `diasTrabajados < 30`
   se prorratea `auxilio * diasTrabajados / 30`.
5. `saludEmpleado = IBC * saludEmpleado%`, `pensionEmpleado = IBC * pensionEmpleado%`.
6. `solidaridad`: si `IBC > solidaridadUmbralSalarios * smmlv` (y no es exento por
   tope superior), se aplica la escala de la Ley 100/1993 (1,0–2,0 % según rangos
   de IBC en SMMLV). [decisión] V1: aplicar siempre el tramo inferior 1 %.
7. `deducciones = saludEmpleado + pensionEmpleado + solidaridad + retefuente + libranzas + embargos + otrosDescuentos`.
8. `totalDevengado = devengado + auxilioTransporte`; `netoPagar = totalDevengado - deducciones`.
9. Aportes empleador (sobre `IBC`): `salud = IBC * 8,5%`, `pensión = IBC * 12%`,
   `ARL = IBC * arlEmpleador%`, `caja = IBC * 4%`; `SENA = IBC * 2%` e
   `ICBF = IBC * 3%` solo si el empleador tiene `>= umbralParafiscales` empleados
   activos en el periodo.
10. Prestaciones (base = `sueldo + auxilioTransporte` salvo vacaciones = `sueldo`):
    - `cesantias = baseCesantias / 12`
    - `interesesCesantias = cesantias * interesesCesantias% / 12` (1 % mensual)
    - `prima = baseCesantias / 12`
    - `vacaciones = baseVacaciones / 24`

Validaciones:
- No se liquidan dos veces el mismo empleado+periodo (`@@unique([empleadoId, periodoId])`).
- Solo se contabiliza con periodo abierto (misma regla que comprobantes).
- Anular el comprobante de nómina deja las `Nomina` en `ANULADO` y permite reliquidar.
- No se provisionan prestaciones sin nómina contabilizada del periodo.

### Ejemplo numérico (SMMLV 2026, sin horas extras, < 10 empleados)

Empleado con `salarioBase = 1.750.905`, 30 días, sin descuentos manuales:

| Concepto | Cálculo | Valor |
|---|---|---|
| Sueldo | 1.750.905 | 1.750.905 |
| Auxilio de transporte | 249.095 (≤ 2 SMMLV) | 249.095 |
| Total devengado | 1.750.905 + 249.095 | 2.000.000 |
| Salud empleado | 1.750.905 × 4 % | 70.036,20 |
| Pensión empleado | 1.750.905 × 4 % | 70.036,20 |
| Neto a pagar | 2.000.000 − 140.072,40 | 1.859.927,60 |
| Salud empleador | 1.750.905 × 8,5 % | 148.826,93 |
| Pensión empleador | 1.750.905 × 12 % | 210.108,60 |
| ARL (0,522 %) | 1.750.905 × 0,522 % | 9.139,72 |
| Caja 4 % | 1.750.905 × 4 % | 70.036,20 |
| Cesantías | 2.000.000 / 12 | 166.666,67 |
| Intereses cesantías | 166.666,67 × 12 % / 12 | 1.666,67 |
| Prima | 2.000.000 / 12 | 166.666,67 |
| Vacaciones | 1.750.905 / 24 | 72.954,38 |

## 6. Mapeo de cuentas PUC (por defecto)

Se usan cuentas ya existentes en el seed PUC (no requiere migración del catálogo).
Parametrizable en `ParametroCuentaNomina`.

| Concepto | Gasto (débito) | Pasivo (crédito) |
|---|---|---|
| Sueldo | 510505 Sueldos | — |
| Horas extras y recargos | 510510 Horas extras y recargos | — |
| Comisiones | 510515 Comisiones | — |
| Bonificaciones | 510575 Bonificaciones | — |
| Auxilio de transporte | 510590 Otros gastos de personal * | — |
| Salud (empleado + empleador) | 510555 Aportes a EPS | 237005 Aportes a EPS |
| Pensión (empleado + empleador) | 510565 Pensiones de jubilación | 237055 Retenciones para fondos de pensiones |
| ARL | 510560 Aportes a ARP | 237010 Aportes a ARP |
| Caja de compensación | 510540 Aportes a cajas | 237025 Aportes cajas de compensación |
| ICBF | 510545 Aportes al ICBF | 237015 Aportes al ICBF |
| SENA | 510550 Aportes SENA | 237020 Aportes SENA |
| Fondo de solidaridad pensional | — | 237030 Fondo de solidaridad y garantías |
| Retefuente (salarios) | — | 236580 Otras retenciones aplicables |
| Libranzas / embargos | — | 237035 Libranzas / 237040 Embargos |
| Neto por pagar | — | 238035 Costos y gastos de personal |
| Cesantías | 510535 Prestaciones sociales | 251005 Cesantías consolidadas |
| Intereses sobre cesantías | 510535 Prestaciones sociales | 251010 Intereses sobre cesantías |
| Prima | 510535 Prestaciones sociales | 252005 Prima de servicios |
| Vacaciones | 510535 Prestaciones sociales | 252505 Vacaciones consolidadas |

\* No existe una subcuenta dedicada de "Auxilio de transporte" en el seed; el
contador puede crear una (p. ej. `510595`) o reutilizar `510590`.

## 7. Asientos contables

### 7.1 Nómina (un comprobante DIARIO por periodo, agrega todos los empleados)

Con el ejemplo del apartado 5 (un empleado, sin parafiscales SENA/ICBF):

| Cuenta | Débito | Crédito |
|---|---|---|
| 510505 Sueldos | 1.750.905 | |
| 510590 Auxilio de transporte | 249.095 | |
| 510555 Salud | 148.826,93 | |
| 510565 Pensión | 210.108,60 | |
| 510560 ARL | 9.139,72 | |
| 510540 Caja | 70.036,20 | |
| 238035 Neto por pagar | | 1.859.927,60 |
| 237005 Salud | | 218.863,13 |
| 237055 Pensión | | 280.144,80 |
| 237010 ARL | | 9.139,72 |
| 237025 Caja | | 70.036,20 |
| **Total** | **2.438.111,45** | **2.438.111,45** |

Se contabiliza con el helper `crearComprobanteDiario` de `lib/comprobantes.ts`
(partida doble + consecutivo) y se registra en la bitácora de auditoría.

### 7.2 Provisión de prestaciones (un comprobante DIARIO por periodo)

| Cuenta | Débito | Crédito |
|---|---|---|
| 510535 Prestaciones sociales (cesantías) | 166.666,67 | |
| 510535 Prestaciones sociales (intereses) | 1.666,67 | |
| 510535 Prestaciones sociales (prima) | 166.666,67 | |
| 510535 Prestaciones sociales (vacaciones) | 72.954,38 | |
| 251005 Cesantías consolidadas | | 166.666,67 |
| 251010 Intereses sobre cesantías | | 1.666,67 |
| 252005 Prima de servicios | | 166.666,67 |
| 252505 Vacaciones consolidadas | | 72.954,38 |
| **Total** | **407.954,39** | **407.954,39** |

## 8. Endpoints

### `/api/empleados`
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/` | todos | listar empleados activos/inactivos |
| POST | `/` | ADMIN, CONTADOR | crear empleado sobre un tercero CC |
| PATCH | `/:id` | ADMIN, CONTADOR | editar datos no contables |
| POST | `/:id/retiro` | ADMIN, CONTADOR | marcar retiro (fecha) |
| GET | `/:id/liquidaciones` | todos | historial de nómina del empleado |

### `/api/nomina`
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/parametros` | todos | parámetros del año vigente |
| PUT | `/parametros` | ADMIN, CONTADOR | editar parámetros |
| GET | `/parametros-cuentas` | todos | mapeo de cuentas |
| PUT | `/parametros-cuentas` | ADMIN, CONTADOR | editar mapeo de cuentas |
| POST | `/liquidar/:periodoId` | ADMIN, CONTADOR | calcula las liquidaciones del periodo (BORRADOR) |
| GET | `/:periodoId` | todos | liquidación del periodo por empleado + totales |
| POST | `/:periodoId/contabilizar` | ADMIN, CONTADOR | genera el comprobante de nómina |
| POST | `/:periodoId/provisionar` | ADMIN, CONTADOR | genera el comprobante de prestaciones |

## 9. Frontend

- Página **Nómina**: selector de periodo, tabla por empleado (devengados,
  deducciones, neto), acciones "liquidar", "contabilizar" y "provisionar".
- Página **Empleados**: alta/edición ligando un tercero, salario, cargo,
  fecha de ingreso, clase de riesgo ARL.
- Página **Parámetros de nómina**: edición por año (SMMLV, auxilio, topes,
  porcentajes) y mapeo de cuentas.
- Accesible según rol (escritura ADMIN/CONTADOR; AUXILIAR solo lectura).

## 10. Tests sugeridos (`backend/tests/nomina.test.ts`)

- Cálculo de devengados, IBC y neto con el ejemplo del apartado 5 (valores exactos).
- Auxilio de transporte automático (≤ 2 SMMLV) y prorrateo por días.
- Fondo de solidaridad al superar 4 SMMLV.
- Parafiscales SENA/ICBF solo con `>= 10` empleados activos.
- Asiento de nómina y de provisión balanceados (débitos = créditos).
- Doble liquidación del mismo empleado+periodo rechazada.
- Bloqueo en periodo cerrado.
- Anulación del comprobante y reliquidación.
- Control de roles: AUXILIAR no puede liquidar, contabilizar ni provisionar.

## 11. Fuera de alcance (notas)

- Cálculo de horas extras por tipos de recargo y tabla de retención por UVT:
  se difieren a V1.1 (en V1 se ingresan como valores manuales).
- Liquidación definitiva de cesantías/retiro con sanción.
- Radicación en PILA y nómina electrónica (el sistema solo deja el cálculo y el
  asiento para trasladarlos sin reprocesos).
- Embargos y libranzas se ingresan manualmente (sin integración bancaria).
