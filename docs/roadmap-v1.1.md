# Roadmap V1.1 — Funcionalidades adicionales

Este documento complementa `docs/normatividad.md` y `docs/modelo-datos.md`. Reúne las
funcionalidades propuestas para la siguiente iteración del sistema, todas sin
dependencia de terceros (DIAN, bancos, pasarelas de pago, APIs externas): se apoyan
únicamente en datos que el sistema ya captura o en cálculos internos.

Está escrito para trabajarse con opencode: cada módulo trae modelos Prisma sugeridos,
reglas de negocio, endpoints y base normativa, siguiendo las convenciones ya usadas en
el proyecto (Zod para validación, `requireAuth` + `requireRole`, controladores en
`backend/src/controllers`, decimales `Decimal(15,2)`, asientos inmutables).

Nota importante: dos de estos módulos (**Activos fijos** y **Auditoría**) ya estaban
documentados en `docs/modelo-datos.md` (tablas `activos_fijos`, `depreciaciones`,
`auditoria`) pero nunca se implementaron en `schema.prisma`. Se marcan como
`[GAP EXISTENTE]` porque no son funcionalidad nueva, sino diseño pendiente de construir.

## Orden de prioridad sugerido

1. Activos fijos y depreciación `[GAP EXISTENTE]` `[COMPLETADO 2026-08-04]`
2. Bitácora de auditoría `[GAP EXISTENTE]` `[COMPLETADO 2026-08-04]`
3. Cierre de ejercicio anual `[COMPLETADO 2026-08-04]`
4. Provisión de cartera (deterioro) `[COMPLETADO 2026-08-04]`
5. Indicadores financieros y análisis comparativo
6. Exportación de libros oficiales a PDF
7. Presupuesto y control presupuestal
8. Alertas y recordatorios internos
9. Nómina simplificada (solo cálculo, sin PILA)

---

## 1. Activos fijos y depreciación `[GAP EXISTENTE]`

**Qué hace:** registra propiedad, planta y equipo, calcula la depreciación mensual en
línea recta y genera el asiento contable correspondiente al cerrar cada periodo. También
soporta la baja o venta del activo con su asiento de retiro.

**Base legal:** Decreto 2649/1993 (reconocimiento del gasto por depreciación) y Decreto
2706/2012 — NIIF para microempresas (marco técnico ya adoptado por el sistema).

### Modelo Prisma

```prisma
enum MetodoDepreciacion {
  LINEA_RECTA
}

enum EstadoActivoFijo {
  ACTIVO
  DEPRECIADO_TOTAL
  DADO_DE_BAJA
}

model ActivoFijo {
  id                    Int                @id @default(autoincrement())
  cuentaId              Int                // cuenta de activo, grupo 15
  cuentaDepreciacionId  Int                // cuenta 1592 (depreciación acumulada)
  cuentaGastoId         Int                // cuenta 5160/5260 (gasto depreciación)
  nombre                String
  fechaAdquisicion      DateTime           @db.Date
  valor                 Decimal            @db.Decimal(15, 2)
  vidaUtilMeses         Int
  valorResidual         Decimal            @default(0) @db.Decimal(15, 2)
  metodo                MetodoDepreciacion @default(LINEA_RECTA)
  depreciacionAcumulada Decimal            @default(0) @db.Decimal(15, 2)
  estado                EstadoActivoFijo   @default(ACTIVO)
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  cuenta             Cuenta          @relation("ActivoCuenta", fields: [cuentaId], references: [id])
  cuentaDepreciacion Cuenta          @relation("ActivoCuentaDepreciacion", fields: [cuentaDepreciacionId], references: [id])
  cuentaGasto        Cuenta          @relation("ActivoCuentaGasto", fields: [cuentaGastoId], references: [id])
  depreciaciones     Depreciacion[]

  @@index([estado])
}

model Depreciacion {
  id            Int      @id @default(autoincrement())
  activoId      Int
  periodoId     Int
  comprobanteId Int?
  valor         Decimal  @db.Decimal(15, 2)
  createdAt     DateTime @default(now())

  activo      ActivoFijo  @relation(fields: [activoId], references: [id])
  periodo     Periodo     @relation(fields: [periodoId], references: [id])
  comprobante Comprobante? @relation(fields: [comprobanteId], references: [id])

  @@unique([activoId, periodoId])
}
```

