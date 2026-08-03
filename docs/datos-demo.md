# Datos de prueba (demo)

Para probar el sistema con datos realistas sin contaminar la base de datos de producción, existe un
script idempotente que carga un escenario contable completo vía la API REST.

## Ejecución

```powershell
# desde backend/
npm run db:seed:demo
# o directamente:
node scripts/seed-demo.mjs
```

El script se conecta a `http://localhost:3000` (configurable con la variable `API_URL`) e inicia sesión
como el administrador (`admin@sistema.local` / `Admin123!`). Se puede cambiar con `DEMO_EMAIL` y
`DEMO_PASSWORD`. **Es idempotente**: si el dato ya existe, lo omite; se puede ejecutar varias veces.

## Qué crea

- **Periodo 2026** (01-01 a 31-12, `ABIERTO`).
- **4 terceros**: 2 clientes (CC), 1 proveedor (NIT) y 1 cliente adicional con cartera vencida.
- **6 comprobantes** (consecutivos por tipo):
  - `DIARIO-001` Aporte social inicial (15.000.000) — contabilizado.
  - `EGRESO-001` Compra de mercancías (base 2.000.000 + IVA 380.000, retefuente 70.000) — contabilizado.
  - `INGRESO-001` Causación de venta (2.380.000) — contabilizado.
  - `DIARIO-002` Pago de arrendamiento (1.200.000) — contabilizado.
  - `DIARIO-003` Nómina de enero (4.500.000) — **borrador** para practicar contabilizar/anular.
  - `DIARIO-004` Nota interna de prueba (100.000) — **anulado**.
- **Cartera CxC** (4 documentos, uno por estado): FC-001 PENDIENTE, FC-002 ABONADA, FC-003 VENCIDA,
  FC-004 CANCELADA.
- **Cartera CxP** (2 documentos): NP-001 PENDIENTE, NP-002 CANCELADA.
- **1 producto** (Laptop HP ProBook): 2 entradas (10 y 5 und) y 1 salida (3 und), con costo promedio
  ponderado dinámico (stock 12, costo 1.833.333,33).

## Nota sobre fechas

Los estados de cartera (PENDIENTE / VENCIDA) se calculan contra la fecha actual. El script usa
vencimientos de 2026: los documentos con vencimiento anterior a hoy salen `VENCIDA`. Si se reutiliza en
un año distinto, ajustar las fechas del script para que los estados se vean como se espera.

## Pruebas funcionales realizadas

Las reglas de negocio se verificaron en vivo contra la API (además de la suite de 109 tests):

- Comprobante descuadrado → `400 La partida doble no cuadra`.
- Abono mayor al saldo → `400`; abono sobre documento cancelado → `400`.
- Salida de inventario mayor al stock → `400`.
- Documento de tercero inválido → `400`; periodo duplicado → `409`.
- Ciclo de vida: borrador crear→editar→eliminar; contabilizar un anulado → `400`.
- Producto con movimientos se desactiva en lugar de borrarse; CxC con abonos no se elimina.

## Limpieza

La base queda con solo el demo (PUC + admin + datos demo). Los datos temporales de prueba se retiran
directamente (los que la API no permite borrar por tener abonos/movimientos asociados).
