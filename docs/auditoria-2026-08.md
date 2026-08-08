# Auditoría completa del proyecto — sistema-contable

- **Fecha:** 2026-08-07
- **Alcance:** código y diseño en `C:\Users\Pc\Documents\Default Project` (`backend/`, `frontend/`, `docs/`, `prisma/schema.prisma`, scripts, tests, CI). Sin acceso al contenido de datos reales.
- **Modalidad:** solo lectura. Ningún archivo fue modificado durante esta auditoría.
- **Convención:** archivo:línea. Severidades: **crítico / alto / medio / bajo / informativo**.
- **Verificación de regla 5 (acceso a datos sensibles):** se detectó que `backend/.env` existe y que `backups/` contiene archivos `.dump` y `.adjuntos.zip`. De acuerdo con la confirmación del usuario, esta auditoría se ejecutó **sin leer `backend/.env`** y **sin abrir ni restaurar los `.dump`/`.zip`**; las observaciones que citan `backup.log` se basan en encabezados y marcas temporales visibles por nombre, no en su contenido operativo.

---

## Sección 1 — Cumplimiento normativo y legal

Bloque prioritario (no cubierto por auditorías anteriores). Se revisó contra `docs/normatividad.md`, `docs/modelo-datos.md`, el `schema.prisma` y los controladores de comprobantes, periodos, cierre, provisión, depreciación, inventario, libros y respaldo.

### 1.1 Marco normativo contable general (Ley 1314 de 2009, Decreto 2420 de 2015)

- La implantación del **PUC** (`Cuenta` con `empresaId` opcional = catálogo nacional compartido) y el cierre a cuentas de resultado (clases 4–7) son consistentes con el marco NIIF para microempresas (Grupo 3) declarado en `docs/normatividad.md`.
- **S1-01 (Informativo) — Uniformidad y comparabilidad.** El sistema no impide cambiar el plan de cuentas de una empresa NIIF-Grupo 3 a una estrutura distinta, pero la consulta de cuentas usa el PUC compartido, lo que favorece comparabilidad. Sin hallazgo accionable.

### 1.1bis Norma que rige el sistema contable computarizado (Decreto 2649/1993 arts. 123–135 y Código de Comercio arts. 48–74)

**Numeración sucesiva y continua (art. 125).**
- `schema.prisma:420` — `@@unique([empresaId, tipo, consecutivo])`; `Consecutivo` con `@@id([empresaId, tipo])` (`schema.prisma:445-453`).
- `backend/src/lib/consecutivo.ts:11-27` — `obtenerSiguienteConsecutivo` usa `SELECT ... FOR UPDATE` dentro de `prisma.$transaction` (bloqueo pesimista). Invocado dentro de la transacción del comprobante (`comprobantes.controller.ts:217-245`). La unicidad y atomicidad están garantizadas.
- **S1-02 (Bajo) — Sin verificación de continuidad estricta.** La unicidad por tripla existe, pero no hay control que detecte saltos frente a inserciones manuales en BD. Recomendación (no aplicar): añadir una vista/informe de auditoría que liste secuencia `consecutivo` por `empresaId`+`tipo` y alerte sobre huecos.

**Forma de llevar los libros / medios electrónicos (art. 128) y prohibiciones (alterar orden, fechas, dejar espacios).**
- `comprobantes.controller.ts:260-263` — `actualizar` rechaza si `estado !== BORRADOR`; `:396-399` — `eliminar` solo en BORRADOR. Asientos de comprobantes contabilizados no se borran. ✓
- `comprobantes.controller.ts:103-108` — bloquea crear en periodo cerrado y valida fecha dentro del rango del periodo.
- **S1-03 (Alto) — Reapertura de periodos de un año ya cerrado.** `backend/src/controllers/periodos.controller.ts:74-106` permite pasar `estado` de `CERRADO` a `ABIERTO` (audita `REABRIR_PERIODO`, lín. 92) **sin validar** que el año tenga `CierreAnual`. Combinado con `comprobantes.controller.ts:122-125` (que tras el cierre solo bloquea clases 4–7), permite alterar cuentas de balance (1–3) de un año cerrado, desvirtuando el asiento de cierre. Recomendación: en `actualizar`, bloquear el paso a `ABIERTO` si existe `CierreAnual` para ese `empresaId`+`anio`.
- **S1-04 (Alto) — Violación del orden cronológico en depreciación.** `backend/src/controllers/activos-fijos.controller.ts:241` fija `fecha: new Date()`. Si la depreciación de un periodo cerrado cronológicamente se ejecuta días después, el comprobante queda con fecha fuera del rango `[periodo.fechaInicio, periodo.fechaFin]`. El helper `crearComprobanteDiario` (`backend/src/lib/comprobantes.ts:27-58`) **no** invoca `validarYPreparar`, omitiendo toda validación de fecha/periodo/cierre. Otros módulos (provisión `provision-cartera.controller.ts:235`, nómina `nomina.controller.ts:571`, cierre `cierre-anual.controller.ts:219`) sí usan `periodo.fechaFin`. Recomendación: usar `periodo.fechaFin` en depreciación y hacer que `crearComprobanteDiario` valide fecha-dentro-de-periodo (o delegue en `validarYPreparar`).
- **S1-05 (Bajo) — Sin validación cronológica estricta entre comprobantes.** `comprobantes.controller.ts:100-149` solo exige que la fecha caiga dentro del periodo abierto; no compara contra comprobantes ya contabilizados del mismo `tipo`. `docs/normatividad.md:47-51` menciona "registro cronológico sin enmendaduras". Recomendación: evaluar si la política de la firma exige orden cronológico entre tipos y bloquear el back-dating fraccionado.
- **S1-06 (Bajo) — Anulación por exclusión, no por contrasiento.** `comprobantes.controller.ts:356-387` solo cambia `estado` a `ANULADO` (sin asiento inverso); los reportes excluyen `ANULADO` (`reportes.controller.ts`). El efecto contable es correcto, pero `docs/normatividad.md:61` declara "anulación por contrasiento". Recomendación: alinear la documentación al mecanismo real (exclusión) o generar comprobante inverso al anular.