### Reglas de negocio

- Cuota mensual = `(valor - valorResidual) / vidaUtilMeses`, redondeada a 2 decimales.
- No se puede generar depreciación dos veces para el mismo activo en el mismo periodo
  (constraint `@@unique([activoId, periodoId])`).
- Al alcanzar `depreciacionAcumulada >= valor - valorResidual`, el activo pasa a estado
  `DEPRECIADO_TOTAL` y se excluye del cálculo mensual siguiente.
- El asiento generado: débito a la cuenta de gasto (`cuentaGastoId`), crédito a la
  cuenta de depreciación acumulada (`cuentaDepreciacionId`) — mismo patrón de
  comprobante/asiento que ya usa `comprobantes.controller.ts`.
- Dar de baja un activo genera un asiento adicional dando salida al costo y a la
  depreciación acumulada; requiere periodo abierto, igual que cualquier comprobante.

### Endpoints (`/api/activos-fijos`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/` | todos | listar activos con filtro por estado |
| POST | `/` | ADMIN, CONTADOR | crear activo |
| PATCH | `/:id` | ADMIN, CONTADOR | editar datos no contables (nombre, etc.) |
| POST | `/:id/baja` | ADMIN, CONTADOR | dar de baja, genera asiento |
| POST | `/depreciar/:periodoId` | ADMIN, CONTADOR | calcula y contabiliza la depreciación del periodo para todos los activos vigentes |
| GET | `/:id/depreciaciones` | todos | historial de depreciación de un activo |

### Tests sugeridos (`backend/tests/activos-fijos.test.ts`)

- Cálculo correcto de cuota mensual y acumulada.
- No permite depreciar dos veces el mismo periodo.
- Genera asiento balanceado (débito = crédito).
- Bloquea depreciación en periodo cerrado.
- Control de roles: AUXILIAR no puede crear ni depreciar.

---

## 2. Bitácora de auditoría `[GAP EXISTENTE]`

**Qué hace:** deja registro inmutable de acciones críticas del sistema (quién, qué,
cuándo), extendiendo a nivel de sistema la inmutabilidad que ya aplica a los asientos
contabilizados.

**Base legal:** Código de Comercio — principio de no alteración/conservación de los
libros de comercio, aplicado aquí al respaldo de todo el sistema, no solo a los
asientos.

### Modelo Prisma

```prisma
model Auditoria {
  id        Int      @id @default(autoincrement())
  usuarioId String
  accion    String   // p. ej. CONTABILIZAR, ANULAR, CERRAR_PERIODO, CREAR_USUARIO
  entidad   String   // p. ej. Comprobante, Usuario, Periodo
  entidadId String
  detalle   Json?
  fecha     DateTime @default(now())

  usuario Usuario @relation(fields: [usuarioId], references: [id])

  @@index([entidad, entidadId])
  @@index([fecha])
}
```

### Implementación

- Un helper `registrarAuditoria(usuarioId, accion, entidad, entidadId, detalle)` en
  `backend/src/lib/auditoria.ts`, invocado desde los controladores existentes en los
  puntos críticos: contabilizar/anular comprobante, cerrar/reabrir periodo, crear/
  desactivar usuario, editar cuenta.
- Nunca se expone un endpoint de borrado o edición sobre `Auditoria` — solo lectura.
- No usa transacciones separadas: se escribe dentro de la misma operación Prisma que
  genera el cambio, para que quede o no quede junto con el cambio principal.

### Endpoints (`/api/auditoria`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/` | ADMIN | listar con filtros por usuario, entidad, rango de fechas |

---

## 3. Cierre de ejercicio anual

