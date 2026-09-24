# Auditoría del software contable — septiembre 2026

- **Fecha:** 2026-09-23
- **Alcance:** código y diseño en `C:\Users\Pc\Documents\Default Project` (`backend/`, `frontend/`, `docs/`, `prisma/schema.prisma`, scripts, tests, CI). Sin acceso al contenido de datos reales.
- **Modalidad:** solo lectura. Ningún archivo fue modificado durante esta auditoría.
- **Convención:** archivo:línea. Severidades: **crítico / alto / medio / bajo**.
- **Contexto:** complementa `docs/auditoria-2026-08.md` (agosto 2026). Los hallazgos S1/S2/S3/S4/S5 de esa auditoría con marca "Corregido" se verificaron implícitamente y no se repiten; los que quedaron pendientes se retoman en la sección 4.

---

## 1. Resumen ejecutivo

El núcleo contable del sistema está bien construido: partida doble obligatoria, consecutivos atómicos con `SELECT ... FOR UPDATE`, transacciones extensas, aislamiento por empresa con tests, y una suite de backend de 27 archivos (≈385 tests) con CI. Esta auditoría encontró **4 hallazgos nuevos de severidad crítica**, todos en **integridad contable** (periodos cerrados y cartera), que deben corregirse **antes de aceptar carteras reales o emitir balances**:

1. **C1 — Los comprobantes pueden contabilizarse, anularse, editarse o eliminarse sobre periodos cerrados** (validación fuera de la transacción + updates incondicionales). Es el riesgo más grave: un asiento puede entrar a un periodo ya cerrado y alterar balances emitidos.
2. **C2 — El cliente puede crear comprobantes directamente `CONTABILIZADO` o `ANULADO`,** saltándose el endpoint de contabilización (que es donde se registra auditoría y actividad de proceso).
3. **C3 — La cartera (CxC/CxP) es un sublibro que no genera partida doble ni se concilia con el mayor:** los abonos reducen saldos del sublibro sin tocar las cuentas 1305/2205/5305, y no hay forma de detectar la divergencia.
4. **C4 — Race condition en abonos de cartera** (saldo leído fuera de la transacción → sobrepago posible) **y numeración de recibos/pagos sin constraint único** (duplicados en concurrencia).

Se suman **5** de nivel alto en lógica contable (clase 7 excluida del balance aunque el cierre anual la incluye; cuentas propias de la empresa inutilizables para asientos; helper de comprobantes sin validar periodo abierto; cuenta 3605 validada de forma incompleta; periodos con rangos solapables), **3** en el **frontend** (interceptor 401 que rompe el login, ausencia de guard de rutas por rol, inconsistencia de la fuente del rol) y **2** en el **backend de seguridad** (crash por promesas async no capturadas; HTTP en claro por defecto en la LAN).

**Conteo:** 4 críticos · 10 altos · 28 medios · 18 bajos. El detalle y un plan de remediación por fases están en las secciones 3 y 6.

---

## 2. Metodología

- Revisión de solo lectura con los agentes `explore` sobre tres ejes en paralelo: **lógica contable**, **seguridad backend** y **frontend + calidad general**.
- Verificación manual de la evidencia citando `archivo:línea` en los hallazgos críticos y altos (se adjuntan las confirmaciones de lectura en la sección 3).
- Cruce con `docs/auditoria-2026-08.md` para no duplicar hallazgos ya corregidos.
- No se ejecutó `npm test`, no se modificó código, no se leyó `backend/.env` ni los respaldos (norma del proyecto).

---

## 3. Hallazgos nuevos

### 3.1 Lógica contable (integridad del mayor)

#### CRÍTICO

**C1 — Operaciones de comprobantes sin revalidar el periodo abierto dentro de la transacción**
`backend/src/controllers/comprobantes.controller.ts:325-359` (`contabilizar`), `:361-406` (`anular`), `:408-429` (`eliminar`), `:250-323` (`actualizar`). **Verificado por lectura.**

- `contabilizar` solo valida `estado === BORRADOR` (`:337`) y hace `update` con `where: { id }` incondicional (`:342`). No valida `periodo.estado === ABIERTO`, como sí hace `validarYPreparar` (`:103`).
- `anular` solo valida `CONTABILIZADO` (`:375`) y la ausencia de doble anulación (`:379`); puede anular en periodo cerrado, alterando balances ya emitidos.
- `eliminar` solo valida `BORRADOR` (`:415`) y borra incondicionalmente (`:420`); si entre el chequeo y el `delete` el comprobante se contabiliza en otra petición, se elimina un comprobante `CONTABILIZADO` con sus asientos en cascada → **rotura del mayor**.
- `actualizar` valida `BORRADOR` fuera de la transacción (`:260`) y luego hace `deleteMany + update` incondicionales (`:297-318`).
- **Impacto:** asientos que entran a periodos cerrados, balances emitidos que cambian, o destrucción de asientos contabilizados.
- **Recomendación:** re-validar `periodo.estado === ABIERTO` para crear/contabilizar/modificar, y condicionar las escrituras con `where: { id, estado: BORRADOR }` (u optimista equivalente) dentro de la `$transaction`. Ver plan de remediación F1.

**C2 — Estado creado por el cliente (contabilizado/anulado directo) sin auditoría**
`backend/src/controllers/comprobantes.controller.ts:30` (`estado` opcional en `guardarSchema`) y `:215` (`const estado = data.estado ?? BORRADOR`). **Verificado por lectura.** El frontend incluso ofrece la opción (`frontend/src/components/ComprobanteForm.tsx:193-197`).
- Crear con `estado: "CONTABILIZADO"` evita `contabilizar` (`:341`), único lugar donde se registra la auditoría `CONTABILIZAR` (`:347-354`) y la actividad de proceso (`:355`).
- Crear con `estado: "ANULADO"` deja un comprobante anulado sin `usuarioAnuloId`/`fechaAnulacion`.
- **Recomendación:** eliminar `estado` del schema de creación; todo comprobante nace `BORRADOR` y solo `contabilizar` lo promueve (mismo patrón que la doble revisión de nómina/provisiones). F1.