**Conservación de libros y soportes (art. 134; Código de Comercio arts. 48-74; Estatuto Tributario art. 632 — 5 años, libros hasta 10).**
- `backend/scripts/backup.mjs:69` — `keep: 14` por defecto. `programar-respaldo.ps1:13` — `-Keep 14` por defecto. Documentado en `docs/respaldo.md:24`.
- **S1-07 (Alto) — Retención por defecto insuficiente.** 14 copias diarias ≈ 14 días, muy por debajo de la obligación de conservación (5 años tributarios; 10 años libros). Es configurable (`--keep`, `-Keep`), pero el valor por defecto instala al incumplimiento si el contador no lo ajusta. Recomendación: subir el valor por defecto a algo alineado con el régimen (p. ej. 60 mensuales + 10 anuales) o al menos advertir al instalar.
- **S1-08 (Medio) — Sin esquema GFS de retención.** Subir `--keep` a `1825` implica miles de `.dump` diarios. Recomendación: implementar retención diaria/semanal/mensual/anual (grandfather-father-son) y dejar constancia documental del periodo cubierto.

**Reproducción de asientos históricos (art. 128).**
- `reportes.controller.ts:17-29` — `whereFiltros` filtra por `estado CONTABILIZADO` + `empresaId` + opcional `periodoId`/rango; **sin** limitar a "periodo activo". Exportación PDF (`libros-pdf.controller.ts`), CSV/XLSX (`exportacion.controller.ts`) y `paqueteParaEmpresa` permiten reconstruir cualquier periodo histórico. ✓ Adeuda nota: `ANULADO`/`BORRADOR` no aparecen en los libros legales (`S1-06`).

### 1.2 Protección de datos personales (Ley 1581 de 2012, Decreto 1377 de 2013)

**Datos personales almacenados (enumeración por modelo).**
- `Tercero` (`schema.prisma:331-342`): `tipoDocumento`, `documento`, `nombreRazonSocial`, `direccion`, `telefono`, `email`, `ciudad`.
- `Empleado` (`schema.prisma:677-688`): hereda los del `Tercero` + `cargo`, `salarioBase`, `fechaIngreso`, `fechaRetiro`, `arlEmpleador`, `auxilioTransporteManual`. `Nomina`/`ProvisionNomina` contienen bases de liquidación y novedades.
- `Usuario` (`schema.prisma:230-239`): `nombre`, `email`, `passwordHash`, `rol`, `debeCambiarPassword`.
- `Empresa` (`schema.prisma:178-184`): `nit`, `direccion`, `telefono`, `mensajeRecibo` (datos del cliente-empresa del contador).

**Medidas de seguridad encontradas.**
- Hashing bcrypt (costo 10 — ver S2), `debeCambiarPassword` en primer ingreso (`auth.controller.ts:89-93`), JWT con expiración, control de acceso por rol y aislamiento por empresa (`middleware/auth.ts`). Existe bitácora `Auditoria` para acciones de escritura. ✓ Parcial.

**- S1-09 (Alto) — Datos personales en tránsito sin cifrar.** El despliegue es **HTTP** en la LAN (`app.ts:40-50` neutraliza `upgrade-insecure-requests`; `docs/despliegue.md`). El login, las consultas de terceros/empleados, los adjuntos y la exportación viajan en claro entre el servidor y los demás equipos de la red. Un equipo comprometido o un sniffer en la LAN puede capturar credenciales y datos personales. Recomendación: habilitar TLS (auto-firmado o certificado local) en PM2/Express o un proxy; o al menos restringir la red y documentar el riesgo residual.

- **S1-10 (Medio) — Datos personales en reposo sin cifrado.** Postgres almacena en claro; los `.dump` (`backup.mjs`) y los adjuntos (`adjuntos.controller.ts`) tampoco están cifrados. Si el disco o un respaldo externo se expone, los datos quedan al descubierto. Recomendación: cifrar la carpeta de respaldos/adjuntos (p. ej. a nivel de FS) o cifrar el `.dump`; documentar el riesgo.

- **S1-11 (Medio) — Sin trazabilidad de descarga de adjuntos con datos personales.** `adjuntos.controller.ts` (`descargar`, ~lín. 91-99) no llama a `registrarAuditoria`; quien descarga un soporte (con datos de terceros/empleado) no queda registrado. Recomendación: registrar una `Auditoria` de `accion DESCARGAR_ADJUNTO` con `entidadId` y `empresaId`.

- **S1-12 (Medio) — Derechos ARSO limitados; sin supresión selectiva.** Existe exportación por empresa (`paqueteInformes`/`paqueteFinalBaja` — este último solo exporta, no elimina: `exportacion.controller.ts:259-282`) y soft-delete de `Tercero`/`Empleado`/`Usuario` (`activo=false`), pero **no** hay forma de eliminar/exportar los datos personales de un titular concreto a petición suya sin borrar el registro contable. Recomendación: diseñar un proceso documentado para supresión/anonimización de un tercero/empleado concreto (y registrarlo), y exponer el aviso de privacidad en `manual-usuario.md`. El sistema no puede sustituir la autorización y el registro ante RNBD, pero debe facilitarlo.

### 1.3 Normativa laboral (módulo de nómina)