**Qué hace:** al finalizar el año fiscal, traslada los saldos de las cuentas de
resultado (clases 4, 5, 6, 7) a una cuenta puente de "resultado del ejercicio" y de ahí
a utilidades acumuladas en el patrimonio (clase 3), dejando esas cuentas en cero para
el año siguiente. Distinto del cierre de *periodo* mensual que ya existe.

**Base legal:** Decreto 2649/1993 art. 9 (definición de periodo contable) y Código de
Comercio (los libros deben reflejar el resultado del ejercicio anual).

### Modelo Prisma

Se apoya en los modelos existentes; no requiere tablas nuevas, salvo un flag para
marcar el cierre anual como distinto del cierre de periodo mensual:

```prisma
model CierreAnual {
  id                Int      @id @default(autoincrement())
  anio              Int      @unique
  comprobanteId     Int
  cuentaUtilidadId  Int      // cuenta 3605/3705, utilidades del ejercicio
  usuarioId         String
  fecha             DateTime @default(now())

  comprobante    Comprobante @relation(fields: [comprobanteId], references: [id])
  cuentaUtilidad Cuenta      @relation(fields: [cuentaUtilidadId], references: [id])
  usuario        Usuario     @relation(fields: [usuarioId], references: [id])
}
```

### Reglas de negocio

- Solo se puede cerrar un año si **todos** sus periodos (`Periodo`) están `CERRADO`.
- No se puede cerrar dos veces el mismo año (`@@unique([anio])`).
- El asiento de cierre: por cada cuenta de clase 4 con saldo acreedor, débito por ese
  saldo; por cada cuenta de clase 5/6/7 con saldo deudor, crédito por ese saldo; el neto
  va a la cuenta de utilidades del ejercicio en patrimonio. Débitos = créditos, como
  cualquier comprobante.
- Tras el cierre, un nuevo comprobante en clases 4-7 dentro del año cerrado debe
  rechazarse (mismo mecanismo que ya bloquea comprobantes en periodo cerrado).
- Se registra en la bitácora de auditoría (módulo 2).

### Endpoints (`/api/cierre-anual`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/:anio` | ADMIN | ejecuta el cierre, genera el asiento |
| GET | `/:anio` | todos | consulta el cierre ya realizado |

---

## 4. Provisión de cartera (deterioro)

**Qué hace:** calcula automáticamente la provisión de cuentas por cobrar según
antigüedad de saldos (30/60/90+ días, parametrizable) y genera el asiento de
provisión. Usa datos que `CuentaPorCobrar` ya tiene.

**Base legal:** reconocimiento de deterioro de activos financieros bajo NIIF para
microempresas (Decreto 2706/2012).

### Modelo Prisma

```prisma
model ParametroProvision {
  id          Int     @id @default(autoincrement())
  diasDesde   Int     // ej. 90
  diasHasta   Int?    // null = sin límite superior
  porcentaje  Decimal @db.Decimal(5, 2) // ej. 20.00 = 20%
}

model ProvisionCartera {
  id            Int      @id @default(autoincrement())
  periodoId     Int
  comprobanteId Int?
  totalCalculado Decimal @db.Decimal(15, 2)
  fecha         DateTime @default(now())

  periodo     Periodo      @relation(fields: [periodoId], references: [id])
  comprobante Comprobante? @relation(fields: [comprobanteId], references: [id])

  @@unique([periodoId])
}
```

### Reglas de negocio

- Para cada `CuentaPorCobrar` con `estado` en `PENDIENTE`/`VENCIDA`, calcular días de
  mora respecto a `fechaVencimiento` y aplicar el `porcentaje` del rango
  correspondiente en `ParametroProvision` sobre el `saldo`.
- Genera un único asiento por periodo: débito a gasto de provisión (5199), crédito a
  cuenta de provisión de cartera (1399), por el valor incremental respecto a la
  provisión ya contabilizada (no se duplica).
- Solo se puede calcular una vez por periodo (`@@unique([periodoId])`); recalcular
  exige anular y regenerar, igual que un comprobante normal.