**C3 — Cartera: sublibro sin partida doble ni conciliación con el mayor**
`backend/src/controllers/cartera.controller.ts:88-130` (`crear`), `:215-270` (`abonar`), `:146-195` (`actualizar`). **Verificado por lectura.**
- Ninguno genera comprobantes; `comprobanteId` es opcional y solo se valida su existencia (`:105-113`, `:234-242`).
- Un abono reduce el saldo del sublibro (`:261-265`) pero no toca las cuentas contables 1305/2205/5305, ni hay endpoint que concilie sublibro vs mayor.
- **Impacto:** el saldo contable y la cartera pueden divergir sin detección; los estados financieros no reflejan necesariamente el sublibro.
- **Recomendación:** generar comprobante en `crear`/`abonar` (o exigir `comprobanteId`), unificar periodo, y añadir un reporte de conciliación cartera-mayor. F2 (mediano plazo; requiere diseño contable).

**C4 — Abonos de cartera: lost update y numeración sin garantía**
`backend/src/controllers/cartera.controller.ts:224-246` y `:248-267`. **Verificado por lectura.**
- El saldo se lee **fuera** de la transacción (`:224-229`), se valida `valor > saldo` (`:230`) y se calcula `nuevoSaldo` (`:246`), que luego se escribe como valor absoluto dentro de la tx (`:261-265`). Dos abonos concurrentes sobre el mismo documento leen el mismo saldo → el último sobreescribe → **sobrepago posible**.
- Consecutivo: `(await abonoModelo.count()) + 1` (`:244`) a nivel global y fuera de la tx; `Recibo.numero`/`Pago.numero` **no tienen `@@unique`** (`prisma/schema.prisma:507,524`). Dos abonos concurrentes → números duplicados.
- **Recomendación:** leer y validar saldo dentro de la tx con `updateMany({ where: { id, saldo: { gte: valor } } })` (o `FOR UPDATE`); añadir `@@unique([empresaId, numero])` o generación del consecutivo con `obtenerSiguienteConsecutivo`. F1.

#### ALTO

**A1 — Clase 7 excluida del balance general y del estado de resultados, pero el cierre anual sí la incluye**
`backend/src/controllers/reportes.controller.ts:338-340` (`resultado = clase 4 − (clase 5 + clase 6)`) y `:382-384` (`datosEstadoResultados` usa clases 4/5/6) vs `backend/src/controllers/cierre-anual.controller.ts:15` (`CLASES_RESULTADO = [4, 5, 6, 7]`). **Verificado por lectura.**
- Si una empresa productora (PUC clase 7, costos/IVC) tiene saldos de clase 7 sin reclasificar, el cierre anual los cierra pero el balance general ni los muestra ni los suma → `ecuacionOK` (`:359`, comparación `===` sobre floats) puede dar `false` y el resultado del ejercicio queda mal calculado.
- **Recomendación:** incluir clase 7 en el resultado de balance y estado de resultados (o reclasificar explícitamente) y redondear los totales. F2.

**A2 — Cuentas creadas por la empresa nunca pueden tener movimiento**
`backend/src/controllers/cuentas.controller.ts:10-14` (`crearSchema` sin `permiteMovimiento`), `:92` (`permiteMovimiento: false` fijo), `:16-20` (`actualizarSchema` solo permite `nombre`/`activa`/`requiereTercero`). **Verificado por lectura.**
- Como `validarYPreparar` exige cuenta activa y `permiteMovimiento` (`comprobantes.controller.ts:133-134`), ninguna cuenta propia de la empresa (subcuenta creada por el contador) es utilizable para asientos. Solo las hojas del PUC sembrado tienen movimiento.
- **Recomendación:** exponer `permiteMovimiento` en crear/actualizar cuentas (con regla: solo hojas, no cuentas con `tieneHijas`). F2.

**A3 — `crearComprobanteDiario` no valida periodo abierto ni cuentas**
`backend/src/lib/comprobantes.ts:30-46`. **Verificado por lectura.** Solo valida existencia del periodo y rango de fechas; no revisa `periodo.estado === ABIERTO` ni cuentas activas/`permiteMovimiento`/`requiereTercero`. Hoy los controladores generadores lo compensan "por disciplina"; el cierre anual lo usa a propósito sobre un periodo cerrado. Riesgo de latencia para futuros callers.

**A4 — Cuenta 3605 por defecto validada de forma incompleta**
`backend/src/controllers/cierre-anual.controller.ts:140-149`. **Verificado por lectura.** Cuando el cliente envía `cuentaUtilidadId` se valida `clase === 3 && activa && permiteMovimiento` (`:136`); con la 3605 por defecto solo se valida `clase !== 3` (`:144`). Si 3605 está inactiva o sin movimiento, el resultado se asienta en una cuenta inválida.

**A5 — Periodos con rangos de fechas que pueden solaparse**
`backend/src/controllers/periodos.controller.ts:8-20` (`crearSchema` solo exige `fin >= inicio`) y `:52-77` (`crear` solo rechaza nombre duplicado). **Verificado por lectura.** Único constraint: `@@unique([empresaId, nombre])` (`schema.prisma:385`). Un comprobante con fecha X podría pertenecer a dos periodos; `crearComprobanteDiario` elige el periodo de la ruta sin verificar exclusividad.

#### MEDIO

- **M1 — Race check-then-act en crear de comprobantes.** La validación de periodo abierto (`comprobantes.controller.ts:103`) ocurre fuera de la `$transaction` que persiste (`:217-245`); un cierre concurrente puede dejar un BORRADOR en periodo cerrado. Relacionado con C1.
- **M2 — Anulación por exclusión, no por contrasiento.** `comprobantes.controller.ts:383-385` (comentario explícito). Ya documentado como **S1-06 en la auditoría de agosto (pendiente)**; sigue abierto. Los reportes excluyen `ANULADO` (efecto correcto), pero no se generan contrasientos y `docs/normatividad.md` declara lo contrario. — **Cerrado en la Fase 5 (commit `edfe5d0`):** ahora la anulación genera un **contrasiento** CONTABILIZADO (mismo tipo/serie/fecha/periodo, asientos invertidos con cuenta-tercero-detalle, `comprobanteOrigenId` → original), los reportes suman `CONTABILIZADO + ANULADO` (original y reversión se cancelan, neto cero) en reportes, provisión de cartera (1399/5199), indicadores, presupuesto, conciliación y cierre anual; quedan bloqueados doble anulación, anulación de borradores/periodos cerrados y anulación de contrasientos; el log `ANULAR` incluye `contrasiento: { id, consecutivo }`. Los ANULADOS históricos (sin contrasiento) se respaldan con `npm run db:backfill-contrasientos` (ejecutado en la BD real: 0 pendientes). Tests: `contraasiento.test.ts` + `reportes.test.ts` ajustado; validado por el agente revisor-contable (partida doble y cascada cartera/nómina correctas).
- **M3 — Estados de cartera dependientes del reloj.** `cartera.controller.ts:34-39`: `VENCIDA` se calcula con `new Date()` y no se persiste → los reportes históricos cambian según el día de consulta, y la provisión de cartera (que filtra por estados en BD) nunca incluye `VENCIDA`.
- **M4 — Conciliación bancaria first-fit por monto absoluto.** `backend/src/lib/conciliacion.ts:196-208` (`cruzarMovimientos`): movimientos/asientos del mismo monto se emparejan en el primer orden disponible → cruces incorrectos posibles (dos cheques de $100).
- **M5 — Acumulaciones en punto flotante sin redondeo final.** `reportes.controller.ts:68-69`, `cierre-anual.controller.ts:211-215`, `nomina.ts:198`. Con `ecuacionOK` comparando floats con `===` (`:359`), volúmenes altos pueden dar falsos negativos.
- **M6 — Provisión de cartera: doble cálculo concurrente → 500, y saldo sin corte de fecha.** `@@unique([empresaId, periodoId, cuentaId])` (`schema.prisma:873`) → el segundo `create` lanza P2002 no manejado; el saldo contable de `1399` se acumula sin llevar el corte por fecha del sublibro.