- `ParametroNomina` (`schema.prisma:761-786`) contiene SMMLV, auxilio de transporte, topes, % de salud/pensión/parafiscales. `nomina.controller.ts:380-387` los carga por `(empresaId, anio)` o globales. ✓
- **S1-13 (Medio) — Cesantías, prima y vacaciones hardcodeadas.** `backend/src/lib/nomina.ts:150` (`cesantias = base/12`), `:152` (`prima = base/12`), `:154` (`vacaciones = base/24`). Solo `interesesCesantias` vive en `ParametroNomina`. `docs/diseno-nomina.md:65-68` las lista como parámetros. Las fracciones son legales hoy, pero rompen el principio "todo parámetro en BD" y dificultan cambios normativos. Recomendación: añadir columnas `cesantias`, `prima`, `vacaciones` a `ParametroNomina` (con defaults 8.33/8.33/4.17).
- **S1-14 (Informativo) — Nómina electrónica / PILA fuera de alcance.** `docs/diseno-nomina.md:27,371-377` lo declara; el sistema solo calcula y contabiliza la provisión mensual. La liquidación definitiva (cesantías con sanción al retiro) y la radicación quedan externas. Recomendación: dejarlo explícito en `manual-usuario.md` (la provisión asentada es provisional, requiere ajuste externo).

### 1.4 Ejercicio profesional del contador (Ley 43 de 1990)

- `AUXILIAR` no puede invocar cálculos contabilizadores; los middlewares `requireRole("ADMIN","CONTADOR")` cuidan depreciación, provisión cartera, provisión nómina, comprobantes. Cierre anual es `requireRole("ADMIN")` exclusivo. ✓
- **S1-15 (Medio) — Ausencia de propuesta → aprobación para depreciación y provisiones.** Depreciación (`activos-fijos.routes.ts:21`), provisión de cartera (`cartera.routes.ts:27`) y provisión de nómina (`nomina.routes.ts:16`) contabilizan directamente el comprobante en `CONTABILIZADO` (`backend/src/lib/comprobantes.ts:46`); no hay un estado `BORRADOR` intermedio aprobable por un segundo revisor. La nómina **sí** separa `liquidar` (BORRADOR) de `contabilizar` (`nomina.routes.ts:17-18`). Si la política de control interno exige cuatri separada, estos tres módulos no la cumplen. Recomendación: replicar el patrón `liquidar`/`contabilizar` (o un endpoint `POST .../aprobar`) en depreciación y provisiones.
- **S1-16 (Informativo) — Asimetría de roles.** Un `CONTADOR` puede depreciar y provisionar pero no cerrar el año (exclusivo `ADMIN`). Confirmar que la asimetría es política intencional.

---

## Sección 2 — Seguridad técnica

### Autenticación
- **S2-01 (Crítico) — Secreto JWT por defecto hardcodeado.** `backend/src/lib/jwt.ts:3` — `const SECRET = process.env.JWT_SECRET ?? "dev-secret";`. Si `JWT_SECRET` falta en producción, los tokens se firman con una cadena estática pública del repo: cualquiera puede forjar tokens válidos. No hay validación al arranque. `signToken` (`:13`) no especifica `algorithm` (HS256 por defecto, aceptable pero conviene fijarlo). Recomendación: abortar el boot si `JWT_SECRET` no existe o es `"dev-secret"` en producción; fijar `algorithm: "HS256"`; rotar el secreto.
- **S2-02 (Crítico) — Sin protección contra fuerza bruta en login.** `backend/src/routes/auth.routes.ts:7` — `router.post("/login", login)`; `auth.controller.ts:12-40` sin contador de intentos, retardo ni límite. No existe `express-rate-limit` (no está en dependencias; `app.ts` no lo monta). Un atacante puede probar ilimitadamente. Recomendación: `express-rate-limit` en `/api/auth/login` (p. ej. 5 intentos/15 min por IP+email) + bloqueo temporal y registro en auditoría.
- **S2-03 (Medio) — Política de contraseñas débil y cost bcrypt bajo.** `auth.controller.ts:68-70` exige `.min(6)`; `docs/manual-usuario.md:133` dice "mínimo 8 caracteres" (inconsistencia, ver S5). `auth.controller.ts:89` y `usuarios.controller.ts:50` usan `bcrypt.hash(..., 10)` (cost 10, por debajo de lo recomendado 12-14 en 2026). Recomendación: subir a `.min(8)` (o `.min(12)`), añadir complejidad y `process.env.BCRYPT_ROUNDS` (12).
- **S2-04 (Medio) — Token sin refresh/revocación.** `lib/jwt.ts:4` — TTL 12h, sin mecanismo de refresh, sin lista negra ni `jti`. Logout (`AuthContext.tsx:51`) solo limpia localStorage; el token sigue válido hasta expirar. `requireAuth` (`middleware/auth.ts:56-59`) sí valida `usuario.activo`. Recomendación: tokens de acceso cortos (15-30 min) + refresh; o invalidar por versión tras desactivar.
- **S2-05 (Informativo) — `debeCambiarPassword` correcto.** `middleware/auth.ts:63-67` bloquea toda ruta salvo `me`/`cambiar-password`; `auth.controller.ts:89-93` limpia el flag al cambiar. ✓

### Gestión de secretos
- **S2-06 (Crítico) — Igual que S2-01.** Confirma: el único secreto hardcodeado es `JWT_SECRET`. `frontend/src` no usa `process.env` ni credenciales; consume `/api` relativo. ✓ para el resto.

