# QA de la estabilización V2.1 - Fase 6

Fecha: 2026-08-06
Método: QA ejecutable con Playwright (script local `qa/crud.js`) contra la aplicación real
(PostgreSQL local, backend PM2 puerto 3000, frontend Vite puerto 5173). Usuario `admin@sistema.local`
(ADMIN, empresa activa `1aaecb66-ecea-aa9b-5efc-31e5b48c8ef8`). Los datos QA creados se limpian antes
de cada corrida con `qa/cleanup-qa.js` (Prisma directo, orden de FK correcto).

## Resultado

**27/28 pasos PASAN** en la corrida original; la única falla (eliminar periodo con
presupuesto) fue **corregida y validada** en el cierre (backend + frontend + tests),
quedando la suite de 28 pasos en verde. Cero issues de consola/HTTP en la corrida final.
Evidencia por pantalla en `C:\Users\Pc\AppData\Local\Temp\opencode\qa\shots\crud\*.png` y
reporte JSON en `report-crud.json` (PREF `QA1785975335390`).

## Pasos por módulo

| Módulo | Pasos | Resultado |
|---|---|---|
| Preparación | login API + empresa, catálogo de cuentas (732 mov / 17 activo / 8 acum / 17 gasto) | PASS |
| Login UI | login y aterrizaje en /empresa/:id | PASS |
| Fase 1 | admin global ve la empresa activa en el selector del topbar | PASS |
| Terceros | crear (NIT, PROVEEDOR) / editar / desactivar / crear persona natural (CC, AMBOS) [Fase 4] | PASS |
| Clientes | crear (CC, persona natural) [Fase 4] / dar de baja | PASS |
| Cuentas | crear (`11050501`) / editar / eliminar | PASS |
| Periodos | crear y abrir P1 / crear y eliminar limpio P2 / eliminar con presupuesto (bloqueado) | PASS* |
| Presupuesto | cargar partida y guardar (mensaje "Presupuesto del periodo guardado") | PASS |
| Comprobantes | crear BORRADOR con partida doble cuadrada (CSS Module + totales débito/crédito) / eliminar BORRADOR sin modal | PASS |
| Productos | crear / editar / eliminar | PASS |
| Empleados | crear / retirar (con fecha) | PASS |
| Activos fijos | crear / editar (labels con `*`) | PASS |
| Usuarios | crear / retirar | PASS |

## Hallazgos

### 1. Eliminar un periodo con presupuesto no funcionaba (CORREGIDO)

- **Síntoma original:** en Periodos, al intentar eliminar un periodo que tiene partidas de
  presupuesto, el periodo sigue listado indefinidamente y no hay mensaje de error al
  usuario. La petición queda colgada.
- **Causa raíz:** `backend/src/controllers/periodos.controller.ts` `eliminar` ejecutaba
  `prisma.periodo.delete()` sin validar ni manejar la restricción de integridad
  referencial `Presupuesto_periodoId_fkey` (RESTRICT). Prisma lanza
  `PrismaClientUnknownRequestError` (Postgres `23001`), el handler async no lo captura
  y Express 4 no responde.
- **Corrección aplicada:**
  - Backend: `listar` y `eliminar` ahora cuentan `comprobantes`, `presupuestos`,
    `conciliaciones`, `nominas`, `provisionesNomina`, `depreciaciones` y
    `provisionesCartera`. `eliminar` responde `400` con mensaje claro si el periodo
    tiene cualquier dependencia, en vez de lanzar el error no controlado.
  - Frontend: `Periodos.tsx` muestra columna "Presupuesto" y deshabilita el botón
    "Eliminar" (con tooltip) cuando el periodo tiene presupuesto u otra dependencia.
  - Tests: `backend/tests/presupuesto.test.ts` (2 casos nuevos: bloqueo con 400 y
    eliminación de periodo limpio).
- **Estado:** corregido y validado (`npm run build` + tests 143 en los archivos
  relacionados).

### 2. CSS Modules de ComprobanteForm: clases de asientos no se aplicaban (corregido durante la validación)

- **Síntoma:** el formulario de comprobantes renderizaba la cuadrícula de asientos sin
  las clases del módulo; la validación visual de la Fase 5 fallaba.
- **Causa:** `ComprobanteForm.tsx` accede con camelCase (`styles.asientosHead`,
  `styles.asientosFila`, `styles.colCuenta`, ...) pero `ComprobanteForm.module.css`
  definía las clases en kebab-case (`.asientos-head`, `.asientos-fila`, `.col-cuenta`).
  Vite exporta las claves tal cual el archivo CSS, por lo que `styles.asientosHead`
  era `undefined` y el grid quedaba sin estilo.
- **Corrección:** `ComprobanteForm.module.css` renombrado a camelCase, consistente con
  la convención de los demás módulos (ej. `Layout.module.css`). Verificado en runtime
  (claves `asientosHead`/`asientosFila` exportadas) y con el paso QA de Comprobantes en verde.

### 3. Comprobantes: `cuentaId` se enviaba como string y el backend lo rechazaba (corregido durante la validación)

- **Síntoma:** crear un comprobante desde la UI devolvía `400 Datos inválidos` en
  `POST /api/comprobantes` (`fieldErrors.asientos: Expected number, received string`).
- **Causa:** el `select` de cuenta del formulario guardaba `e.target.value` (string) en
  `AsientoLinea.cuentaId`, y `onSubmit` lo enviaba sin convertir, mientras el backend
  valida `cuentaId: z.number().int().positive()`.
- **Corrección:** `ComprobanteForm.tsx` convierte a número en el `onChange`
  (`Number(e.target.value)`), alineado con la interfaz `cuentaId: number | ""`. Se
  ajustó además el tipo del parámetro `valor` de `setAsiento` a `unknown`.

## Notas de validación

- **Fase 5 (CSS Modules):** 9 componentes/pantallas migrados; validados los módulos con
  CSS module en la UI (Comprobantes en este QA). `index.css` reducido de 1006 a 520 líneas.
- **Fase 4:** crear cliente CC persona natural y tercero CC AMBOS pasan; el detalle del
  tipo de documento se refleja en las tablas.
- **Fase 1:** ADMIN ve la empresa creada por el flujo de Clientes en el selector (el
  panel de cartera se valida por API en `backend/tests/procesos.test.ts`).
- **Datos QA:** prefijo `QA<timestamp>`; la limpieza (`cleanup-qa.js`) borra presupuesto →
  periodo → depreciación → activo fijo → empleado → tercero → cuenta → producto → proceso
  → empresa → auditoría → usuarioEmpresa → usuario. Los `fail-*.png` residuales en
  `shots/crud/` corresponden a corridas anteriores a las correcciones 2 y 3.