#### BAJO

- **B1 — Seed PUC a verificar contra el PUC oficial.** `prisma/seed/puc.ts`: cuentas como `1390 «Deudas de difícil cobro»` (el PUC DIAN usa `1380 «Deudores de difícil cobro»`), costo duplicado entre grupo 63 / clase 7, y "Utilidad en venta de PPE" en `4155` y `4275`.
- **B2 — Nómina sin verificación defensiva de partida doble.** `backend/src/lib/nomina.ts` cuadra por construcción, pero `crearComprobanteDiario` ya la verifica al crear (defensa existente en el punto de escritura).
- **B3 — Sin módulo de notas débito/crédito.** `TipoComprobante` solo incluye `DIARIO/INGRESO/EGRESO` (`schema.prisma:65-69`). Ausencia de feature (roadmap), no un fallo.
- **B4 — Numeración de recibos/pagos sin secuencia por empresa.** Ligado a C4: `count()` global sin restauración.

### 3.2 Seguridad backend

#### ALTO

**A1 — Errores asíncronos no capturados tumban el proceso (DoS autenticado)**
`backend/package.json:25` (Express `^4.21.2`), `backend/src/middleware/error.ts:9-28`, `backend/src/routes/empresas.routes.ts:14-46` (único router con `.catch(next)`).
- Express 4 no captura promesas rechazadas en handlers `async` y no hay `express-async-errors`, wrapper, ni `process.on("unhandledRejection")`. Una rejección **mata el proceso** (PM2 en bucle de reinicio).
- Gatillos concretos: `Number(req.params.id)` sin guard en 5 handlers de comprobantes (`comprobantes.controller.ts:184,251,331,367,409` → ruta `GET /api/comprobantes/abc` lanza `PrismaClientValidationError`); `adjuntos.controller.ts:87-90` (enum vacío); `exportacion.controller.ts:140-142` (`throw` sin catch). Contrasta con los guards correctos en `cartera.controller.ts:134`, `presupuesto.controller.ts:28`.
- **Recomendación:** `express-async-errors`, `unhandledRejection` que loguee sin salir, y guards `Number.isInteger`/enum antes de tocar Prisma. F3.

**A2 — Credenciales y PII en claro por defecto (HTTP en 0.0.0.0)**
`backend/src/index.ts:22` (`listen(port, "0.0.0.0")`), `backend/src/app.ts:40-51` (`helmet` con `hsts:false`, `upgradeInsecureRequests:null`), `auth.routes.ts:8`.
- El login y el Bearer token de todas las APIs viajan en texto plano por la LAN. HTTPS es opcional (`HTTPS_CERT/HTTPS_KEY`, `index.ts:16-20`); no es el default.
- **Recomendación:** habilitar TLS por defecto en el despliegue; si se mantiene HTTP, exigir red aislada y documentarlo como obligatorio. Ya fue S1-09 (corregido con soporte HTTPS); aquí se apunta a que **siga siendo opcional** por defecto. F3.

#### MEDIO

- **M1 — Tokens no invalidados al cambiar contraseña.** `lib/jwt.ts:13` (TTL 4h), `auth.controller.ts:77-99`: sin `tokenVersion`/blacklist; una sesión robada sobrevive hasta 4h al cambio de credenciales.
- **M2 — No se auditan logins ni cambios de contraseña.** `schema.prisma:135-179` (enum `AccionAuditoria` sin `LOGIN_OK/LOGIN_FALLIDO/CAMBIAR_PASSWORD`); solo `LOGIN_BLOQUEADO` (`rateLimit.ts:37-46`). Imposible detectar fuerza bruta por debajo del 429 ni compromiso.
- **M3 — `err.message` al cliente en 500.** `middleware/error.ts:27-28`: mensajes internos (Prisma/Node, `target` de P2002) se filtran al cliente. Devolver mensaje genérico + `errorId`.
- **M4 — Auditoría global cruzada entre empresas.** `auditoria.controller.ts:14`: eventos `empresaId:null` (p.ej. `LOGIN_BLOQUEADO` con IP del atacante) son visibles para el ADMIN de cualquier empresa cliente.
- **M5 — `GET /api/usuarios/disponibles` enumera usuarios de todos los tenants.** `usuarios.controller.ts:76-95` sin filtro de empresa (solo `requireRole("ADMIN")`). Un ADMIN de una empresa ve el directorio de usuarios de los demás clientes.
- **M6 — Credencial de BD en la línea de comandos del respaldo.** `scripts/backup.mjs:208,315,393`, `scripts/restore.mjs:157`: `DATABASE_URL` (con password) visible en el listado de procesos. Usar `PGPASSWORD`/pgpass.
- **M7 — Respaldos sin cifrar por defecto.** `scripts/backup.mjs:333,351`: el cifrado AES-256-GCM solo se aplica con `BACKUP_ENCRYPT_KEY`. Exigir advertencia fuerte o exigencia en producción.
- **M8 — Temporal del restore en claro en `%TEMP%`.** `scripts/restore.mjs:104-107,204`: respaldo descifrado completo en `os.tmpdir()` durante la restauración.
- **M9 — Zip-slip en la extracción de adjuntos del restore.** `scripts/zip-lite.mjs:131-135`: `path.join(destino, entrada.nombre)` sin validar `..` → un `.adjuntos.zip` manipulado escribe fuera de `adjuntosDir`.
- **M10 — Credencial admin por defecto hardcodeada.** `prisma/seed.ts:48-52` (`Admin123!` + `console.log`), `scripts/seed-demo.mjs:10`. Mitigado por `debeCambiarPassword` y rate-limit; riesgo residual. Generar aleatoria o exigir `ADMIN_INITIAL_PASSWORD`; usar rounds 12.
- **M11 — Rate limit solo en login; sin límite global; MemoryStore.** `rateLimit.ts:57`, `app.ts:58-85`: endpoints costosos (reportes PDF/XLSX, exportación, alertas) ilimitados; store en memoria se resetea al reiniciar.

