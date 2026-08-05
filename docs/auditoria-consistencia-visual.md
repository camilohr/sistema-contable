# Auditoria de consistencia visual - Fase 3

Fecha: 2026-08-05
Alcance: `frontend/src` (paginas, componentes y `index.css`)
Metodo: lectura completa de los 24 archivos de `pages/`, los componentes `ComprobanteForm`, `AlertasPanel`, `AdjuntosLista`, `Layout`, mas `CarteraProcesos` (se renderiza en Resumen), y verificacion por grep. Sin cambios de codigo: solo diagnostico.

## Checklist aplicada

1. Titulo `h2` + subtitulo/count-hint descriptivo en cada pantalla.
2. Botones: (a) ningun `<button>` sin clase `btn`; (b) un solo `.btn-primary` visible a la vez; (c) acciones destructivas con `.btn-danger`.
3. Mensajes: (a) solo `.error-msg`/`.success-msg`, sin `alert()`/`prompt()` ni `window.confirm` nuevos; (b) sin clases ad-hoc de mensaje.
4. Campos obligatorios con asterisco `*` visible.
5. Montos en tablas con `.num-cell` (no `.mono`); `.mono` solo para numeros de documento/fechas.
6. Formularios con `.form-card`/`.form-row`.
7. Tablas con estado vacio y estado de carga.
8. `ComprobanteForm` sin desbordes en ~1024px.
9. Navegacion con estado activo (`NavLink`/`.active`) y sin duplicar informacion del topbar.

## Referencias CSS verificadas (index.css)

| Clase | Linea | Uso |
|---|---|---|
| `.error-msg` | 110 | mensaje de error estandar |
| `.success-msg` | 115 | mensaje de exito estandar |
| `.ok-msg` | 649 | clase ad-hoc (color `var(--ok)`, font-size 0.88rem) - no esta en el estandar |
| `.form-card` | 623 | max-width: 460px (linea 631) |
| `.modal-wide` | 509 | max-width: 860px |
| `.asientos-head` / `.asientos-fila` | 518-524 | grid ~814px minimo: `minmax(220px,1.6fr) minmax(120px,0.9fr) 110px 110px minmax(140px,1fr) 34px` + gap 0.5rem |
| `.sidebar-nav a.active` | 269 | estado activo del menu lateral |

## Hallazgos globales

- **Checklist 4 (asteriscos): NINGUN formulario del proyecto usa marcador visual `*`.** No existe una clase `.req` en `index.css`. Todos dependen solo del atributo HTML `required`. Aplica a: `ComprobanteForm.tsx`, `ActivosFijos.tsx`, `ParametrosNomina.tsx`, `ProvisionCartera.tsx`, `Nomina.tsx`, `Empleados.tsx`, `Terceros.tsx`, `Clientes.tsx`, `Usuarios.tsx` y los formularios de `Productos`, `Cuentas`, `Periodos`, `Cartera`, `CierreAnual`, `Presupuesto`, `Login`, `CambiarPassword`.
- **Checklist 1 (subtitulo):** solo `Resumen.tsx:135-139`, `Dashboard.tsx:29-32` y `Auditoria.tsx:119` tienen subtitulo descriptivo junto al `h2`. Las otras 19 pantallas usan `h2` en `.page-head` sin subtitulo (el texto inferior es el count-hint de carga/vacio, que es estado, no subtitulo).
- **Checklist 2a (botones sin clase): 0.** Verificados 100+ `<button>`: todos tienen `className="btn ..."`. Ademas hay un `<label className="btn btn-secondary btn-sm adjuntos-subir">` en `AdjuntosLista.tsx:104` (funciona como boton, correcto).
- **Checklist 3a (confirmaciones):** exactamente 5 `window.confirm` en todo el proyecto, ninguno mas: `Conciliaciones.tsx:160`, `Usuarios.tsx:75`, `Procesos.tsx:191`, `Clientes.tsx:104`, `AdjuntosLista.tsx:88`. No hay `alert()`, `window.alert()` ni `window.prompt()` en `frontend/src`.
- **Checklist 3b (clases ad-hoc):** 4 usos de `.ok-msg` (deberia ser `.success-msg`): `Conciliaciones.tsx:209`, `CambiarPassword.tsx:48`, `CambiarPassword.tsx:84`, `ComprobanteForm.tsx:279`. Cero estilos inline de color.