### Validación de entradas (Zod)
- **S2-07 (Medio) — Rutas de escritura sin Zod.** `conciliacion.controller.ts:88-89` (`crear`) y `:115-145` (`importar`) parsean con `Number(...)` 6 mapeos de columnas sin schema (NaN puede llegar a Prisma). `exportacion.controller.ts:240-241,260-261` (`paqueteInformes`/`paqueteFinalBaja`) usan `Number(req.body?.periodoId)` sin schema. `adjuntos.controller.ts:26-27` (`subir`) lee `entidad`/`entidadId` con `String(...)` sin schema (`entidad` se valida contra lista fija en `:30`, pero `entidadId` no en tipo). Recomendación: definir `.*Schema` y aplicar `.safeParse` en esos endpoints; unificar el patrón.

### Dependencias (`npm audit`)
- **S2-08 (Bajo) — `backend`: 2 vulnerabilidades moderadas.** `uuid <11.1.1` (vía `exceljs >=3.5.0`, GHSA-w5hq-g745-h8pq, falta de bounds-check en `uuid` v3/v5/v6). Fix disponible implica breaking change (`exceljs@3.4.0`). `frontend`: 0 vulnerabilidades. Recomendación: actualizar `exceljs` (validar breaking) o evaluar reemplazo; vigilar advisory.

### CORS
- **S2-09 (Alto) — CORS sin restricciones.** `backend/src/app.ts:51` — `app.use(cors())` refleja cualquier `Origin`. Aunque el JWT no viaja por cookie (el riesgo de CSRF se reduce), los endpoints públicos (`/api/health`, `/api/auth/login`) quedan cross-origin. Recomendación: `cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000","http://192.168.18.219:3000"], credentials: false })`.