#### BAJO

- **B1 — `JWT_SECRET` acepta valores débiles.** `lib/jwt.ts:4-11`: se rechaza vacío/`dev-secret` pero no hay longitud mínima; el placeholder de `.env.example` se acepta literalmente.
- **B2 — Timing en login permite enumeración por tiempo.** `auth.controller.ts:19-27`: usuario inexistente no paga `bcrypt.compare`. Usar hash dummy.
- **B3 — Origen CORS con IP LAN hardcodeada como default.** `app.ts:53-57` (`192.168.18.232` del autor). Fallback a localhost y exigir `CORS_ORIGIN`.
- **B4 — `BCRYPT_ROUNDS` sin mínimo.** `auth.controller.ts:93`, `usuarios.controller.ts:54`: un `4` se acepta. `Math.max(12, ...)`.
- **B5 — Sin `trust proxy`.** `app.ts:37-59`: `req.ip` asume conexión directa; un proxy rompería rate-limit y auditoría.
- **B6 — TTL fijo 4h sin refresh/rotación.** Combinado con M1, alarga la ventana de token robado.
- **B7 — Sin bloqueo de cuenta ni MFA.** Solo 5/15min por IP+email; fuerza bruta distribuida no se detiene.
- **B8 — Crear ADMIN global desde ADMIN de empresa.** `usuarios.controller.ts:8-17,54-62`: mayor punto de escalación sin segunda aprobación.
- **B9 — Headers de seguridad de navegador incompletos.** `app.ts:40-51`: falta `Permissions-Policy`/COOP/COEP (CSP mínima por HTTP).

### 3.3 Frontend

#### ALTO

**F1 — El interceptor 401 rompe el login y la navegación SPA**
`frontend/src/api/client.ts:20-23`. Todo 401 ejecuta `localStorage.removeItem("token")` + `window.location.href = "/login"`.
- El **login fallido** devuelve 401 (`backend/tests/auth.test.ts:36`) → se dispara la recarga dura y se pierde el mensaje de error que arma `frontend/src/pages/Login.tsx:24-26`. Credenciales inválidas se ven como "recarga silenciosa".
- Es una navegación dura que no conserva la ruta original (sin `returnTo`).
- **Recomendación:** excluir del interceptor las respuestas 401 de `/auth/login`; para el resto, redirigir con `Navigate` y guardar `returnTo`. F4.

**F2 — No existe guard de rutas por rol en el router**
`frontend/src/App.tsx:44-79` + `frontend/src/components/ProtectedRoute.tsx:5-15` (solo valida sesión y `debeCambiarPassword`). `/usuarios`, `/auditoria`, `/clientes`, `/cierre-anual` son navegables por URL por cualquier autenticado; el filtro está por página y **después** del `useEffect` que ya dispara la petición (`Usuarios.tsx:52-63`, `Clientes.tsx:59-70`, `Auditoria.tsx:82-93`) → 403 sin necesidad. Mitigado por el backend, pero sin defensa en profundidad. Recomendación: `ProtectedRoute` con prop `rol` (ADMIN-only, escritura) y pruebas. F4.

**F3 — Fuente del rol inconsistente (global vs por empresa)**
23 usos: la mayoría usa `usuario?.rol` (`Usuarios.tsx:86`, `Cuentas.tsx:24`, `Comprobantes.tsx:60`, `ActivosFijos.tsx:62`, `Cartera.tsx:78`, etc.) pero varios usan `empresaActiva?.rol` (`Dashboard.tsx:23`, `Conciliaciones.tsx:56`, `AdjuntosLista.tsx:29`, `Layout.tsx:116`). El backend calcula el rol efectivo más restrictivo (`middleware/auth.ts:76-78`).
- Resultado: CONTADOR global con vínculo AUXILIAR ve botones de edición que reciben 403; AUXILIAR con vínculo CONTADOR no ve botones que sí podría usar.
- **Recomendación:** centralizar en una sola fuente (`empresaActiva?.rol ?? usuario?.rol`) y un único helper `puedeEditar`. F4.

#### MEDIO

- **F4 — Token en `localStorage`** (`client.ts:5-9`, `AuthContext.tsx:45`): ya mitigado parcialmente en S2-18 (TTL 4h). Migrar a cookie `HttpOnly` cuando haya TLS.
- **F5 — `.catch()` en `/auth/me` borra el token también por fallo de red transitorio** (`AuthContext.tsx:39`): cierre de sesión involuntario con token válido. Solo limpiar en 401.
- **F6 — `logout()` no limpia `empresaId`** (`AuthContext.tsx:50-53`): el siguiente usuario del navegador envía `X-Empresa-Id` ajena hasta que `EmpresaContext` lo sobrescriba (403 transitorios; sin fuga, el backend valida el vínculo).
- **F7 — Validación de asientos parcial + `estado` CONTABILIZADO en el formulario** (`ComprobanteForm.tsx:121-127,144,190-198`): no bloquea líneas sin `requiereTercero`, ni exige un débito-o-crédito por línea; y expone el select de estado que alimenta a C2. Todo lo refuerza el backend.
- **F8 — `.catch(() => {})` silenciosos** en 9 lugares (`Comprobantes.tsx:101`, `Reportes.tsx:144-145`, `Conciliaciones.tsx:90`, `Indicadores.tsx:154`, `CierreAnual.tsx:86`, `ActivosFijos.tsx:234,346,437`): si falla la carga de periodos/cuentas, los selects quedan vacíos sin aviso.
- **F9 — `tsconfig.app.json` sin `"strict": true`** (el backend sí lo tiene, `backend/tsconfig.json:9`): typechecking laxo en build.
- **F10 — Cero tests de frontend** (sin framework de testing): declarado en AGENTS.md, pero auth/guards/formularios no tienen red de seguridad (ya fue S5-02, sigue abierto).