## Por pantalla

### pages/Usuarios.tsx
- `window.confirm` en 75 (confirmado).
- `Retirar` (137) usa `btn btn-secondary btn-sm` para accion destructiva -> debe ser `btn btn-secondary btn-sm btn-danger` (patron de Terceros/Productos).
- Titulo `h2` (88) sin subtitulo descriptivo.
- FormaUsuario/FormaAsignar sin asteriscos en requeridos (198, 202, 214, 268).

### pages/Terceros.tsx
- Titulo sin subtitulo (65).
- Forms sin asteriscos (223, 228, 327, 332).
- Resto OK (botones danger correctos: 143, 408).

### pages/Resumen.tsx
- (OK) Titulo con count-hint NIT (135-139).
- Checklist 9: el `h2` "Proceso de {empresa.nombre}" (135) duplica el nombre de empresa del topbar.

### pages/Reportes.tsx
- Checklist 5: `td className="mono"` monetarios en 333, 334, 341, 342, 377, 378, 379, 386, 387, 424, 425, 426, 427, 434, 435, 436, 437, 520, 526 y `th className="mono"` de columnas numericas en 320, 321, 366, 367, 368, 412, 413, 414, 415, 511 -> `num-cell`. (La 327 es fecha, no monetaria: OK.)
- Titulo sin subtitulo (227).
- Tabs con un solo primary a la vez (232): OK.

### pages/ProvisionCartera.tsx
- Checklist 6: `<form onSubmit={guardarParametros}>` (428) SIN clase CSS (ni form-card ni form-row).
- Checklist 2b: dos `.btn-primary` visibles simultaneamente al editar parametros: 234 ("Calcular provision") y 495 ("Guardar parametros").
- Titulo sin subtitulo (204).
- Tabla de parametros (401-420) sin estado vacio: si no hay rangos, tabla vacia sin mensaje (menor).
- Forms sin asteriscos.

### pages/Productos.tsx
- (OK) salvo: titulo sin subtitulo (72), forms sin asteriscos (230, 234, 239, 343, 347). Boton danger correcto (148).

### pages/Procesos.tsx
- `window.confirm` en 191 (confirmado).
- Checklist 6: dos `<form className="form-row">` usados como contenedor de formulario en vez de form-card: 267 (crear proceso) y 337 (agregar nota).
- Titulo sin subtitulo (208).
- `td className="mono"` 236 es el anio (no monetario): no se reporta como num-cell.

### pages/Presupuesto.tsx
- Checklist 6/8: el form-card (219) contiene una tabla completa de partidas (235-280); `.form-card` tiene max-width 460px -> la tabla desborda igual que en ComprobanteForm.
- `SelectorCuenta` (84-89): input y select sin `.filter-input` (estilo global solamente).
- Titulo sin subtitulo (211).
- Forms sin asteriscos.

### pages/Periodos.tsx
- (OK) salvo: titulo sin subtitulo (68), forms sin asteriscos (172, 177, 181). Boton Eliminar danger correcto (121).

### pages/ParametrosNomina.tsx
- Checklist 2b: DOS `.btn-primary` simultaneos: 198 ("Guardar parametros") y 245 ("Guardar mapeo").
- Checklist 4: los 15 campos de parametros (177-192) y el anio (174) requeridos sin asterisco.
- Titulo sin subtitulo (162).

### pages/Nomina.tsx
- (OK) en estructura: num-cell correctos (152-153, 161-162, 437-441, 508-510, 552-556); unico primary en 374; contabilizar/provisionar son secondary.
- Salvo: titulo sin subtitulo (301), inputs de ajuste (349-360) sin asteriscos (tienen defaults, no `required`).