### Endpoints (`/api/cartera/provision`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/parametros` | todos | consultar rangos configurados |
| PUT | `/parametros` | ADMIN | editar rangos y porcentajes |
| POST | `/calcular/:periodoId` | ADMIN, CONTADOR | calcula y contabiliza |
| GET | `/:periodoId` | todos | consulta la provisión de un periodo |

---

## 5. Indicadores financieros y análisis comparativo

**Qué hace:** calcula razones financieras (liquidez, endeudamiento, rentabilidad,
rotación) y comparación horizontal/vertical entre periodos, todo derivado del balance
general y estado de resultados que ya produce `reportes.controller.ts`.

**Base legal:** no es obligación normativa puntual; es parte de la revelación plena de
información financiera que persigue la Ley 1314/2009 — información útil para la toma
de decisiones del cliente.

### Sin modelos nuevos

Es 100% cálculo sobre datos existentes (`asientos` agregados por cuenta/clase). Se
implementa como funciones puras en `backend/src/lib/indicadores.ts`, reutilizando la
misma agregación que ya usa `reportes.controller.ts` para balance general y estado de
resultados.

### Indicadores sugeridos

| Indicador | Fórmula |
|---|---|
| Razón corriente | Activo corriente / Pasivo corriente |
| Prueba ácida | (Activo corriente − Inventario) / Pasivo corriente |
| Endeudamiento | Pasivo total / Activo total |
| Margen neto | Utilidad neta / Ingresos |
| Rotación de cartera | Ventas a crédito / Cartera promedio |
| Rotación de inventario | Costo de ventas / Inventario promedio |

Nota: clasificar cuentas como "corriente" o "no corriente" requiere un campo nuevo en
`Cuenta` (`esCorriente Boolean?`) o una convención por rango de código PUC.

### Endpoints (`/api/reportes/indicadores`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/:periodoId` | todos | indicadores del periodo |
| GET | `/comparativo?desde=&hasta=` | todos | variación horizontal/vertical entre dos periodos |

---

## 6. Exportación de libros oficiales a PDF

**Qué hace:** genera libro diario, libro mayor y libro de inventarios en PDF con
numeración consecutiva y formato listo para imprimir/encuadernar, tal como exige la
norma mercantil para libros de comercio.

**Base legal:** Código de Comercio, Título IV — libros obligatorios de comercio y su
legalización.

### Implementación

- No requiere modelos nuevos: reutiliza las mismas consultas de
  `reportes.controller.ts`.
- Generación de PDF en el backend (p. ej. `pdfkit`, sin dependencias de servicios
  externos) o construcción de HTML + impresión desde el frontend — a decidir según lo
  que ya tengas disponible en el stack.
- Encabezado con datos de `Parametro` (nombre de la empresa, NIT), pie de página con
  numeración de folio.

### Endpoints (`/api/reportes/libro-diario.pdf`, `/api/reportes/libro-mayor.pdf`)

Mismos filtros que ya existen para los reportes actuales (periodo, rango de fechas,
cuenta), agregando `Content-Type: application/pdf`.

---

## 7. Presupuesto y control presupuestal

**Qué hace:** permite cargar un presupuesto por cuenta y periodo, y compararlo contra
la ejecución real (los saldos ya contabilizados).

**Base legal:** no es obligación normativa; es herramienta de control de gestión que
un contador particular suele ofrecer a sus clientes.

### Modelo Prisma

```prisma
model Presupuesto {
  id        Int      @id @default(autoincrement())
  cuentaId  Int
  periodoId Int
  valor     Decimal  @db.Decimal(15, 2)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  cuenta  Cuenta  @relation(fields: [cuentaId], references: [id])
  periodo Periodo @relation(fields: [periodoId], references: [id])

  @@unique([cuentaId, periodoId])
}
```

### Endpoints (`/api/presupuesto`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET/PUT | `/:periodoId` | ADMIN, CONTADOR | cargar/consultar presupuesto por cuenta |
| GET | `/:periodoId/ejecucion` | todos | presupuestado vs. real, con variación |

