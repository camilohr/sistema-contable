# QA del diseño profesional V2.2

Fecha: 2026-08-06
Método: QA visual con Playwright contra la aplicación real (PostgreSQL local, backend Vite watch
puerto 3000, frontend Vite dev puerto 5173). Usuario `admin@sistema.local` (ADMIN, empresa activa
`1aaecb66-ecea-aa9b-5efc-31e5b48c8ef8`). Capturas de las 24 pantallas en
`docs/qa-v2.2-screenshots/*.png` (estado "después" del rediseño; el estado "antes" corresponde a
`main` anterior a la Parte 3 de V2.2).

## Resultado

**24/24 capturas de módulos OK**, cero errores de consola/HTTP en el recorrido, y recorrido funcional
de los flujos clave en verde. No hubo regresiones funcionales: el rediseño fue exclusivamente
visual/estructural de UI (sin cambios en lógica contable ni backend).

## Capturas por módulo (después)

| Módulo | Captura | Estado |
|---|---|---|
| Login | `login-v22.png` | OK |
| Resumen del proceso | `resumen-v22.png` | OK |
| Menú de módulos | `menu-v22.png` | OK |
| Catálogo de cuentas | `cuentas-v22.png` | OK |
| Terceros | `terceros-v22.png` | OK |
| Periodos | `periodos-v22.png` | OK |
| Comprobantes | `comprobantes-v22.png` | OK |
| Conciliación bancaria | `conciliaciones-v22.png` | OK |
| Libros y reportes | `reportes-v22.png` | OK |
| Cuentas por cobrar | `cxc-v22.png` | OK |
| Cuentas por pagar | `cxp-v22.png` | OK |
| Productos e inventario | `productos-v22.png` | OK |
| Activos fijos | `activos-fijos-v22.png` | OK |
| Cierre anual | `cierre-anual-v22.png` | OK |
| Provisión de cartera | `provision-cartera-v22.png` | OK |
| Indicadores financieros | `indicadores-v22.png` | OK |
| Usuarios | `usuarios-v22.png` | OK |
| Clientes | `clientes-v22.png` | OK |
| Bitácora de auditoría | `auditoria-v22.png` | OK |
| Empleados | `empleados-v22.png` | OK |
| Nómina | `nomina-v22.png` | OK |
| Parámetros de nómina | `parametros-nomina-v22.png` | OK |
| Presupuesto | `presupuesto-v22.png` | OK |
| Seguimiento por procesos | `procesos-v22.png` | OK |

## Recorrido funcional

| Flujo | Resultado |
|---|---|
| Login UI (admin) y aterrizaje en `/empresa/:id` | PASS |
| Sidebar con grupos, íconos por módulo, estado activo y rol visible | PASS |
| Topbar con selector de empresa y chip de usuario/rol | PASS |
| Resumen con tarjetas de estado, alertas y cartera | PASS |
| Comprobantes: lista con tablas, badges y botones con íconos | PASS |
| Detalle de comprobante (modal): asientos, totales débito/crédito | PASS |
| Cierre de modal con Escape (foco gestionado) | PASS |
| Reportes: libro diario con totales de pie y exportaciones | PASS |
| Menú de módulos con íconos en cajas tintadas | PASS |
| Zebra en tablas grandes (verificado en 856 filas de cuentas) | PASS |
| Responsividad 1024px (sidebar 200px) | PASS |
| Responsividad 768px (sidebar horizontal arriba) | PASS |

## Hallazgos

### 1. `@fontsource/inter` empaqueta la fuente localmente (sin CDN)

La fuente Inter se instala como dependencia npm y se carga desde el build (woff2 en `dist/assets`),
cumpliendo la restricción local-first del proyecto: ningún `<link>` a Google Fonts ni servicio externo.

### 2. Contraste AA de colores de estado

El gris `--muted: #64748b` sobre superficie blanca cumple ~4.5:1 (AA para texto normal). Los tonos
de semáforo se formalizaron con tokens propios (`--semaforo-verde/ambar/rojo`) y los colores de
estado (BORRADOR/CONTABILIZADO/ANULADO, PENDIENTE/VENCIDA) usan fondos tintados con texto de mayor
contraste.

### 3. Observación menor de datos (no es bug)

El chip de usuario del topbar muestra el nombre del usuario admin como "Administrador" y debajo el
rol "Administrador" (el nombre de ese usuario es literalmente "Administrador"). Es dato de seed, no
un problema del layout.

### 4. Elección del color primario (decisión de diseño documentada)

Azul institucional `#1f4e79` (con variante hover `#173f63` y deep `#0f2a42` para la barra lateral),
serio y no saturado, apropiado para software financiero según lo indicado en el plan (Fase A).

## Notas de validación

- Se validó que el rediseño no rompió ningún flujo: los endpoints usados en el recorrido respondieron
  200 y la consola del navegador no registró errores.
- Cierre de la Parte 3: verificación completa (backend `npm test` + `npm run build`, frontend
  `npm run lint` + `npm run build`) antes del commit final.