### pages/Login.tsx
- (OK) en su esquema propio: `<h1 className="login-title">` (32) en vez de `<h2>`, pero es el diseno dedicado `.login-card` (index.css:35-53); no aplica el patron `.page`. Error usa `.error-msg` (56).

### pages/Indicadores.tsx
- Checklist 5: columnas numericas con `mono` en vez de `num-cell`: `td` 288, 289, 290, 322, 323, 324, 325, 355, 356, 357, 358; `th` 275, 276, 311, 312, 313, 314, 344, 345, 346, 347.
- Titulo sin subtitulo (192).
- Botones Calcular/Comparar primarios en pestanas distintas (214, 254): nunca simultaneos, OK.

### pages/Empleados.tsx
- (OK) salvo: titulo sin subtitulo (72), forms sin asteriscos (240, 256, 262, 343, 403). Botones danger correctos (125, 410).

### pages/Dashboard.tsx
- Checklist 1: `h2` (29) fuera de `.page-head` (div plano).
- Checklist 9: duplica nombre de empresa y rol del topbar (29-32: "Menu de modulos - {nombre}" + "Empresa activa: {nombre} - Rol: {rol}").

### pages/Cuentas.tsx
- (OK) salvo: titulo sin subtitulo (68), forms sin asteriscos (195, 199, 251). El `style={{ paddingLeft }}` (125) es indentacion funcional, no estilo ad-hoc de mensaje. Boton Eliminar danger correcto (145).

### pages/Conciliaciones.tsx
- `window.confirm` en 160 (confirmado).
- Checklist 3b: mensaje de exito con clase ad-hoc `.ok-msg` (209) -> `.success-msg`.
- Checklist 5: `td className="mono"` monetarios 247, 248, 249, 321, 322, 323; `th className="mono"` 232, 233, 234, 309, 310, 311 -> `num-cell`.
- Titulo sin subtitulo (176).

### pages/Comprobantes.tsx
- Checklist 5: `td className="mono"` monetarios 235 (Total), 326 y 327 (Debito/Credito del detalle) -> `num-cell`.
- Tabla del detalle (311-332) sin `.table-wrap` y con th "Debito"/"Credito" (316-317) sin `num-cell`.
- Titulo sin subtitulo (172).
- Botones Anular/Eliminar danger correctos (253, 259, 285).

### pages/Clientes.tsx
- `window.confirm` en 104 (confirmado, es el "Reactivar").
- Titulo sin subtitulo (119).
- Forms sin asteriscos (249, 253).
- Resto OK: 165 "Dar de baja" y 328 "Confirmar baja" son btn-danger.

### pages/CierreAnual.tsx
- (OK) salvo: titulo sin subtitulo (123), forms sin asteriscos (132, 138, 144). Menor: fecha en celda `num-cell mono` (192) - la fecha no es numerica.

### pages/Cartera.tsx
- (OK) salvo: titulo sin subtitulo (135), forms sin asteriscos (299, 310, 315, 319, 324, 445). Botones danger correctos (214, 510).

### pages/CambiarPassword.tsx
- Checklist 1: `h2` (45) fuera de `.page-head`; subtitulo es `<p>` plano "Usuario: {email}" (46) en vez de `count-hint`.
- Checklist 3b: mensajes con `.ok-msg` (48 y 84) -> `.success-msg`.
- Checklist 9: muestra el email del usuario (46), duplicando informacion del topbar (nombre+rol en Layout.tsx:128).

### pages/Auditoria.tsx
- (OK) con subtitulo descriptivo (119).
- Menores: selects de filtros (100, 108) sin `.filter-input` (los demas filtros lo usan); fecha en `td className="num-cell"` (140) - la fecha no es numerica.

### pages/ActivosFijos.tsx
- (OK) salvo: titulo sin subtitulo (102), FormaActivo (215-332) sin asteriscos en 6 campos requeridos. Botones danger correctos (175, 465). Un solo `.btn-primary` visible (109; "Depreciar periodo" es secondary, 106).

## Por componente

