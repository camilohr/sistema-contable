# Normatividad Contable Aplicada

Sistema contable para contador público independiente en Colombia. Esta versión (V2)
cubre la contabilidad interna sin integraciones externas. V2 añade la anulación real
por contrasiento (S1-06): los comprobantes contabilizados no se excluyen de los libros
al anularse, sino que quedan junto a su reversión, manteniendo el libro completo.

## 1. Marco normativo incluido

### 1.1 Ley 1314 de 2009
Define los principios y normas de contabilidad e información financiera en Colombia
y el proceso de convergencia a las Normas Internacionales de Información Financiera
(NIIF). Es la norma marco del sistema.

### 1.2 Decreto 2649 de 1993
Regula la contabilidad en general: principios de contabilidad generalmente aceptados
(PCGA), registro de operaciones, cualidades de la información contable y elaboración
de estados financieros. Aplica a la contabilidad de soporte.

### 1.3 Decreto 2706 de 2012 (NIIF para microempresas)
Marco técnico normativo para microempresas. Simplifica el registro y la presentación
de información financiera. **Recomendado como marco base** para el perfil del usuario
(contador particular), por su menor carga documental frente al grupo 2 (NIIF plenas).

> Nota: antes de definir el marco final de cada cliente se debe confirmar su clasificación
> (microempresa, pequeña, mediana o gran empresa). El sistema lo parametriza.

### 1.4 Plan Único de Cuentas (PUC) — Decreto 2650 de 1993
Catálogo oficial de cuentas para comerciantes. Estructura de 9 clases con naturaleza
deudora o acreedora:

| Clase | Descripción | Naturaleza |
|---|---|---|
| 1 | Activo | Deudora |
| 2 | Pasivo | Acreedora |
| 3 | Patrimonio | Acreedora |
| 4 | Ingresos | Acreedora |
| 5 | Gastos | Deudora |
| 6 | Costos de venta | Deudora |
| 7 | Costos de producción | Deudora |
| 8 | Cuentas de orden deudoras | Deudora |
| 9 | Cuentas de orden acreedoras | Acreedora |

Codificación por niveles: clase (1 dígito) → grupo (2 dígitos) → cuenta (4 dígitos)
→ subcuenta (6 dígitos) → auxiliar (8 dígitos). Ej.: `110505` = Activo (1) /
Disponible (11) / Caja (1105) / Caja general (110505).

### 1.5 Código de Comercio — Libros obligatorios
- **Libro diario:** registro cronológico de todas las operaciones.
- **Libro mayor:** agrupación por cuenta del movimiento y saldos.
- Requisito: asientos numerados, fechados y sin enmendaduras. El sistema garantiza la
  **inmutabilidad** de los asientos contabilizados (no se editan ni borran; solo se
  anulan con contrasiento), cumpliendo el principio de no alteración de los libros.

**Anulación por contrasiento (S1-06).** Los asientos contabilizados no se modifican ni
se eliminan (Código de Comercio, libros sin enmendaduras; Decreto 2649/1993, art. 127).
La anulación de un comprobante contabilizado:

1. Marca el original como `ANULADO`, registrando el usuario y la fecha de anulación.
2. Genera un **contrasiento**: comprobante del mismo tipo, con el consecutivo siguiente
   de esa serie, misma fecha y periodo, que invierte cada línea (cada débito por su
   crédito y viceversa) **preservando cuenta, tercero y detalle**; queda `CONTABILIZADO`
   y referencia al original por `comprobanteOrigenId`.
3. Los libros y estados financieros incluyen el original anulado y su contrasiento
   (efecto neto cero), conservando la trazabilidad íntegra.
4. Quedan bloqueadas la doble anulación, la anulación de borradores, la anulación en
   periodos cerrados y la anulación de un contrasiento.

Los comprobantes `ANULADO` generados antes de la adopción de este mecanismo (anulación
por exclusión) quedan respaldados por su contrasiento mediante el script
`db:backfill-contrasientos` (`backend/scripts/backfill-contrasientos.ts`), de modo que
ningún saldo histórico quede sin reversión.

## 2. Principios contables implementados en el sistema

| Principio | Cómo lo garantiza el sistema |
|---|---|
| Partida doble | Todo comprobante exige débitos = créditos |
| Registro por su valor original | Importes `DECIMAL(15,2)`, sin redondeos de punto flotante |
| Período | Asientos solo en periodos abiertos; cierre que bloquea cambios |
| Causación | Registro por comprobantes fechados |
| Conservación / no alteración | Asientos contabilizados inmutables; anulación por contrasiento (ver §1.5) |
| Asociación | Cuentas de ingresos/gastos marcadas `afecta_resultado` |
| Revelación plena | Estados financieros derivados directamente de los libros |

## 3. Fuerza de ley de los procesos

Para que los procesos contables sean válidos:

1. **Soporte documental:** cada asiento proviene de un comprobante (diario, recibo de
   caja, comprobante de egreso) con concepto y tercero cuando aplica.
2. **Consecutivos:** los comprobantes se numeran de forma consecutiva por tipo, sin
   saltos ni repeticiones.
3. **Libros de comercio:** el sistema genera libro diario y libro mayor con exactitud,
   base para su legalización y conservación según la ley mercantil.
4. **Depreciación:** activos fijos se deprecian en línea recta según su vida útil.
5. **Inventario:** costo de venta por método de promedio ponderado.

## 4. Fuera de alcance de la V1 (requieren conexión externa)

Estas obligaciones **no** se integran en esta versión y deberán gestionarse por
medios externos hasta una V2:

- Facturación electrónica y radicación ante la DIAN.
- Presentación de declaraciones tributarias (IVA, retención, renta).
- Cotejo de documentos equivalentes, CAE / facturación con resoluciones.
- Integración con bancos o pasarelas de pago.
- Firma electrónica certificada.

El sistema sí **prepara la información** (libros, estados financieros, saldos por
cuenta de retención) para que el contador pueda reportarla o trasladarla sin
reprocesos.

## 5. Documentos de referencia

- Ley 1314 de 2009 — Principios y normas de contabilidad.
- Decreto 2649 de 1993 — Régimen de contabilidad general.
- Decreto 2650 de 1993 — PUC para comerciantes.
- Decreto 2706 de 2012 — NIIF para microempresas.
- Código de Comercio — Título IV, libros de comercio.