---

## 8. Alertas y recordatorios internos

**Qué hace:** reglas simples sobre datos ya existentes: cartera próxima a vencer,
periodo sin cerrar, activo totalmente depreciado sin dar de baja, cliente sin
movimientos recientes. Sin notificaciones externas (correo/SMS) en esta fase — solo
un panel en el dashboard.

### Sin modelos nuevos (o uno mínimo para reglas configurables)

```prisma
model ReglaAlerta {
  id        Int     @id @default(autoincrement())
  tipo      String  // CARTERA_VENCE, PERIODO_ABIERTO, ACTIVO_SIN_BAJA
  dias      Int?    // umbral en días, según el tipo
  activa    Boolean @default(true)
}
```

### Implementación

- Endpoint `GET /api/alertas` que evalúa las reglas activas contra el estado actual de
  `CuentaPorCobrar`, `Periodo`, `ActivoFijo`, etc., y devuelve una lista de avisos.
- Se muestra en el `Dashboard.tsx` del frontend como una sección de notificaciones.

---

## 9. Nómina simplificada (solo cálculo, sin PILA/DIAN)

**Qué hace:** liquida sueldo, prestaciones sociales y aportes según el Código
Sustantivo del Trabajo, y genera el asiento contable de nómina. No se conecta a
ninguna entidad (PILA, seguridad social) — solo calcula y contabiliza.

**Base legal:** Código Sustantivo del Trabajo (liquidación de prestaciones sociales:
cesantías, intereses a las cesantías, prima, vacaciones) y normas de aportes a
seguridad social vigentes (solo para el cálculo, no para la radicación).

Es el módulo más complejo normativamente (tarifas y topes cambian por ley y por tipo
de contrato), por eso se deja de último. Se recomienda empezar con una tabla de
parámetros editable (`ParametroNomina`: porcentaje salud, pensión, cesantías, etc.)
para no "quemar" tarifas en el código y facilitar su actualización cuando cambien.

### Modelo Prisma (borrador)

```prisma
model Empleado {
  id            String   @id @default(uuid())
  terceroId     String   @unique
  salarioBase   Decimal  @db.Decimal(15, 2)
  fechaIngreso  DateTime @db.Date
  activo        Boolean  @default(true)

  tercero Tercero @relation(fields: [terceroId], references: [id])
  nominas Nomina[]
}

model Nomina {
  id            Int      @id @default(autoincrement())
  empleadoId    String
  periodoId     Int
  comprobanteId Int?
  devengado     Decimal  @db.Decimal(15, 2)
  deducciones   Decimal  @db.Decimal(15, 2)
  netoPagar     Decimal  @db.Decimal(15, 2)

  empleado    Empleado    @relation(fields: [empleadoId], references: [id])
  periodo     Periodo     @relation(fields: [periodoId], references: [id])
  comprobante Comprobante? @relation(fields: [comprobanteId], references: [id])

  @@unique([empleadoId, periodoId])
}
```

Este módulo requiere una fase de diseño propia (definir con precisión qué conceptos
laborales cubre la V1: ¿solo salario + aportes básicos, o también provisión mensual de
prestaciones sociales?) antes de construirlo — no se detalla más aquí para no fijar
supuestos incorrectos.

---

## Notas de implementación transversales

- Todos los módulos nuevos siguen el patrón ya establecido: `schema.prisma` → migración
  con `npm run db:migrate` (nunca migraciones a mano, según `AGENTS.md`) → controlador
  con Zod → rutas con `requireAuth`/`requireRole` → tests en `backend/tests`.
- Cualquier módulo que genere asientos debe respetar partida doble y periodos abiertos,
  reutilizando la lógica ya probada en `comprobantes.controller.ts`.
- Cada módulo nuevo con endpoints de escritura debe tener su test de control de roles,
  como ya exige `AGENTS.md` ("cada ruta nueva con control por rol debe tener test").