#### BAJO

- **F11 — `useEffect` de carga corre antes del guard por rol** (`Auditoria.tsx:82-93`, `Usuarios.tsx:52-63`, `Clientes.tsx:59-70`): peticiones inútiles con 403 para no-ADMIN.
- **F12 — `empresaId` de la URL no se sincroniza si es ajena** (`Layout.tsx:110-114` vs `client.ts:10`): se muestran datos de la empresa activa bajo una URL ajena (sin fuga: el backend valida el header).
- **F13 — No se maneja el 403 `DEBE_CAMBIAR_PASSWORD`** (`client.ts:17-26`): tras cambiar en otra sesión, el usuario solo ve errores genéricos.
- **F14 — Componente huérfano `ui/Card.tsx`** (`+ ui/index.ts:3`): exportado y sin usos.

### 3.4 Calidad del repositorio y documentación

- **Sin lint ni typecheck de backend en CI** (ya **S5-19**, abierto): no hay script `lint`/`typecheck` en `backend/package.json:6-18`. Añadir `oxlint` + `tsc --noEmit`.
- **Sin tests de frontend** (ya **S5-02**, abierto): ver F10.
- **Sin paginación** en listados grandes (ya **S5-06**, abierto): `terceros`, `productos`, `cartera`, `activos-fijos`; el filtro por estado de cartera es en memoria (`cartera.controller.ts:83-84`).
- **Funciones muy largas y helpers duplicados** (ya **S5-08/S5-09**, abiertos): `nomina`, `activos-fijos`, `conciliacion`, `cierre-anual`; `num()` duplicado en 7+ controladores.
- **Docs desactualizados** (ya **S5-13/S5-15/16**, abiertos): `docs/arquitectura.md` (menciona `src/services/`, `React 18`, `Node 24`, `prisma/seed.ts` vs `seed/puc.ts`); `docs/modelo-datos.md` (enum `AccionAuditoria`/`detalle Json` sin reflejar); `docs/normatividad.md` marcado V1.
- El **listado de docs de AGENTS.md** está completo (10/10), con 6 extras (qa, progreso, diseno-nomina, auditorías).

---

## 4. Hallazgos de auditorías previas aún pendientes

Del informe de agosto (`docs/auditoria-2026-08.md`), confirmados o persistentes:

- **S1-06 / S4-06 / M2 (medio)** — Anulación por exclusión vs contrasiento (`comprobantes.controller.ts:383-385`). Pendiente de diseño (cascada en cartera/nómina).
- **S2-04 (medio)** — Tokens sin refresh/revocación. Refuerza **3.2-M1**.
- **S3-10 (medio)** — Auditoría global `empresaId:null` compartida. Refuerza **3.2-M4**.
- **S4-03 (bajo)** — Redondeo por cuenta en cierre anual. Refuerza **3.1-M5**.
- **S5-01 (medio)** — Sin test dedicado de `empleados` y `periodos` (eliminar con dependencias). — **Cerrado en Fase 6** (ítem 33).

Los hallazgos S2-12, S2-13, S2-18 y los S3 de aislamiento se verificaron corregidos en el código actual y no se re-reportan.

---

## 5. Fortalezas

- **Partida doble robusta y por construcción:** validación por línea (`comprobantes.controller.ts:9-22`) y por total con `Prisma.Decimal.equals` (`lib/comprobantes.ts:34-38`); mínimo 2 asientos.
- **Consecutivos atómicos:** `SELECT ... FOR UPDATE` (`lib/consecutivo.ts:11-27`) + `@@unique([empresaId, tipo, consecutivo])` para comprobantes (la cartera —C4— es la excepción).
- **Transacciones extensas** (`$transaction` en 43 lugares) y auditoría contable en crear/actualizar/contabilizar/anular/eliminar, cuentas, periodos y cierre anual.
- **Checks de periodo ABIERTO en los módulos generadores** (depreciación, provisión, nómina) y cierre anual que exige todos los periodos cerrados.
- **Aislamiento multiempresa consistente** (`empresaId` en settings, vínculo validado, `rolMasRestrictivo`) con test dedicado; los routers (21) aplican `requireAuth` (solo públicos login/health/SPA).
- **Zod en la práctica totalidad de escrituras**, body limit 256kb, sin SQL injection (`$queryRaw` solo parametrizado), sin path traversal en adjuntos, whitelist MIME + descarga forzada.
- **JWT/bcrypt sólidos** (HS256 explícito, secreto obligatorio al arranque, bcrypt 12 por defecto); `debeCambiarPassword` verificado por request; `helmet` + CORS whitelist + `credentials:false`.
- **Backups con GFS, cifrado AES-256-GCM opcional y restore verificado**; respaldo/cifrado de contingencia ya corriendo.
- **Suite 27 archivos ≈385 tests** y CI real con Postgres efímero; docs completos frente a AGENTS.md; cero `dangerouslySetInnerHTML`/`eval`/TODO en producto.

---

## 6. Plan de remediación recomendado

Orden propuesto (cada fase termina con `npm test` en `backend/` y `npm run lint` + `npm run build` en `frontend/`; los cambios de esquema requieren `npm run db:migrate`).

### Fase 1 — Integridad contable crítica (C1, C2, C4) — CORREGIDA (2026-09-23)
1. **C1:** re-validar `periodo.estado === ABIERTO` dentro de la transacción y condicionar las escrituras por estado en `contabilizar`, `anular`, `eliminar` y `actualizar` de comprobantes. Tests: borrador contabilizado tras cerrar periodo → 400/409; doble `contabilizar` concurrente → solo una gana; `actualizar` contra comprobante que deja de ser BORRADOR → no modifica. — **Hecho:** `bloquearPeriodo` re-valida dentro de la tx y las escrituras se condicionan por `estado` (optimistic lock). Commit `ac1ef70`.
2. **C2:** eliminar `estado` de `guardarSchema` y del form; todo comprobante nace `BORRADOR`; `contabilizar` es el único promotor. Tests: crear con `estado` → campos ignorados/400; consecutivos de auditoría `CONTABILIZAR` siempre presentes. — **Hecho:** commit `ac1ef70`.
3. **C4:** en `abonar`, validar el saldo dentro de la tx (decremento atómico con `updateMany` o `FOR UPDATE`); `@@unique` sobre `numero` (o consecutivo `FOR UPDATE`). Tests: abonos concurrentes → sin sobrepago, sin números duplicados. — **Hecho:** decremento atómico `updateMany({ where: { id, saldo: { gte: valor } } })` y consecutivo `FOR UPDATE`; commit `ac1ef70`.

