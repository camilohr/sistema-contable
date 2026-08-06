# Progreso V2.2 — Cierre V2.1, endurecimiento contable y diseño profesional

Referencia: `instrucciones-opencode-v2.2.md`. Se actualiza al terminar cada **parte** completa.

## Parte 1 — Cierre de pendientes de V2.1 ✅ COMPLETA

- [x] **1.1 Versión y CHANGELOG**: entrada `## [2.1.0] - 2026-08-06` en `CHANGELOG.md` (cartera ADMIN, colisión CSS, 9 pantallas CSS Modules, persona natural/jurídica, 3 hallazgos QA corregidos). Bump a `2.1.0` en `backend/package.json` y `frontend/package.json` (no existe `package.json` en la raíz). Commit `9bf91e6` y tag `v2.1.0`.
- [x] **1.2 Migración a CSS Modules**: tras verificar la lista real, las 18 pantallas listadas (Dashboard, CambiarPassword, Auditoria, Periodos, ParametrosNomina, CierreAnual, Usuarios, Cuentas, Clientes, Indicadores, Presupuesto, Terceros, Empleados, Productos, ProvisionCartera, Cartera, ActivosFijos, Nomina) **no tienen clases CSS propias**: usan exclusivamente el sistema compartido de `index.css` (`.page`, `.table`, `.btn`, `.badge`, `.modal*`, `.form-card`, `.filters`, etc.). Se verificó que ninguna clase de `index.css` es exclusiva de una sola pantalla y que las 9 pantallas ya migradas encapsulan sus clases específicas. No se crearon `.module.css` vacíos.
- [x] **Convención camelCase**: se encontró que `Reportes.module.css` y `Resumen.module.css` definían clases en kebab-case mientras el TSX accede con camelCase (mismo bug del hallazgo #3 del QA V2.1) — esas clases no se aplicaban en runtime. Renombradas a camelCase en commits `a3b5258` y `24b8955`. Los 9 módulos quedan consistentes en camelCase.
- [x] **index.css**: contiene solo el sistema de diseño compartido (variables `:root`, `.btn*`, `.table`, `.modal*`, badges, semáforo, etc.). Verificado: ninguna clase es específica de una sola pantalla.

## Parte 2 — Endurecimiento funcional contable ⏳ PENDIENTE

- [ ] 2.1 Partida doble: rechazar 1 solo asiento, rechazar montos negativos, test de consecutivo concurrente (`Promise.all`).
- [ ] 2.2 Cierre anual: año ya cerrado rechazado, periodos no cerrados rechazados, asiento de cierre cuadra y cuentas 4-7 en cero.
- [ ] 2.3 Provisión/depreciación: test de duplicado bloqueado (`@@unique`) y test de redondeo sin desbalance.
- [ ] 2.4 Inventario: salida > existencia rechazada (no quedar negativo).
- [ ] 2.5 `backend/tests/aislamiento-empresas.test.ts`: todas las rutas `requireEmpresa` → 403 sin vínculo `UsuarioEmpresa`.
- [ ] 2.6 Roles: AUXILIAR no puede escribir en activos fijos, cierre anual, provisión, nómina, presupuesto, alertas, conciliación, procesos.

## Parte 3 — Diseño profesional de la interfaz (V2.2) ⏳ PENDIENTE

- [ ] Fase A — Sistema de diseño (tokens en `:root`, tipografía local, espaciado, elevación, `lucide-react`).
- [ ] Fase B — UI kit `frontend/src/components/ui/` (Button, Input, Select, Textarea, Badge/StatusPill, Card, Modal, Table, Toast).
- [ ] Fase C — Login, Layout, navegación.
- [ ] Fase D — Pantallas de datos densos (Comprobantes, Reportes, Indicadores).
- [ ] Fase E — Resto de pantallas + cierre de CSS Modules.
- [ ] Fase F — Accesibilidad y responsividad (~1024px).
- [ ] Fase G — QA visual Playwright + `docs/qa-v2.2.md`.