### Control de acceso por rol
- **S2-10 (Medio) — Adjuntos POST/GET sin `requireRole`.** `backend/src/routes/adjuntos.routes.ts:10-12` — solo `requireAuth`+`requireEmpresa`. Un `AUXILIAR` puede **subir** adjuntos (archivos de 15 MB, ver S2-12) y **listar/descargar** todos los de la empresa (posibles soportes con datos personales, ver S1-11). `DELETE` sí está protegido (`:13`). Recomendación: `requireRole("ADMIN","CONTADOR")` al menos en POST;(acotar GET por entidad.
- **S2-11 (Medio) — `GET /api/procesos/cartera` evita `requireEmpresa`.** `backend/src/routes/procesos.routes.ts:9` está registrado **antes** de `router.use(requireEmpresa)` (`:11`). Expone un dashboard transversal sin validar cabecera de empresa ni vínculo (el controlador usa los vínculos del usuario o todas las activas si ADMIN). Confirmar si es lectura agregada; si no, moverlo tras `requireEmpresa`.

### Subida de archivos (adjuntos)
- **S2-12 (Alto) — Sin whitelist de tipos MIME.** `backend/src/lib/multer.ts` sin `fileFilter`; `adjuntos.controller.ts:30-37` solo valida `entidad`, no `mimetype`/extensión. Se permite subir `.exe`, `.html`, `.svg` con JS, `.js`. El nombre guardado es UUID (sin path traversal — `lib/adjuntos.ts:18-21`, ✓), pero `res.download` (`adjuntos.controller.ts:~98`) envía `Content-Type` derivado del MIME guardado, lo que puede inducir al navegador a previsualizar HTML/JS y generar XSS. Recomendación: `fileFilter` con whitelist (imágenes, PDF, Word/Excel, texto, zip); forzar `Content-Disposition: attachment` y `application/octet-stream` al descargar.
- **S2-13 (Medio) — `multer.memoryStorage()` + 15 MB → DoS.** `lib/multer.ts:4` carga cada subida en RAM; combinado con ausencia de rate-limit y AUXILIAR permitido a subir, varias subidas concurrentes pueden agotar memoria. Recomendación: `diskStorage` y/o limitar concurrencia; bajar el límite si no se requieren 15 MB.
- **S2-14 (Informativo) — Path traversal controlado.** `lib/adjuntos.ts:18-21,32` y `adjuntos.controller.ts:98` usan UUID y `path.basename`; nombre original solo en BD. ✓
- **S2-15 (Informativo) — Carpeta destino sugerida fuera del repo.** `adjuntos.ts:8` usa `ADJUNTOS_DIR` o `backend/adjuntos`. No se sirve estáticamente (no viaja por `express.static`). Recomendar configurar ruta fuera del árbol git.

### Body parser y headers
- **S2-16 (Bajo) — `express.json()` sin `limit` explícito.** `app.ts:52` — `app.use(express.json())`. El límite por defecto (~100 KB) protege a los endpoints JSON, pero está implícito y sin `consola` de error; con `multer` aparte. Recomendación: `express.json({ limit: "256kb" })` y definir el comportamiento para payloads grandes.
- **S2-17 (Bajo) — HSTS en HTTP LAN.** `app.ts:40-50` (helmet) aplica `Strict-Transport-Security` aun sirviendo por HTTP; los navegadores pueden cachear políticas y romper la LAN. Recomendación: `helmet({ hsts: false })` en despliegues no-TLS, o servir por HTTPS.
- **S2-18 (Medio) — Token en `localStorage` (XSS).** `frontend/src/context/AuthContext.tsx:31,45`; `frontend/src/api/client.ts:6,8` guardan/leen el JWT en `localStorage` y lo envían como `Authorization: Bearer`. Cualquier XSS (incluido un adjunto HTML/SVG servido, ver S2-12) roba el token de 12h. No hay cookie `HttpOnly`. Recomendación: migrar a cookie `HttpOnly; Secure; SameSite=Strict` o mitigar XSS fuerte (CSP estricta + sanear todo lo renderizado desde datos) y reducir el TTL del token.

---

## Sección 3 — Aislamiento multiempresa

### Middleware `requireEmpresa`
- `backend/src/middleware/auth.ts:80-122` — toma `empresaId` del header `x-empresa-id` (`:81`), verifica `empresa.activa` (`:88,93`), valida el vínculo `UsuarioEmpresa` para no-ADMIN (`:107-114`) y setea `req.empresaId`/`req.rolEfectivo` (`:118-121`, con `rolMasRestrictivo`, `:76-78`). La empresa activa **no** está en el JWT (`lib/jwt.ts:6-10`); el rol se refresca desde BD (`middleware/auth.ts:44-61`). ✓ Correcto.
- **S3-01 (Alto) — `req.empresaId` declarado `string` obligatorio en el tipo global.** `middleware/auth.ts:21`. Muchos controladores usan `req.empresaId!` (p. ej. `comprobantes.controller.ts:159,208,221`). Si alguna ruta futura omite `requireEmpresa`, Prisma recibe `undefined` y no filtra (riesgo de fuga latente). Recomendación: tipo `empresaId?: string` y validar al inicio de cada controlador.

### Rutas multiempresa sin `requireEmpresa`
- **S3-02 (Alto) — `POST /api/empresas/:empresaId/informes/paquete-final`.** `empresas.routes.ts:23-25` — solo `requireRole("ADMIN")`, **sin** `requireEmpresa`. `exportacion.controller.ts:266` hace `empresa.findUnique({where:{id:req.params.empresaId}})` sin validar vínculo y genera un ZIP completo de la empresa. Compárese con `paquete` (`empresas.routes.ts:27-31`), que sí monta `requireEmpresa` y compara `req.params.empresaId !== req.empresaId`. Recomendación: aplicar el mismo patrón en `paquete-final`.
- **S3-03 (Medio) — `GET /api/procesos/cartera`** (también S2-11) no pasa por `requireEmpresa` (`procesos.routes.ts:9` antes de `:11`).
- **S3-04 (Informativo) — `GET /api/empresas` y `/administracion`.** `empresas.routes.ts:10-11`. Razonable por diseño (selección de empresa / panel admin). `empresas.controller.ts:35-59` acota por vínculo para no-ADMIN. Mantener; vigilar que exponer `nit` de empresas a las que el usuario no pertenece sea aceptable.

### Filtros `empresaId` en controladores
- **S3-05 (Alto) — `cuentas.actualizar`/`eliminar` sin filtro `empresaId`.** `cuentas.controller.ts:117-118` (`update({where:{id}})`), `:136` (`findUnique({where:{id}})`), `:150` (`delete({where:{id}})`). `Cuenta.empresaId` es opcional (PUC compartido), pero una cuenta propia de **otra empresa** (`empresaId="uuid-otra"`) es alcanzable si se adivina el `id`, y se podría modificar/borrar; las hijas se cuentan por `codigo` y no por empresa (`:142-143`). Recomendación: validar pertenencia con `findFirst({id, OR:[{empresaId:req.empresaId},{empresaId:null}]})` antes de `update`/`delete`; prohibir borrar cuentas con `empresaId:null` (PUC nacional).
- **S3-06 (Alto) — Indicadores y reportes por `periodoId` sin acotar empresa.** `indicadores.controller.ts:27-29` (`obtenerDatosIndicadores` hace `periodo.findUnique({where:{id:periodoId}})` sin `empresaId`; `saldosPorCuenta({estado, periodoId})` sin `empresaId`). `indicadores.controller.ts:57-59` (comparativo) idem. `libros-pdf.controller.ts:208,231-243` (`indicadoresPdf`) invoca lo mismo. Aunque las rutas `/api/reportes` montan `requireEmpresa`, el controlador **no** restringe `periodoId` a `req.empresaId`: un usuario autenticado con empresa activa A puede pedir `periodoId` de la empresa B y leer sus saldos e indicadores. Recomendación: `prisma.periodo.findFirst({where:{id:periodoId, empresaId:req.empresaId}})` y añadir `empresaId` a `saldosPorCuenta` en estos flujos.
- **S3-07 (Medio) — `provision-cartera.obtenerProvision` por `periodoId` sin `empresaId`.** `provision-cartera.controller.ts:~306` — `provisionCartera.findUnique({where:{periodoId}})` sin filtrar; la ruta `/api/cartera/provision/:periodoId` está bajo `requireEmpresa` pero el controlador no acota. Recomendación: validar `periodo.findFirst({where:{id:periodoId, empresaId:req.empresaId}})` primero.
- **S3-08 (Medio) — Adjuntos a entidad `EMPRESA` sin filtrar empresa.** `adjuntos.controller.ts` `validarEntidad` para `EMPRESA` hace `empresa.findUnique({where:{id:entidadId}})` sin `empresaId`. No hay fuga de archivos, pero se puede ligar un adjunto de la empresa activa a un `entidadId` externo. Recomendación: filtrar por `req.empresaId` para `EMPRESA`.
- **S3-09 (Medio) — `ReglaAlerta` es global.** `schema.prisma:818-825` — sin `empresaId`. `alertas.controller.actualizarReglas` permite a cualquier CONTADOR/ADMIN de **cualquier empresa** modificar las reglas para todas. Recomendación: migrar a por-empresa (añadir `empresaId`) o restringir `PUT /api/alertas/reglas` a `ADMIN` global.
- **S3-10 (Medio) — Auditoría con `empresaId:null` compartida.** `schema.prisma:617`; `auditoria.controller.listar` filtra `OR:[{empresaId:null},{empresaId:req.empresaId}]`. Las acciones globales (crear empresa/usuario) son visibles para todas las empresas. Decidir política; hoy se comparten.
- **S3-11 (Informativo) — Modelos sin `empresaId` directo.** `Asiento`, `Recibo`, `Pago`, `InventarioMovimiento`, `Depreciacion`, `ProvisionCartera`, `Empleado`, `Nomina`, `ProvisionNomina`, `Presupuesto`, `MovimientoExtracto` se acceden vía relación padre. La seguridad depende de que el controlador valide el padre con `empresaId` (donde fallan S3-06/S3-07).
- **S3-12 (Informativo) — Sin `req.body.empresaId`/`req.query.empresaId`.** No existe override del header; convención correcta.

### Prueba `backend/tests/aislamiento-empresas.test.ts`
- **S3-13 (Alto, brecha de test) — Solo prueba la barrera del middleware.** Crea una empresa B sin vínculo para el usuario y espera `403` en 96 rutas (`:170-190`). **No** cubre el caso de un usuario *con* vínculo a A que pasa `id`/`periodoId` de B (justo lo que falla en S3-05/S3-06/S3-07). No prueba `ADMIN` ni `AUXILIAR`, ni `paquete-final` (S3-02) ni `/procesos/cartera` (S3-03). Recomendación: añadir casos cross-empresa por enumeración de `id`/`periodoId` ajeno y los roles ADMIN/AUXILIAR.

---

## Sección 4 — Corrección funcional contable

### Partida doble (casos límite)
- `comprobantes.controller.ts:9-31` — `asientoSchema` exige exactamente uno de `debito`/`credito` (XOR), `.positive()` (rechaza negativos y cero) y `.min(2)`. `:127-146` valida `totalDebito.equals(totalCredito)` con `Prisma.Decimal`. ✓ Un solo asiento → rechazado; negativo/cero → rechazado.
- `backend/src/lib/comprobantes.ts:28-32` — `crearComprobanteDiario` también valida partida doble (para comprobantes del sistema).
- **S4-01 (Bajo) — `crearComprobanteDiario` no exige `min(2)`.** `lib/comprobantes.ts:27-58`. Hoy se invoca siempre con pares binarios y los controladores verifican, pero un caller futuro podría pasar un único asiento. Recomendación: añadir `if (data.asientos.length < 2) throw`.

### Cierre anual
- `cierre-anual.controller.ts:104-108` — bloquea doble cierre; `:112-124` exige todos los periodos cerrados; `:180-206` construye asientos de clases 4–7 + cuenta de utilidad; `:215-254` usa `crearComprobanteDiario` y `ultimoPeriodo.fechaFin`. ✓
- **S4-02 (Medio) — Omite cuentas de resultado con saldo inverso.** `cierre-anual.controller.ts:185` — `if (monto <= 0) continue;`. Una cuenta de gasto con saldo neto acreedor ( crédito > débito, inusual pero posible por asientos correctores) quedaría **sin cerrar**. Igual para ingresos con saldo deudor. Recomendación: cambiar a `if (monto === 0) continue;` y gestionar el signo.
- **S4-03 (Bajo) — Redondeo por cuenta.** `redondear2(saldo)` por cuenta (`:184`) y `resultado = redondear2(debitoIngresos - creditoGastos)` (`:200`). El asiento cuadra por construcción, pero la utilidad puede diferir en centavos de la suma de saldos sin redondeo. Documentar.
- **S4-04 (Alto, ya S1-03) — Reapertura post-cierre.** `periodos.controller.ts:74-106` permite alterar cuentas 1–3 de un año ya cerrado. Ver S1-03.

### Redondeo (depreciación, provisión cartera, nómina)
- `provision-cartera.controller.ts:199-227` — cada `provision` redondea a 2 y usa el mismo `incremental` como débito/crédito (cuadra exacto); reversión simétrica. ✓
- `activos-fijos.controller.ts:217-223` — `valorMes` idem para gasto/dep. acumulada. ✓ No desbalancea por redondeo; validado por `crearComprobanteDiario:30`.

### Inventario — salidas negativas
- **S4-05 (Medio) — Condición de carrera (TOCTOU) en salidas.** `productos.controller.ts:158-192` — `cantidadActual`/`costoPromedio` se leen **fuera** de la transacción (`:158-159`), el chequeo `data.cantidad > cantidadActual` (`:168`) ocurre antes de `$transaction` (`:176-192`) y no bloquea la fila `Producto`. Dos `SALIDA` concurrentes pueden leer el mismo saldo y dejar existencias negativas. La validación existe, pero no es atómica. Recomendación: leer `cantidadActual` y verificar dentro de la transacción con `SELECT ... FOR UPDATE` (o serializable). `movimientoSchema.cantidad: z.number().positive()` (`:22`) ✓.

### Anulación
- **S4-06 (Bajo, ya S1-06) — Anulación por estado, no contrasiento.** `comprobantes.controller.ts:356-387`. Reportes excluyen `ANULADO`. Efecto correcto, documentación desincronizada.

### Consecutivos y concurrencia
- **S4-07 (Informativo) — Atomicidad garantizada.** `lib/consecutivo.ts:11-27` con `FOR UPDATE` en transacción. ✓

---

## Sección 5 — Calidad de código y arquitectura

### Cobertura de tests
- 26 archivos en `backend/tests/*.test.ts` cubren casi todos los controladores (comprobantes, cartera, productos, activos, nómina, presupuesto, procesos, reportes, cierre, conciliación, adjuntos, auditoría, alertas, aislamiento, etc.). Suite actual 536/536.
- **S5-01 (Medio) — `empleados.controller` y `periodos.controller` sin test dedicado.** Se cubren indirectamente vía `nomina.test.ts:200` y `cierre-anual.test.ts:46`/`comprobantes.test.ts`. Faltan tests negativos de `empleados.retirar`/`listarLiquidaciones` (`empleados.controller.ts:162`) y de `periodos.eliminar` con dependencias (`periodos.controller.ts:108-128`).
- **S5-02 (Crítico — frontend) — Sin tests de frontend.** No existe `*.test.tsx`, ni `vitest`/`jest`/`@testing-library`/`playwright` en `frontend` (declarado en `AGENTS.md`). 24 pantallas sin cobertura. Recomendación: añadir Vitest + jsdom y tests mínimos de `AuthContext`/`EmpresaContext` y de validación de formularios.

### Consistencia entre controladores
- **S5-03 (Alto) — Manejo de promesas async divergente.** `empresas.routes.ts:13-46` envuelve handlers async con `(req,res,next)=>Ctrl(req,res).catch(next)`; el resto de routers (`terceros`, `productos`, `cartera`, `activos-fijos`, etc.) pasan la función async directamente. En Express 4 una promesa rechazada no capturada no llega al `errorHandler` (posible `unhandledRejection`). Recomendación: unificar envolviendo todos los handlers async (o migrar a `express-async-handler`), o a Express 5.
- **S5-04 (Medio) — `req.params.id` validación inconsistente.** `terceros` usa `id` UUID string; `productos`, `cartera`, `activos-fijos` usan `Number(req.params.id)` sin `Number.isInteger` (salvo `cartera.detalle:134-137` y `presupuesto:27-31`). ActivosFijos no valida entero (`:154,216,290,384`).
- **S5-05 (Medio) — Orden validar-existencia vs Zod invertido.** `activos-fijos.controller.ts:153-164` y `empleados.controller.ts:124-145` hacen `findFirst` → Zod; `terceros`/`productos`/`periodos` hacen Zod → `findFirst`.
- **S5-06 (Medio) — Sin paginación.** Ningún listado pagina (`terceros:69-72`, `productos:48-52`, `cartera:78-82`, `activos-fijos:88-97`); el filtrado por `estado` de cartera se hace **en memoria** (`cartera.controller.ts:83-84`). Riesgo con volúmenes grandes.
- **S5-07 (Medio) — Semántica de `eliminar` inconsistente.** Terceros = soft-delete (`:146`); Productos = soft/delete según `_count.movimientos` (`:110-116`); Cartera = delete duro (`:211-212`); ActivosFijos no tiene DELETE, usa `baja` (`:289`).

### Deuda técnica
- **S5-08 (Medio) — Funciones muy largas (>80 lín.).** `nomina.controller.ts:365` (`liquidar` ~127), `:611` (`provisionar` ~115), `:524` (`contabilizar` ~83); `activos-fijos.controller.ts:189` (`depreciar` ~98), `:289` (`baja` ~92); `conciliacion.controller.ts:114` (`importar` ~105); `cierre-anual.controller.ts:91` (`cerrarAnio` ~170). Recomendación: extraer helpers (`lib/nomina.ts`, `lib/cierre.ts`).
- **S5-09 (Medio) — Helper `num()` duplicado** en 6+ controladores (`terceros`, `productos`, `cartera`, `activos-fijos`, `comprobantes`, `nomina`, `provision-cartera`). Extraer a `lib/decimal.ts`.
- **S5-10 (Medio) — Errores sin status HTTP consistente.** `throw new Error(...)` en `nomina.controller.ts:153,155`, `libros-pdf.controller.ts:209`, `exportacion.controller.ts:132,134`. Solo se traducen a 400 donde hay `try/catch` (`nomina:556,657`, `exportacion:186-191`); en el resto se propagan sin status (ligado a S5-03). Los generadores de PDF (salvo `indicadoresPdf`) no envuelven en `try/catch` (`libros-pdf.controller.ts:64-67,97-100,145-148,174-177,202-205`).
- **S5-11 (Bajo) — `any` sin lint que lo controle.** `eslint-disable @typescript-eslint/no-explicit-any` en `cartera.controller.ts:6`; `any` en `productos.controller.ts:30-32`. No hay lint en backend (ver S5-15).
- **S5-12 (Informativo) — Sin `TODO/FIXME/HACK`** en `backend/src`. ✓

### Documentación vs código
- **S5-13 (Alto) — `docs/arquitectura.md` desactualizado.** `:53` dice `src/server.ts` (real: `src/index.ts`, `package.json:8`/`app.ts:37`). `:60-61` dice `seed/puc.ts` (real: `prisma/seed.ts`; no existe `backend/seed/`). `:37` "Node.js 24" y `:39` "React 18" (real: React `^19.2.8`, CI Node 20, `AGENTS.md` Node 20+). Estructura de carpetas: menciona `src/services/`, `src/utils/`, `frontend/src/hooks/` inexistentes (es `src/lib/`). Recomendación: sincronizar el doc con la estructura real.
- **S5-14 (Alto) — `docs/manual-usuario.md` política de contraseña distinta.** `:133` "mínimo 8 caracteres"; código `.min(6)` (`auth.controller.ts:70`). Inconsistencia usuario/código. Además, faltan secciones para Procesos, Presupuesto, Provisión de cartera, Cierre anual, Indicadores, Empleados, Nómina, Parámetros de nómina; y un salto §11→§13 (falta §12).
- **S5-15 (Medio) — `docs/modelo-datos.md` desincronizado.** 12 modelos sin tabulación de campos (Consecutivo, CierreAnual, ParametroProvision, ProvisionCartera, Empleado, Nomina, ProvisionNomina, ParametroNomina, ParametroCuentaNomina, Presupuesto, ReglaAlerta). `§3.16 auditoria` (`modelo-datos.md:254-263`) describe `accion string`/`detalle string`, cuando el schema usa enum `AccionAuditoria` (`schema.prisma:135-176`), `detalle Json?`, `entidad`/`entidadId`/`empresaId?`. `usuarios §3.1` falta `debeCambiarPassword` (`schema.prisma:237`). `activos_fijos §3.13`/`depreciaciones §3.14` faltan cuentas, `valorResidual`, `estado`, `comprobanteId`.
- **S5-16 (Medio) — `docs/normatividad.md` marcado V1.** `:3,78` se declara "V1" cuando el proyecto es 2.2 (`package.json`). Funcionalmente sigue válido; desactualizado el marco temporal.
- **S5-17 (Bajo) — `docs/normatividad.md` anulación contrasiento** (ver S1-06).

### CI y scripts
- `.github/workflows/ci.yml`: backend job `npx prisma generate` + `npm test` + `npm run build` con `postgres:16` en servicio; frontend `npm run lint` (oxlint) + `npm run build`. Coincide con scripts de `package.json`. ✓ Tests + build en cada push a `master`.
- **S5-18 (Bajo) — Postgres del CI (16) vs `arquitectura.md` (18).** Documentar versión soportada.
- **S5-19 (Medio) — Sin lint ni typecheck en CI para backend.** No existe script `lint` ni `typecheck` en `backend/package.json:5-16`. Recomendación: añadir `oxlint` (ya en frontend) y `"typecheck": "tsc --noEmit"` y correrlos en CI.
- **S5-20 (Bajo) — Sin `typecheck` separado en frontend.** `build` ya invoca `tsc -b`; un `typecheck: tsc -b --noEmit` acelera feedback.

---

## Sección 6 — Resumen ejecutivo

### 6.1 Conteo de hallazgos por severidad y sección

| Sección | Crítico | Alto | Medio | Bajo | Info | Total |
|---|---:|---:|---:|---:|---:|---:|
| 1 — Normativo/legal | 0 | 4 (S1-03,04,07,09) | 5 (S1-08,10,11,12,13,15) +1* | 4 (S1-02,05,06,16) | 2 (S1-01,14) | 16 |
| 2 — Seguridad técnica | 2 (S2-01,02,06) | 2 (S2-09,12) | 5 (S2-03,04,07,10,11,13,18) | 3 (S2-08,16,17) | 2 (S2-05,14,15) | 14 |
| 3 — Aislamiento multiempresa | 0 | 4 (S3-02,05,06,13) | 4 (S3-03,07,08,09,10) | 0 | 4 (S3-04,11,12) | 12 |
| 4 — Correctitud contable | 0 | 1 (S4-04=dup S1-03) | 2 (S4-02,05) | 2 (S4-01,03,06) | 1 (S4-07) | 6 |
| 5 — Calidad y arquitectura | 1 (S5-02) | 2 (S5-03,13,14) | 6 (S5-01,06,07,08,09,10,15) | 3 (S5-11,18,20) | 1 (S5-12) | 13 |
| **Total (únicos)** | **3** | **12** | **21** | **10** | **8** | **54** |

(*) Los duplicados entre secciones (S1-03↔S4-04, S2-02/06, S2-11↔S3-03, S5-17↔S1-06) se cuentan una sola vez en el total único. Las cifras por sección incluyen los duplicados para reflejar el alcance de cada bloque.

### 6.2 Cinco hallazgos que requieren atención más urgente

1. **S2-01 — Secreto JWT por defecto `"dev-secret"`** (`backend/src/lib/jwt.ts:3`). Si el despliegue no fija `JWT_SECRET`, cualquier atacante puede forjar tokens. Validar al arranque; rotar el secreto.
2. **S2-02 — Sin protección contra fuerza bruta en login.** `auth.routes.ts:7` sin rate-limit. Añadir `express-rate-limit` en `/api/auth/login` + bloqueo y auditoría.
3. **S3-06 — Fuga de saldos/indicadores entre empresas por `periodoId`** (`indicadores.controller.ts:27-29`; `libros-pdf.controller.ts:208`). Lectura cross-empresa pese a `requireEmpresa`. Acotar `periodoId` a `req.empresaId`.
4. **S1-03 / S4-04 — Reapertura de periodos de un año ya cerrado** (`periodos.controller.ts:74-106`). Permite alterar el balance tras el cierre. Bloquear el paso a `ABIERTO` si existe `CierreAnual`.
5. **S1-09 — Datos personales en tránsito sin cifrar (HTTP en LAN).** Vulnerable a sniffing en la red del despacho. Habilitar TLS local o documentar el riesgo residual y restringir la red.

### 6.3 Valoración general

El sistema **está técnicamente maduro en su núcleo contable**: partida doble estricta, consecutivos transaccionales, exportación de libros históricos, aislamiento por empresa bien diseñado (middleware + filtro), suite de 536 tests y CI en cada push. Los hallazgos **no invalidan** el modelo contable; la mayoría son de **seguridad técnica, control interno y sincronización de documentación**, y son corregibles sin rediseño.

Condiciones recomendadas para operar con datos reales de múltiples clientes **antes de aceptar la primera cartera**:

1. Fijar el secreto JWT y rotar (S2-01); poner rate-limit en login (S2-02).
2. Acotar `periodoId` en indicadores/provisiones y `id` en cuentas/empresas a `empresaId` (S3-05, S3-06, S3-07, S3-02).
3. Bloquear reapertura de periodos tras cierre anual (S1-03).
4. Subir la retención de respaldo a un esquema GFS de 5+ años (S1-07, S1-08) y cifrar respaldos/adjuntos (S1-10).
5. Habilitar TLS en la LAN o acotar la red y registrar descargas de adjuntos (S1-09, S1-11).
6. Sincronizar `docs/arquitectura.md`, `docs/manual-usuario.md` (política de contraseña y módulos faltantes) y `docs/modelo-datos.md` (S5-13 a S5-15).

Cumplidos esos puntos —junto con la habilitación de un lint/typecheck de backend y tests mínimos de frontend (S5-19, S5-02)— el sistema puede operar con datos reales de múltiples clientes del contador con un riesgo residual adecuado a un entorno local.

Auditoría de solo lectura. No se modificó ningún archivo del repositorio.