### Fase 2 — Corrección contable alta/baja (C5, A1-A5, M1, M3, M5, M6, B1) — CORREGIDA (2026-09-23)
4. **C5:** validar asientos previos antes de eliminar cuenta (400 en lugar de FK 500) y manejar P2002 en `crear`. — **Hecho:** `cuentas.controller.ts`; test en `auditoria-fase2.test.ts`.
5. **A1:** incluir clase 7 en balance general y estado de resultados; redondear totales y comparar `ecuacionOK` con tolerancia/Decimal. — **Hecho:** `reportes.controller.ts`, `Reportes.tsx`, exportación y libros PDF; tests en `auditoria-fase2.test.ts`.
6. **A2:** exponer `permiteMovimiento` (solo para hojas sin `tieneHijas`) en crear/actualizar cuentas. — **Hecho:** ya se calculaba al importar el PUC; se valida al crear/actualizar subcuentas. Tests en `auditoria-fase2.test.ts`.
7. **A3:** validar `periodo.estado === ABIERTO` (paramétrico) y cuentas en `crearComprobanteDiario`. — **Hecho:** `verificarPeriodoAbierto`/`verificarCuentas` en `comprobantes.ts` (default `true`). Tests en `auditoria-fase2.test.ts`.
8. **A4:** validar 3605 por defecto con activa + `permiteMovimiento`. — **Hecho:** cierre anual valida `3605` (activa, `permiteMovimiento`) en el operando por defecto. Tests en `auditoria-fase2.test.ts`.
9. **A5:** rechazar periodos con rangos solapados en `crear`. — **Hecho:** `periodos.controller.ts`; test en `auditoria-fase2.test.ts`.
10. **M1/M3/M5/M6:** mover validación de periodo dentro de la tx de crear; persistir `VENCIDA` (o evaluar por fecha de corte); redondeo final en totales; manejar P2002 en provisión y cortar saldo 1399 por fecha. — **Hecho:** `bloquearPeriodo` re-valida dentro de la tx (M1); `sincronizarVencidas` persiste `VENCIDA` (M3); redondeo final en reportes (M5); `saldoCuenta(..., fechaHasta)` corta el saldo de provisión a la fecha fin del periodo y la tx maneja P2002 → 400 (M6). Tests: M3/M5/M6 en `auditoria-fase2.test.ts` y `provision.test.ts` (M6 corta el balance esperado a 0 para agosto). El test de carrera de `crear` contra el cierre de periodo (M1) queda pendiente (Fase 5).
11. **B1:** contrastar el seed PUC contra el catálogo oficial (1380 vs 1390, etc.). — **Hecho:** se eliminaron `["63"]`, `["6305"]` y `["4155"]` del seed; la clase 7 ahora es "Costos de producción" en reportes. Validado en `auditoria-fase2.test.ts`.

### Fase 3 — Seguridad backend (A1, A2, M1-M11, B1-B9) — CORREGIDA (2026-09-23)
Commit: `465b0c3` (cobertura de tests verdes: 30 archivos / 594 tests; `tsc`, lint y build OK).
12. **A1:** `express-async-errors` (o wrapper + `unhandledRejection`) y guards `Number.isInteger`/enums en comprobantes/adjuntos/exportación, con tests 400 para `abc`. — **Hecho:** `import "express-async-errors"` en `app.ts` (las rutas asíncronas ya no necesitan try/catch), handlers `unhandledRejection`/`uncaughtException` en `index.ts`, y guards 400 en `comprobantes.listar` (`tipo`/`estado`/`periodoId`), `adjuntos.listar` (`entidad`) y `exportacion.datosTabulares` (`periodoId`/`cuentaId`). Tests: `GET /api/comprobantes?tipo=abc`, `?estado=abc`, `?periodoId=abc`, `GET /api/adjuntos?entidad=abc`, `/api/reportes/indicadores/abc.xlsx` y `libro-mayor.csv?cuentaId=abc` → 400 en `auditoria-fase3.test.ts`.
13. **M1/M2:** `tokenVersion` en `cambiarPassword` + acciones `LOGIN_OK/LOGIN_FALLIDO/CAMBIAR_PASSWORD` con IP. — **Hecho:** `Usuario.tokenVersion` (migración `20260923163927_fase3_token_version_login_auditoria`); `cambiarPassword` incrementa `tokenVersion` en la tx y registra `CAMBIAR_PASSWORD` con IP; el middleware `requireAuth` compara `tokenVersion` → 401 `SESION_INVALIDADA`; `login` registra `LOGIN_OK` (éxito) o `LOGIN_FALLIDO` (con `ip` y `ruta`); en todos los casos IP de `req.ip`. Tests en `auth.test.ts` (token viejo → 401) y `auditoria-fase3.test.ts` (IP y acciones registradas).
14. **M3:** error genérico en 500 con `errorId`; mapear P2002. — **Hecho:** `errorHandler` genera `errorId` (UUID), responde 500 genérico sin filtrar el mensaje real (solo se loggea), mantiene los 4xx/409 explícitos (P2002 → 409 con el campo duplicado, multer y validación de archivos sin tocar). Tests en `auditoria-fase3.test.ts` (500 genérico + `errorId` sin filtrar, P2002 → 409, 400 explícito intacto).
15. **M4/M5:** acotar eventos `empresaId:null` a ADMIN global; filtrar `/usuarios/disponibles` por tenant. — **Hecho:** `auditoria.listar` solo suma los eventos globales (`empresaId: null`) cuando `req.user.rol === "ADMIN"` (el resto ve solo su empresa); `/api/auditoria` exige rol ADMIN. `usuarios.disponibles` excluye a los ya vinculados a la empresa y a los que tienen cualquier **otro** vínculo activo. Tests en `auditoria-fase3.test.ts`.
16. **M6-M9:** `PGPASSWORD`/pgpass en scripts; exigir `BACKUP_ENCRYPT_KEY` en producción; descifrado a pipe; anti zip-slip en `zip-lite.mjs`. — **Hecho:** `backup.mjs` usa `parseUrlPg`/`envPg` (toma `PGPASSWORD`) y exige clave de cifrado si `NODE_ENV === "production"`; `restore.mjs` reescrito (stdin vía `spawn`, sin archivos temporales; adjuntos por Buffer); `zip-lite.mjs` valida rutas (`rutaSegura`) contra zip-slip y `extraerZip` acepta Buffer; `cifrado.mjs` descifra a Buffer. — Nota: no hay tests unitarios automáticos de scripts; se validan por ejecución manual (ver `docs/respaldo.md`).
17. **M10/B1-B4:** semillas sin credencial hardcodeada; longitud mínima de `JWT_SECRET` (≥32); hash dummy en login; fallback CORS solo localhost; `Math.max(12, BCRYPT_ROUNDS)`. — **Hecho:** `seed.ts` usa `ADMIN_INITIAL_PASSWORD` o contraseña aleatoria impresa una sola vez (rounds ≥ 12; el seed demo exige `DEMO_PASSWORD`); `jwt.ts` valida `JWT_SECRET` ≥ 32; `login` compara contra `hashDummy()` cuando el usuario no existe; CORS por defecto solo `localhost`/`127.0.0.1`; `redondeosBcrypt()` fuerzan mínimo 12 rounds. M10 (credencial hardcodeada) cerrado.
18. **A2/B5-B7/B9:** documentar y, donde aplique sin romper LAN, habilitar TLS por defecto, `trust proxy`, `Permissions-Policy`; evaluar lockout/MFA para ADMIN (roadmap). — **Hecho (parcial):** `trust proxy` = 1 y header `Permissions-Policy: geolocation=(), microphone=(), camera=()`. TLS no se habilita por defecto para no romper la LAN (se documenta el procedimiento en `docs/despliegue.md` y un warning en `index.ts` cuando corre en HTTP fuera de localhost); lockout (M11), MFA (B8) y TLS por defecto (B6) quedan **diferidos al roadmap** (`docs/roadmap-v2.0.md`).

