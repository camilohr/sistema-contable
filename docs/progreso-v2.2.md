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

## Parte 3 — Diseño profesional de la interfaz (V2.2) ⏳ PENDIENTE

- [ ] Fase A — Sistema de diseño (tokens en `:root`, tipografía local, espaciado, elevación, `lucide-react`).
- [ ] Fase B — UI kit `frontend/src/components/ui/` (Button, Input, Select, Textarea, Badge/StatusPill, Card, Modal, Table, Toast).
- [ ] Fase C — Login, Layout, navegación.
- [ ] Fase D — Pantallas de datos densos (Comprobantes, Reportes, Indicadores).
- [ ] Fase E — Resto de pantallas + cierre de CSS Modules.
- [ ] Fase F — Accesibilidad y responsividad (~1024px).
- [ ] Fase G — QA visual Playwright + `docs/qa-v2.2.md`.
