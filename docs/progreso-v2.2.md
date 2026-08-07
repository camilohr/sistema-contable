# Progreso V2.2 — Cierre V2.1, endurecimiento contable y diseño profesional

Referencia: `instrucciones-opencode-v2.2.md`. Se actualiza al terminar cada **parte** completa.

## Parte 1 — Cierre de pendientes de V2.1 ✅ COMPLETA

- [x] **1.1 Versión y CHANGELOG**: entrada `## [2.1.0] - 2026-08-06` en `CHANGELOG.md` (cartera ADMIN, colisión CSS, 9 pantallas CSS Modules, persona natural/jurídica, 3 hallazgos QA corregidos). Bump a `2.1.0` en `backend/package.json` y `frontend/package.json` (no existe `package.json` en la raíz). Commit `9bf91e6` y tag `v2.1.0`.
- [x] **1.2 Migración a CSS Modules**: tras verificar la lista real, las 18 pantallas listadas (Dashboard, CambiarPassword, Auditoria, Periodos, ParametrosNomina, CierreAnual, Usuarios, Cuentas, Clientes, Indicadores, Presupuesto, Terceros, Empleados, Productos, ProvisionCartera, Cartera, ActivosFijos, Nomina) **no tienen clases CSS propias**: usan exclusivamente el sistema compartido de `index.css` (`.page`, `.table`, `.btn`, `.badge`, `.modal*`, `.form-card`, `.filters`, etc.). Se verificó que ninguna clase de `index.css` es exclusiva de una sola pantalla y que las 9 pantallas ya migradas encapsulan sus clases específicas. No se crearon `.module.css` vacíos.
- [x] **Convención camelCase**: se encontró que `Reportes.module.css` y `Resumen.module.css` definían clases en kebab-case mientras el TSX accede con camelCase (mismo bug del hallazgo #3 del QA V2.1) — esas clases no se aplicaban en runtime. Renombradas a camelCase en commits `a3b5258` y `24b8955`. Los 9 módulos quedan consistentes en camelCase.
- [x] **index.css**: contiene solo el sistema de diseño compartido (variables `:root`, `.btn*`, `.table`, `.modal*`, badges, semáforo, etc.). Verificado: ninguna clase es específica de una sola pantalla.

## Parte 2 — Endurecimiento funcional contable ✅ COMPLETA

- [x] **2.1 Partida doble**: se agregaron tests de rechazo de comprobante con 1 solo asiento (mensaje "al menos 2 asientos"), rechazo de montos negativos en débito y crédito, y test de creación concurrente (`Promise.all`). **Se corrigió la asignación del consecutivo para que sea atómica**: el test reveló que el modelo leer-luego-escribir podía duplicar/fallar; se creó `backend/src/lib/consecutivo.ts` (`obtenerSiguienteConsecutivo`) que bloquea la fila con `SELECT ... FOR UPDATE` dentro de la transacción, y se refactorizó `comprobantes.controller.ts` y `lib/comprobantes.ts` (depreciación, baja, cierre anual, provisión, nómina) para usarlo. Con el fix, ambas creaciones concurrentes obtienen consecutivos distintos.
- [x] **2.2 Cierre anual**: ya existían tests de "año ya cerrado" y "periodos abiertos". Se agregó test de que las cuentas de resultado (clases 4-7) quedan en cero después del cierre, y test de rol AUXILIAR (403) sobre el cierre.
- [x] **2.3 Provisión/depreciación**: el duplicado por periodo ya estaba cubierto en `provision.test.ts` y `activos-fijos.test.ts`. Se agregó test de redondeo: cuota de depreciación con fracción de centavo (valor 1.000.000 / 3 meses → 333.333,33) mantiene el asiento cuadrado y el valor registrado redondeado a 2 decimales.
- [x] **2.4 Inventario**: ya cubierto ("rechaza salida mayor que el stock (400)" en `productos.test.ts`).
- [x] **2.5 Aislamiento entre empresas**: nuevo `backend/tests/aislamiento-empresas.test.ts` con la lista completa de rutas protegidas por `requireEmpresa` (117 casos parametrizados). Con un usuario CONTADOR sin vínculo `UsuarioEmpresa` a la empresa B y cabecera `X-Empresa-Id` de B, **todas** responden 403. Nota: las rutas ADMIN-only (auditoría, usuarios, cierre anual POST, procesos DELETE, empresas de administración) devuelven 403 igualmente; `/api/procesos/cartera` es intencionalmente global (no usa `requireEmpresa` y solo lista las empresas vinculadas del usuario, sin fuga).
- [x] **2.6 Roles**: se verificó cobertura AUXILIAR-no-escribe en activos fijos (crear/depreciar/baja), provisión (parámetros), cierre anual (agregado), nómina (empleados/parámetros/liquidar), presupuesto, alertas (reglas), conciliación (crear/importar/aprobar), procesos (crear/marcar/notas/estado), adjuntos (eliminar). Sin huecos pendientes.

Resultado: `backend` `npm run build` OK y `npm test` 531/531 en 25 archivos; `frontend` `npm run lint` (0 errores) y `npm run build` OK. Commit `test(contable): endurecimiento de casos limite y aislamiento entre empresas`.

## Parte 3 — Diseño profesional de la interfaz (V2.2) ✅ COMPLETA

- [x] **Fase A — Sistema de diseño (design tokens)**: en `frontend/src/index.css` dentro de `:root` se definieron tokens de color (azul institucional `#1f4e79` serio no saturado, escala de grises, semánticos y semáforo formalizado `--semaforo-verde/ambar/rojo`), escala tipográfica (12/14/16/20/24/32px), escala de espaciado (4/8/12/16/24/32px), radios y elevación (reposo/hover/modal, 3 niveles). Fuente **Inter local** vía `@fontsource/inter` (sin CDN, se empaqueta en el build) e iconografía con `lucide-react`. Se migraron los componentes base (`.btn*`, badges, tablas, modales, semáforo) a tokens. Commit `f874baa`.
- [x] **Fase B — UI kit**: `frontend/src/components/ui/` con `Button` (primary/secondary/danger/ghost, sm/md, loading), `Field` + `TextInput`/`Textarea`/`Select` (label, requerido, hint, error), `Badge` (tonos semánticos y de estado), `Card`, `Modal` (accesible: ESC, backdrop, `aria-modal`, foco), `Table` (alineación, mono, zebra, estado vacío, footer). **Toast**: no se implementó porque no queda ningún `alert()`/`window.confirm` en el frontend (los confirm en Modales ya los cubre `Modal`) y el patrón establecido de mensajes inline (`error-msg`/`success-msg`) se mantiene. Commit `a87e2bf`.
- [x] **Fase C — Login, Layout y navegación**: Login rediseñado con marca/ícono y card sobre degradado; sidebar con grupos por ciclo del proceso, ícono por módulo, estado activo con acento y rol del usuario visible; topbar claro sticky con selector de empresa y chip de usuario/rol. Commits `ccc40e2`.
- [x] **Fase D — Pantallas de datos densos**: zebra + hover en tablas globales (`.table`), Comprobantes con UI Table/badges/botones con íconos y totales en detalle, Reportes (libro diario/mayor/balance con UI Table y totales destacados), Indicadores (tablas comparativas con UI kit). Commit `d1cd1a9`.
- [x] **Fase E — Resto de pantallas**: Dashboard con íconos por módulo, Resumen con tarjetas mejoradas, títulos/filtros con tokens, migración de colores sueltos a tokens en módulos CSS restantes. Commit `2ecd410`.
- [x] **Fase F — Accesibilidad y responsividad**: `:focus-visible` global, foco gestionado en Modal, contraste AA de `--muted`, breakpoints 1024px (sidebar 200px) y 768px (sidebar horizontal). Commit `c1ea1b0`.
- [x] **Fase G — QA visual Playwright**: capturas de las 24 pantallas en `docs/qa-v2.2-screenshots/*.png`, recorrido funcional de flujos clave sin regresiones y sin errores de consola/HTTP. Documentado en `docs/qa-v2.2.md`. Commit `docs(qa): ...`.

Resultado de cierre: `backend` `npm run build` OK y `npm test` 531/531 en 25 archivos; `frontend` `npm run lint` (0 errores) y `npm run build` OK. 8 commits de la Parte 3.

---

## Plan de cierre V1 (`instrucciones-opencode-cierre-v1.md`) — Partes 1-3 completas; Parte 4 parcial

### Parte 1 — `.form-row` (14 pantallas) ✅
- [x] `.form-row` reescrito de flex a **grid de ajuste automático** (`repeat(auto-fit, minmax(160px, 1fr))` + `label { min-width: 0 }`) en `frontend/src/index.css`; elimina el desborde horizontal en pantallas angostas en las 14 pantallas con formularios.
- [x] Fix de cascada: `.form-card.form-card-ancho { max-width: 100% }` (antes `.form-card-ancho` estaba muerta y ganaba el `max-width: 460px` de `.form-card`). Aplicado en **Cierre anual** y **Parámetros de nómina**.
- [x] QA visual Playwright en 6 pantallas (Cierre anual, Parámetros, Terceros, Clientes, Activos fijos, modal Comprobantes) sin desbordes. Commit `10831d5`.

### Parte 2 — Respaldo (diario, copia externa y alerta) ✅
- [x] 2.1 `programar-respaldo.ps1` acepta `-Day Daily` (trigger diario; default `Daily` a las 22:00).
- [x] 2.2 `backup.mjs` copia opcional externa con `BACKUP_COPIA_EXTERNA_DIR` (`.dump` + `.adjuntos.zip`, no fatal, registrado en `backup.log`). Probado en vivo: ruta disponible → copia OK; ruta ausente → `AVISO` y respaldo local intacto.
- [x] 2.3 Alerta `RESPALDO_DESACTUALIZADO`: enum nuevo + migración `20260807230111_alerta_respaldo_desactualizado`, regla por defecto (umbral 2 días) en `seed.ts`/`REGLAS_DEFECTO`, evaluación desde `backups/backup.log` (`lib/alertas.ts`) y panel actualizado (`AlertasPanel.tsx`).
- [x] Tests 4 unitarios (`ultimoRespaldoExitoso`) + 1 de integración de la regla. Commit `5d720cc`. Suite: 536/536.

### Parte 3 — Documentación y cierre V1 ✅
- [x] `CHANGELOG.md`: entrada `## [2.2.1] - 2026-08-07` (interfaz y respaldo). Revisadas 1.1.0/2.0.0/2.1.0/2.2.0.
- [x] `README.md`: sección "Estado del proyecto" al inicio (V1 completa y estable, multicliente, enlace a CHANGELOG) y recuadro histórico de etapas.
- [x] GitHub Release `v2.2.0`: **V1 completa y estable — sistema contable multicliente listo para producción** (https://github.com/camilohr/sistema-contable/releases/tag/v2.2.0). Commit `6d52019` (`docs: actualiza CHANGELOG y README, cierre de la etapa V1`).

### Parte 4 — Validación en red local (parcial) 
- [x] 4.1 Despliegue PM2: builds OK, app `contabilidad-backend` (2.2.0) en PM2 **online**, health `{"status":"ok"}`, la UI se sirve en `http://192.168.18.219:3000` (200). Firewall: pendiente que el usuario ejecute `scripts\abrir-puerto.ps1` como administrador (el entorno no puede elevar).
- [ ] 4.2 IP fija del servidor (reserva DHCP por MAC o IP estática): pendiente de fijar por el usuario.
- [ ] 4.3 Prueba desde un segundo equipo (incluido rol AUXILIAR): pendiente en vivo.
- [x] 4.4 Sección "Validación realizada" en `docs/despliegue.md` con IP, estado y checklist pendiente. Commit `3c8a4e5`.

Para cerrar la Parte 4 por completo, completar la validación pendiente documentada en
`docs/despliegue.md` (firewall con administrador, IP fija y prueba desde un segundo
equipo) y actualizar el registro con el resultado.