### components/ComprobanteForm.tsx
- **Checklist 8 (desbordes):** la grilla de asientos `.asientos-head`/`.asientos-fila` (index.css:518-524) requiere ~814px minimo. El formulario esta dentro de `.form-card` (max-width 460px, index.css:631) y el modal `.modal-wide` es de 860px, pero `.form-card` NO se expande dentro del modal -> la grilla desborda la tarjeta ~314px y sale del modal (no hay overflow-x que lo contenga; solo `.table-wrap` lo tiene). En ~1024px el desborde se ve igual porque es contra el form-card, no contra el viewport.
  - Fix sugerido: `.modal-wide .form-card { max-width: 100%; }`.
  - Los inputs debito/credito SI alinean a la derecha (index.css:551-554) y sus headers tambien (546-549): OK.
- Checklist 3b: feedback de cuadre usa `.ok-msg` (279) en vez de `.success-msg`.
- Checklist 4: fecha/periodo/concepto/asientos requeridos sin asterisco.

### components/AlertasPanel.tsx
- (OK). Mensajes con `.error-msg`/`.success-msg` (99-100), estados carga/vacio OK (102, 104).

### components/AdjuntosLista.tsx
- `window.confirm` en 88 (confirmado, el 5 de 5).
- Checklist 7: sin indicador de carga al consultar `/adjuntos` (35-43 no setea estado de carga; la lista aparece sin feedback).
- `mono` en 128 (tamano "KB/MB") y 130 (fecha): no monetarios, no se reportan como num-cell.

### components/Layout.tsx
- (OK) Checklist 9: menu lateral con estado activo correcto via `NavLink` + `className={({ isActive }) => (isActive ? "active" : "")}` (84, 94, 100) y CSS `.sidebar-nav a.active` (index.css:269-272). Boton "Salir" (130-131) es `btn btn-secondary`.

### components/CarteraProcesos.tsx (extra: se renderiza en Resumen)
- Checklist 7: sin indicador de carga y sin estado vacio (38 retorna `null` sin mensaje cuando no hay filas).

## Resumen cuantitativo

| Pantalla / componente | Checklist con desviaciones |
|---|---|
| Usuarios | 2b (Retirar sin btn-danger), 1, 4 |
| Terceros | 1, 4 |
| Resumen | 9 (duplica empresa) |
| Reportes | 5 (mono masivo en columnas numericas), 1 |
| ProvisionCartera | 6 (form sin clase), 2b (dos primarios), 1, 4 |
| Productos | OK (menores: 1, 4) |
| Procesos | 6 (form-row como contenedor), 1 |
| Presupuesto | 6/8 (form-card con tabla), 1 |
| Periodos | OK (menores: 1, 4) |
| ParametrosNomina | 2b (dos primarios), 4 |
| Nomina | OK |
| Login | OK (h1 por diseno propio) |
| Indicadores | 5 |
| Empleados | OK (menores: 1, 4) |
| Dashboard | 1 (h2 fuera de page-head), 9 |
| Cuentas | OK (menores: 1, 4) |
| Conciliaciones | 3b (ok-msg), 5 |
| Comprobantes | 5, 6 (tabla detalle sin table-wrap) |
| Clientes | OK (menores: 1, 4) |
| CierreAnual | OK (menores: 1, 4) |
| Cartera | OK (menores: 1, 4) |
| CambiarPassword | 1, 3b (ok-msg), 9 |
| Auditoria | OK (menores) |
| ActivosFijos | OK (menores: 1, 4) |
| ComprobanteForm | 8 (overflow), 3b (ok-msg), 4 |
| AlertasPanel | OK |
| AdjuntosLista | 7 (carga) |
| Layout | OK (item 9) |
| CarteraProcesos | 7 (vacio/carga) |

Nota: las 19 pantallas con "tiene subtitulo faltante" y las 18 con "asteriscos faltantes" comparten el mismo fix global (agregar subtitulo/count-hint al `.page-head` y una clase `.req` + marcador `*`), no son 19 problemas independientes.