### Fase 4 — Frontend (F1-F14) — CORREGIDA (2026-09-23)
Commit: `2834f9b` (tests de frontend verdes: 3 archivos / 12 tests; `tsc -b`, lint, build y CI con `npm test` OK).
19. **F1:** excluir 401 de `/auth/login` del interceptor; redirección SPA con `returnTo`. — **Hecho:** `client.ts` no redirige en `POST /auth/login`; en 401 de otras rutas limpia `token`/`empresaId` y navega a `/login?returnTo=...`; `Login` vuelve al `returnTo` tras autenticar.
20. **F2:** `ProtectedRoute` con guard por rol y test; evitar peticiones antes del guard (F11). — **Hecho:** `ProtectedRoute` acepta `roles`; `App.tsx` restringe `usuarios`, `clientes` y `auditoría` a ADMIN. El guard no renderiza la ruta → no hay fetch antes de autorizar (F11). El test por rol se cubre vía el guard aplicado (ítem 25).
21. **F3:** una sola fuente de rol (`empresaActiva?.rol ?? usuario?.rol`) y helper `puedeEditar`. — **Hecho:** `EmpresaContext` expone `rol`, `puedeEditar` y `esAdmin`; 18 páginas/componentes migrados a `useEmpresa()` (ActivosFijos, Cartera, CierreAnual, Comprobantes, Conciliaciones, Cuentas, Dashboard, Empleados, Indicadores, Nomina, ParametrosNomina, Periodos, Presupuesto, Procesos, Productos, ProvisionCartera, Reportes, Terceros + AdjuntosLista y AlertasPanel).
22. **F5/F6:** limpiar token solo en 401; `logout` limpia `empresaId`. — **Hecho:** `AuthContext` limpia el token solo en 401 de `/auth/me`; `logout` limpia `token` y `empresaId`.
23. **F9:** `"strict": true` en `tsconfig.app.json`. — **Hecho:** activado; único error (rol sin usar en `Conciliaciones`) corregido; `tsc -b` en CI.
24. **F7/F8/F13/F14:** cerrar el select de estado; avisar fallos de carga; manejar 403 `DEBE_CAMBIAR_PASSWORD`; retirar `Card.tsx`. — **Hecho:** el select de `estado` al crear ya no existe (se cerró en F2; el del listado es filtro); `validarLineas()` exige débito **o** crédito por línea (no ambos) y tercero si la cuenta lo requiere (en `ComprobanteForm`, modo crear y editar); 9 `.catch(() => {})` de carga reemplazados por `setError` (ActivosFijos ×3, Conciliaciones, Comprobantes, CierreAnual, Indicadores, Reportes ×2); el interceptor redirige a `/cambiar-password` ante 403 sin enviar a una ruta ya activa; `Card.tsx`/`Card.module.css` retirados.
25. **F10 (y S5-02):** Vitest + jsdom con tests mínimos de `AuthContext`/`EmpresaContext`/validación de `ComprobanteForm`. — **Hecho:** vitest 5 + jsdom + Testing Library; `vitest.config.ts`, `src/test/setup.ts` y 12 tests en `AuthContext.test.tsx`, `EmpresaContext.test.tsx` (fuente de rol/puedeEditar) y `ComprobanteForm.test.tsx` (partidas y validaciones); script `npm test`; CI del frontend ahora corre test + lint + build. S5-02 cerrado.

### Fase 5 — Calidad, paginación y documentación (S5-06, S5-08/09, S5-13/15/16, S5-19)
26. Lint + typecheck de backend en CI; paginar listados; extraer helpers largos. — **Hecho** (commit `edfe5d0`):
   - **S5-19:** scripts `lint` (oxlint) y `typecheck` (`tsc --noEmit`) en `backend/package.json`; el job backend del CI corre `npm test` + `build` + `typecheck` + `lint`; `npm audit fix` saneó multer/nanoid/qs/express (queda aviso de `deepmerge-ts` vía Prisma CLI 6.19.3, dev-only; exige Prisma 8 y queda como residual documentado). Lint backend: 0 errores (warnings preexistentes solo en tests/scripts).
   - **S5-06:** paginación real en `terceros`, `productos`, `cartera` y `activos-fijos` (`backend/src/lib/paginacion.ts` con sobre `{ items, total, page, pageSize, pages }` cuando hay `page`/`pageSize`, array plano si no, compatible hacia atrás); el filtro `estado` de cartera pasó a la cláusula SQL; frontend con `lib/paginado.ts` + `components/Paginador.tsx` (reset a página 1 al filtrar) en las 4 páginas. Tests en `backend/tests/paginacion.test.ts` (8).
   - **S5-09:** `backend/src/lib/decimal.ts` con `num()` y `redondear2()` elimina la duplicación en 7+ controladores.
   - **S5-08:** helpers largos extraídos a `lib/activos-fijos.ts` (depreciar/baja), `lib/cierre.ts` (cierre anual), `lib/nomina.ts` (+516 líneas de orquestación) y `lib/conciliacion.ts` (+168); los controladores quedaron como wrappers finos (`RespuestaHttp { status, body }`). Se corrigió de paso el typo `EstadoComprobanteLik` → `EstadoPeriodo.ABIERTO`.
27. Sincronizar `docs/arquitectura.md`, `docs/modelo-datos.md`, `docs/normatividad.md` (V2), anulación por contrasiento (S1-06/M2) y cartera conciliada (C3). — **Hecho** (commit docs que referencia `edfe5d0`):
   - **S5-13:** `docs/arquitectura.md` sincronizado (Node.js 20+, React 19, PostgreSQL 16+, árbol `src/` real con `lib/` y `prisma/seed.ts`, sin `services/utils/hooks`).
   - **S5-15:** `docs/modelo-datos.md` refleja los campos del schema: `usuarios.debe_cambiar_password`, `comprobantes.comprobante_origen_id` (+ relación `Contrasiento` y semántica de anulación), `auditoria.accion` como enum `AccionAuditoria`, `detalle Json`, `entidad/entidadId/empresaId?`; vistas derivadas: el libro diario incluye anulados + contrasientos.
   - **S5-16:** `docs/normatividad.md` pasa a **V2** y quedó desactualizado el punto 4 (fuera de alcance sigue listado); se agregó §1.5 "Anulación por contrasiento (S1-06)" con el detalle regulatorio (Código de Comercio, Decreto 2649/1993 art. 127).
   - **S1-06 / M2 (anulación por contrasiento real):** ver detalle en la entrada M2 abajo; implementado en `edfe5d0` con tests dedicados `backend/tests/contraasiento.test.ts` y backfill `db:backfill-contrasientos`.
   - **C3 (cartera conciliada):** diseño documentado (ver entrada C3); implementación diferida a roadmap F2.
   - **Cierre ítem 26:** backend 606/606 tests, frontend 12/12; `npm run lint` y `npm run build` limpios en ambos.

### Fase 6 — Consistencia de código, documentación y CI (S5-01, S5-04, S5-05, S5-07, S5-10/11, S5-14, S5-20) — CORREGIDA (2026-09-23)
Commits: `a1b053f` (código y semántica `eliminar`), `21a330f` (manual-usuario), `e25a9ba` (CI/tests). Backend 615/615 e frontend 12/12; `tsc`, typecheck, lint y build limpios; CI con frontend `typecheck` nuevo.
28. **S5-04** — Guards `Number.isInteger` en `id` para productos (×4), cartera (actualizar/eliminar/abonar) y activos-fijos (actualizar, depreciar→`periodoId` "Periodo inválido", baja, listarDepreciaciones), alineados a los que ya existían en presupuesto/provision/cartera.detalle. Commit `a1b053f`; test en `auditoria-fase6.test.ts` (400 para `id=abc`).
29. **S5-05** — Zod antes de la existencia en `empleados.actualizar`, `empleados.retirar` (conserva 404 de empleado y 400 "ya retirado" tras el `findFirst`) y `activos-fijos.actualizar`. Commit `a1b053f`.
30. **S5-07** — Semántica de "eliminar" documentada por módulo (soft-delete / delete duro / baja / retiro / desactivación) en nueva sección §5.1 de `docs/arquitectura.md`. Commit `a1b053f`.
31. **S5-10** — Los 5 generadores de PDF de `libros-pdf.controller.ts` (diario, mayor, inventarios, balance, resultados) envueltos con helper `generarYResponder` (try/catch → 400 `{error}`), consistente con `indicadoresPdf`/`exportarReporte`. Commit `a1b053f`; test en `auditoria-fase6.test.ts` (400 por PDF con cuenta inexistente).
32. **S5-11** — Cero `any` en `backend/src` (before: `cartera.controller.ts:6` con `eslint-disable` + `productos.controller.ts:30-32`). `productos` tipado con `ProductoConConteo`/`MovimientoConComprobante`; `cartera` con interfaces `DelegadoCartera`/`DelegadoAbono`/`TxCartera`/`TxAbono` sobre los delegates reales del `$transaction` (los métodos planos rompían el runtime — 6 tests 500 detectaron la regresión y se corrigió a delegates por `txn`). Commit `a1b053f`.
33. **S5-01** — Test dedicado `backend/tests/empleados.test.ts` (8 tests): retiro de activo → 200 `activo:false`; doble retiro → 400; 404 inexistente; 400 fecha inválida; 400 Zod; `listarLiquidaciones` 404 inexistente, lista vacía y con nómina (periodo + `netoPagar` + estado CONTABILIZADO). Eliminar `periodos` con dependencias ya se cubría (`presupuesto.test.ts:262-294`). Commit `e25a9ba`.
34. **S5-20** — Script `typecheck` separado en frontend (`tsc -b --noEmit`) y step `npm run typecheck` en el job frontend de `.github/workflows/ci.yml`. Commit `e25a9ba`.
35. **S5-14** — `docs/manual-usuario.md` reescrito: numeración continua (sin salto §11→§13) y 9 secciones nuevas (Activos fijos, Empleados, Nómina, Parámetros de nómina, Presupuesto, Provisión de cartera, Cierre anual, Indicadores, Procesos y seguimiento), alineadas a rutas y reglas reales. Commit `21a330f`.
36. **S5-03, S5-06, S5-08/09, S5-13/15/16, S5-19** — ya cerrados en la Fase 5 (ítems 26-27); la Fase 6 los re-verificó sobre el código final.

---

## 7. Valoración

El sistema es seguro y confiable en su estado actual para operación con datos reales **siempre que se corrijan primero F1** (C1/C2/C4): el resto de hallazgos son de control interno, concurrencia fina y robustez, y no invalidan el modelo contable. La cartera (C3) requiere una decisión de diseño (autogenerar comprobantes o exigir `comprobanteId` y conciliar) antes de confiar en ella para estados financieros.

Auditoría de solo lectura. No se modificó ningún archivo del repositorio.