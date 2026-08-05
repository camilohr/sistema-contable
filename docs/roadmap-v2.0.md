# Roadmap V2.0 — Estudio contable multicliente, seguimiento por proceso y exportación de informes

Esta es la versión consolidada del roadmap V2.0, construida sobre la propuesta ya
existente en el repositorio. Mantiene su visión, sus principios rectores y su
estructura de fases porque están bien planteados; lo que hace este documento es
**cerrar las decisiones que quedaron abiertas en la Fase 0** (con el schema real del
proyecto como base) y **añadir la exportación de informes** como pieza explícita del
alcance, a solicitud directa del contador.

No se implementa nada de este documento hasta cerrar la **Fase 0**. Los módulos de
V1.0/V1.1 se consideran estables; V2.0 es reestructuración estructural (multientidad),
integración, seguimiento y exportación — no nuevas reglas contables.

---

## 1. Visión

Una herramienta **fundamental pero funcional** para el contador:

- Atiende a **cualquier cliente que llegue**, sin reconfigurar el sistema.
- Muestra **claramente qué proceso se lleva a cada cliente** y en qué punto está.
- Permite **identificar y hacer seguimiento** de los procesos y de la cartera completa.
- Permite **entregar información** a cada cliente en formatos que puede usar fuera del
  sistema (PDF, Excel), sin que eso dependa de ningún servicio externo.
- **No busca reemplazar al profesional**: el sistema ordena, recuerda y calcula; el
  contador valida, decide y firma.

## 2. Principios rectores (no negociables)

1. **El contador es el dueño de la decisión.** El sistema calcula y propone; el
   contador aprueba. Nada de reclasificaciones o juicios automáticos.
2. **Todo queda auditable y reversible.** Se aprovecha la bitácora de auditoría
   existente.
3. **Local-first.** Sin dependencias de terceros (DIAN, PILA, bancos en línea) — igual
   que en V1.1, se apoya solo en datos que el sistema captura o calcula internamente.
   La exportación de informes tampoco depende de ningún servicio externo: los archivos
   se generan y descargan localmente.
4. **Una sola base de datos, multientidad por fila** (`empresaId`). Nunca una BD por
   cliente: eso impediría el panel de seguimiento global y complicaría respaldo y
   actualizaciones.
5. **La navegación sigue el flujo del proceso**, no la estructura de tablas.
6. **La configuración tiene un valor por defecto y puede tener excepción por cliente,
   nunca al revés.** Aplica a tarifas, parámetros y catálogo de cuentas (ver §4.3):
   siempre existe un valor general que funciona sin configurar nada, y solo se
   personaliza cuando un cliente concreto lo necesita.

## 3. Análisis del estado actual: mantener, modificar, agregar, descartar

### 3.1 Se mantiene (son la base del proceso)

| Módulo | Rol en V2.0 |
|---|---|
| Comprobantes/asientos, PUC, terceros, periodos, inventario, CxC/CxP | Núcleo del proceso contable de cada empresa |
| Cierre anual, provisión de cartera, nómina, presupuesto | Pasos del proceso (marcan actividades como completadas) |
| Indicadores, reportes y libros PDF | Entregables por cliente (ver §3.3, se amplían) |
| Alertas y recordatorios | Se conectan al proceso (cada alerta indica cliente y proceso) |
| Bitácora de auditoría | Base del principio de auditabilidad; se extiende a empresa/proceso |
| Usuarios y roles | Se extiende con asignación de auxiliares a clientes |

### 3.2 Se modifica

- **`Parametro` (tabla singleton)** → datos propios de cada `Empresa` (se absorbe o se
  relaciona 1:1).
- **Todas las tablas de negocio** → scoping por `empresaId` (índices y unicidades
  ajustados; inventario completo en §4.4).
- **Menú plano por tablas** → navegación por proceso:
  `Mis clientes → Empresa → Proceso → módulos`.
- **Dashboard** → cartera de clientes con el estado real de cada proceso (semáforo).
- **Terceros** → asociados a una empresa (cada cliente del contador tiene sus propios
  terceros; NIT único dentro de la empresa).
- **Reportes existentes (`reportes.controller.ts`, `libros-pdf.controller.ts`)** → se
  amplían con exportación completa (ver §3.3 y Fase 4).

### 3.3 Se agrega

- **`Empresa`** (cliente del contador): identificación, parámetros, estado.
- **`UsuarioEmpresa`**: acceso y rol de cada usuario por cliente (detalle en §4.5).
- **`ProcesoContable` + checklist de actividades + notas de seguimiento**: el corazón
  de la visión.
- **Conciliación bancaria simple** + importación de extractos CSV.
- **Documentos/soportes adjuntos** (almacenamiento local, incluidos en el respaldo).
- **Exportación de informes**, como pieza propia y no como nota al margen:
  - Excel/CSV para todos los reportes que hoy solo existen en JSON (balance de
    comprobación, balance general, estado de resultados, indicadores, libro diario,
    libro mayor).
  - PDF para los reportes que hoy no lo tienen (balance general, estado de resultados,
    indicadores) — hoy el PDF solo cubre libro diario, libro mayor y libro de
    inventarios.
  - **Paquete completo por cliente/periodo**: un solo botón que empaqueta todos los
    informes de un cliente y un periodo (o año) en una carpeta/zip, lista para
    entregar. Detalle completo en Fase 4.
- **Asignación de auxiliares a clientes** (permisos por empresa).

### 3.4 Se descarta explícitamente (no se agrega)

| Propuesta | Por qué no |
|---|---|
| Integraciones DIAN/PILA/bancos en línea | Dependencias externas; contradice lo local; no aporta al seguimiento |
| Multiidioma | No aporta a la visión; costo alto |
| Versión web pública / SaaS | Riesgo de seguridad y operación que el contador no necesita |
| Notificaciones externas (correo/SMS) | La fase de alertas es interna (panel), y así se mantiene |
| Firma electrónica de los PDF exportados | Corresponde a certificados y validación externa; fuera del alcance local-first |
| Más módulos de cálculo aislados | El riesgo de V1.1 fue acumular pantallas; V2.0 integra, no acumula |

> Nota: **no se elimina ningún módulo existente**; todos se reutilizan dentro del
> nuevo flujo. Lo que se "quita" son propuestas futuras que no aportan a la visión.

## 4. Decisiones de Fase 0 (cerradas)

Esta es la sección que en la versión anterior quedaba como "pendiente de decidir en
Fase 0". Aquí se cierra, con el schema real del proyecto como referencia.

### 4.1 Multientidad: fila por empresa

| Opción | Decisión |
|---|---|
| A. BD separada por cliente | **Descartada**: impide el panel global de seguimiento, complica respaldo y actualizaciones |
| B. Fila por empresa en la misma BD (`empresaId`) | **Elegida** |

### 4.2 Catálogo de cuentas (PUC)

**Decisión:** catálogo base global compartido (`empresaId` nulo) + cuentas propias por
cliente cuando lo necesite (`empresaId` = cliente). El PUC es norma colombiana
estándar, así que la gran mayoría de clientes no necesita tocarlo; permitir la
excepción por cliente cubre los casos donde sí (subcuentas propias, por ejemplo).

### 4.3 Parámetros configurables: patrón "global por defecto + excepción por cliente"

El documento anterior dejaba abierto si `ParametroProvision`, `ParametroNomina`,
`ParametroCuentaNomina` y `ReglaAlerta` debían ser por cliente o generales. Se resuelve
aplicando un solo patrón consistente a los cuatro, coherente con la decisión ya tomada
para el PUC (§4.2) y elevado a principio rector (§2.6):

| Tabla | `empresaId` | Razón |
|---|---|---|
| `ParametroNomina` | **Nulo por defecto, con override por empresa** | Los topes y tarifas (SMLMV, porcentajes de aportes) son de ley y aplican igual a todos los clientes; muy pocos necesitarán una excepción. |
| `ParametroCuentaNomina` | **Por empresa** | El mapeo a cuentas contables depende del PUC de cada cliente, que sí puede variar. |
| `ParametroProvision` | **Nulo por defecto, con override por empresa** | Los rangos de mora (30/60/90 días) son una política razonable general, pero un cliente puede pactar una política de cartera distinta con el contador. |
| `ReglaAlerta` | **Global (sin `empresaId`)** | Son reglas de comportamiento del sistema (qué avisa y con cuánta anticipación), no configuración contable del cliente. Se activan/desactivan igual para todos. |

Regla de resolución en tiempo de ejecución: al buscar un parámetro, el sistema primero
busca si existe un registro con `empresaId` igual al de la empresa activa; si no
existe, usa el registro con `empresaId = null` (el general). Esto evita duplicar
configuración para el 90% de los clientes que no necesitan personalización.

### 4.4 Inventario completo de tablas → `empresaId`

Inventario basado en el `schema.prisma` real del repositorio (23 modelos).
"Scoping directo" = la tabla lleva `empresaId` propio. "Scoping heredado" = no lleva
`empresaId` propio porque siempre se llega a ella a través de una tabla que sí lo
tiene (evita duplicar la columna donde no aporta).

| Modelo | Scoping | Unicidad actual → nueva |
|---|---|---|
| `Usuario` | Global (el equipo del contador, no del cliente) | `email` sigue global |
| `Cuenta` | Directo (nulo = catálogo base, ver §4.2) | `codigo` único → único por `[empresaId, codigo]` (con `empresaId` nulo como caso base) |
| `Tercero` | Directo | `[tipoDocumento, documento]` → `[empresaId, tipoDocumento, documento]` |
| `Parametro` | Se absorbe en `Empresa` (relación 1:1) | — |
| `Periodo` | Directo | `nombre` único → único por `[empresaId, nombre]` |
| `Comprobante` | Directo | `[tipo, consecutivo]` → `[empresaId, tipo, consecutivo]` |
| `Asiento` | Heredado (vía `Comprobante`) | sin cambio |
| `Consecutivo` | Directo | clave primaria `tipo` → `[empresaId, tipo]` |
| `CuentaPorCobrar` / `CuentaPorPagar` | Directo | sin unicidad global hoy; se agrega índice `empresaId` |
| `Recibo` / `Pago` | Heredado (vía `Comprobante`/CxC-CxP) | sin cambio |
| `Producto` | Directo | `codigo` único → único por `[empresaId, codigo]` |
| `InventarioMovimiento` | Heredado (vía `Producto`) | sin cambio |
| `ActivoFijo` | Directo | sin cambio de unicidad |
| `Depreciacion` | Heredado (vía `ActivoFijo`) | sin cambio |
| `Auditoria` | Directo (para poder filtrar "qué pasó con el cliente X") | sin cambio |
| `CierreAnual` | Directo | `anio` único → único por `[empresaId, anio]` |
| `ParametroProvision` | Ver §4.3 (nulo por defecto + override) | `[diasDesde, diasHasta]` → `[empresaId, diasDesde, diasHasta]` |
| `ProvisionCartera` | Heredado (vía `Periodo`, que ya es directo) | `periodoId` único se mantiene (periodo ya es único por empresa) |
| `Empleado` | Heredado (vía `Tercero`, que ya es directo) | sin cambio |
| `Nomina` / `ProvisionNomina` | Heredado (vía `Empleado`/`Periodo`) | sin cambio |
| `ParametroNomina` | Ver §4.3 (nulo por defecto + override) | `anio` único → único por `[empresaId, anio]` (`empresaId` nulo = general) |
| `ParametroCuentaNomina` | Directo (§4.3) | `concepto` único → único por `[empresaId, concepto]` |
| `Presupuesto` | Heredado (vía `Cuenta`/`Periodo`, ya directos) | sin cambio |
| `ReglaAlerta` | Global (§4.3) | sin cambio |

Regla general para las migraciones: cada tabla con scoping directo recibe
`empresaId String?` (nulo permitido solo donde §4.2/§4.3 lo definen como base/general;
en el resto, `empresaId String` obligatorio) más un índice `@@index([empresaId])`.

### 4.5 Modelo `UsuarioEmpresa` (detalle que faltaba)

```prisma
enum RolEmpresa {
  ADMIN
  CONTADOR
  AUXILIAR
}

model UsuarioEmpresa {
  id         String     @id @default(uuid())
  usuarioId  String
  empresaId  String
  rol        RolEmpresa @default(AUXILIAR)
  activo     Boolean    @default(true)
  createdAt  DateTime   @default(now())

  usuario Usuario @relation(fields: [usuarioId], references: [id])
  empresa Empresa @relation(fields: [empresaId], references: [id])

  @@unique([usuarioId, empresaId])
  @@index([empresaId])
}
```

**Reglas de negocio:**

- `Usuario.rol` (el rol global) define lo que un usuario puede hacer *en general*
  (p. ej. si puede crear otros usuarios, que sigue siendo una operación de ADMIN a
  nivel de sistema). `UsuarioEmpresa.rol` define lo que puede hacer *en el contexto de
  un cliente concreto* — pueden diferir: un AUXILIAR global puede ser CONTADOR de
  confianza en un cliente específico si el contador titular así lo decide.
- Un ADMIN global tiene acceso implícito a todas las empresas (no necesita fila en
  `UsuarioEmpresa` para cada una); un AUXILIAR o CONTADOR global solo ve las empresas
  donde tenga una fila `activo = true`.
- El middleware `requireEmpresa` (Fase 1) resuelve el rol efectivo como el más
  restrictivo entre el rol global y el rol en `UsuarioEmpresa` para esa empresa.

### 4.6 Contexto de empresa activa

- El frontend mantiene la **empresa activa** y la refleja en la URL
  (`/empresa/:empresaId/...`), lo que permite tener varias pestañas y compartir
  enlaces.
- Backend: middleware `requireEmpresa` que valida que el usuario tenga acceso a la
  empresa según §4.5.

### 4.7 Migración de datos

- La empresa actual del sistema se convierte en el **primer cliente**
  ("Empresa actual"), con sus datos en `Empresa` (migrados desde `Parametro`), y se
  asigna su `id` a todas las filas existentes con scoping directo, en una sola
  transacción, previo respaldo (rollback si algo falla).
- Los usuarios actuales se conservan; se crea su fila `UsuarioEmpresa` para la
  "Empresa actual" con el mismo rol que ya tenían.
- El catálogo de cuentas actual se conserva como catálogo base (`empresaId` nulo), no
  como cuentas propias del primer cliente — así queda disponible para los clientes
  nuevos desde el primer día.

## 5. Fases de trabajo y desarrollo

### Fase 0 — Diseño y cierre de decisiones *(gate; ya cerrada por este documento)*

- ~~Validar la variación real del PUC entre clientes~~ → resuelto en §4.2.
- ~~Inventario completo de tablas → `empresaId`~~ → resuelto en §4.4.
- ~~Decidir si `Tercero` es por empresa~~ → resuelto en §4.4 (directo).
- ~~Modelo `UsuarioEmpresa`~~ → resuelto en §4.5.
- ~~Plan de migración probado contra los datos reales~~ → resuelto: la migración de
  §4.7 se ejecutó sobre la BD real con respaldo previo (`backups/`); la empresa actual
  pasó a ser el cliente 1 y sus datos (antes en `Parametro`) se absorbieron en
  `Empresa`.
- ~~Impacto en los tests existentes y en el seed demo~~ → resuelto: helper de "empresa
  de prueba" en `backend/tests/helpers.ts` + cliente Prisma de test que inyecta
  `empresaId`; el seed demo (`backend/scripts/seed-demo.mjs`) envía `X-Empresa-Id`.
- ~~Pendiente real: definir la plantilla de actividades por defecto del proceso (lista
  concreta de qué actividades trae un `ProcesoContable` nuevo)~~ → resuelto al inicio de
  la Fase 2: plantilla de 7 actividades ordenadas generada en código
  (`backend/src/lib/procesos.ts`): comprobantes, conciliación, nómina, provisión de
  cartera, presupuesto, cierre de periodo y cierre de año.

### Fase 1 — Multientidad (backend + BD) *(implementada el 2026-08-05)*

- ~~Modelo `Empresa`; `Parametro` se absorbe en `Empresa`.~~
- ~~`empresaId` en las tablas de negocio según el inventario de §4.4; índices y
  `@@unique` ajustados.~~
- ~~Modelo `UsuarioEmpresa` (§4.5).~~
- ~~Endpoints `/api/empresas` y selección de empresa activa.~~ → implementado:
  `GET /api/empresas` (empresas del usuario autenticado con su rol efectivo) +
  selector de empresa en el frontend (header `X-Empresa-Id`, empresa en la URL
  `/empresa/:empresaId`). El CRUD de clientes (crear/editar/desactivar) queda en la
  Fase 5 (gestión de clientes).
- ~~Middleware `requireEmpresa` + resolución de rol efectivo (§4.5).~~
- ~~Migración de datos: empresa actual → cliente 1 (§4.7).~~
- ~~Adaptar la suite de tests (helper de empresa de prueba) y el seed de datos demo.~~

Estado: suite backend en verde (318 tests, 18 archivos); typecheck y build limpios en
backend y frontend; selector de empresa validado en navegador (aislamiento de datos
entre empresas).

### Fase 2 — Procesos contables y seguimiento *(implementada el 2026-08-05)*

Modelos:

```prisma
enum EstadoProceso {
  SIN_INICIAR
  EN_PROCESO
  PENDIENTE
  AL_DIA
  CERRADO
}

enum TipoActividadProceso {
  COMPROBANTES
  CONCILIACION
  NOMINA
  PROVISION_CARTERA
  PRESUPUESTO
  CIERRE_PERIODO
  CIERRE_ANIO
}

model ProcesoContable {
  id         String        @id @default(uuid())
  empresaId  String
  anio       Int
  estado     EstadoProceso @default(SIN_INICIAR)
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  empresa    Empresa @relation(fields: [empresaId], references: [id])
  actividades ActividadProceso[]
  notas       NotaSeguimiento[]

  @@unique([empresaId, anio])
  @@index([empresaId])
}

model ActividadProceso {
  id            Int                  @id @default(autoincrement())
  procesoId     String
  tipo          TipoActividadProceso
  orden         Int
  estado        Boolean              @default(false)
  fechaEsperada DateTime?            @db.Date
  fechaReal     DateTime?            @db.Date
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  proceso ProcesoContable @relation(fields: [procesoId], references: [id], onDelete: Cascade)

  @@index([procesoId])
}

model NotaSeguimiento {
  id        String   @id @default(uuid())
  procesoId String
  usuarioId String
  texto     String
  createdAt DateTime @default(now())

  proceso ProcesoContable @relation(fields: [procesoId], references: [id], onDelete: Cascade)
  usuario Usuario         @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([procesoId])
}
```

- ~~Plantilla de actividades por defecto~~ → implementada en `backend/src/lib/procesos.ts`:
  comprobantes al día, conciliaciones, nómina liquidada y provisionada, provisión de
  cartera, presupuesto cargado, cierre de periodo y cierre de año (orden 1 a 7). El
  `ProcesoContable` se crea siempre con su plantilla; las actividades llevan
  `fechaEsperada`/`fechaReal` opcionales.
- ~~Endpoints de procesos, checklist y notas~~ → implementados bajo `/api/procesos`:
  `GET/POST /api/procesos`, `GET/PATCH/DELETE /api/procesos/:id`,
  `PATCH /api/procesos/:id/actividades/:actividadId` (marcar/desmarcar y fecha
  esperada), `POST /api/procesos/:id/notas` y `GET /api/procesos/cartera` (todas las
  empresas del usuario con su semáforo). Roles: crear/editar/marcar/notas
  ADMIN+CONTADOR, eliminar ADMIN, lectura AUXILIAR.
- ~~Panel "Cartera de clientes" en el Dashboard~~ → implementado: semáforo por proceso
  (verde al día, ámbar en proceso, rojo pendiente) y página "Seguimiento por procesos"
  con la lista por año, el checklist de actividades, las notas de seguimiento y el
  cambio de estado.
- Integración automática: cierre de periodo y de año, nómina, provisión de cartera,
  presupuesto y contabilización de comprobantes **marcan** su actividad como completada
  dentro de la misma transacción (si el proceso del año existe; si no, no se crea).
- Las alertas existentes se conectan al proceso en la Fase 3 (navegación por proceso).

Estado: suite backend en verde (338 tests, 19 archivos); typecheck y lint/build limpios
en backend y frontend.

### Fase 3 — Navegación por proceso y consolidación *(implementada el 2026-08-05)*

- ~~Reestructura del menú y de las rutas: `Mis clientes → Empresa → Proceso → módulos`.~~ →
  implementado: el menú lateral se agrupa por pasos del proceso (Proceso, Ciclo del mes,
  Información, Catálogos y Administración) y la landing de cada empresa es ahora la vista
  "Resumen del proceso"; el grid de módulos queda en "Menú de módulos".
- ~~Vistas por cliente que agrupan su estado: comprobantes, nómina, cierre, presupuesto,
  alertas y proceso.~~ → implementado con `GET /api/resumen` (estado consolidado de la
  empresa activa: proceso del año con semáforo, comprobantes, periodos, nómina,
  provisión, presupuesto, cierre anual y conteo de alertas) y la página `Resumen`
  (`/empresa/:empresaId`) con tarjetas de estado y acciones rápidas hacia cada módulo,
  junto con el panel de alertas y la cartera de clientes (semáforo).
- ~~Unificar pantallas sueltas de V1.1 como pasos del proceso.~~ → el menú agrupado
  presenta los módulos como pasos del ciclo contable de cada cliente.
- Las alertas existentes ya son por empresa y quedan conectadas al proceso desde el
  resumen (conteo por severidad en la misma vista del proceso).

Estado: suite backend en verde (346 tests, 20 archivos); typecheck y lint/build limpios
en backend y frontend.

### Fase 4 — Herramientas del proceso: conciliación, soportes y exportación de informes *(implementada el 2026-08-05)*

**Conciliación bancaria**
- ~~Modelo `Conciliacion` / `MovimientoExtracto`, importación CSV con mapeo
  configurable, cruce con asientos (cuenta de bancos 1110), informe de diferencias y
  aprobación.~~ → implementado:
  - Tablas `Conciliacion` (única por `[empresaId, periodoId, cuentaId]`, saldos de
    libros y extracto, diferencia, estado EN_PROCESO/APROBADA/ANULADA, aprobador) y
    `MovimientoExtracto` (hash único, cruce opcional con `Asiento` vía `asientoId`).
  - Endpoints bajo `/api/conciliaciones`: listar/detalle (lectura todos los roles),
    crear, importar CSV, cruzar, aprobar y anular (ADMIN/CONTADOR). La importación es
    idempotente por hash de movimiento, cruza automáticamente con los asientos de la
    cuenta de bancos (1110) del periodo y calcula la diferencia. Aprobar marca la
    actividad `CONCILIACION` del proceso como completada y registra auditoría.
  - CSV: delimitador `;` o `,`, mapeo de columnas configurable
    (`fechaCol`, `referenciaCol`, `descripcionCol`, `debitoCol`, `creditoCol`,
    `saldoCol`), UTF-8 con/sin BOM, validación de filas con reporte de errores.
  - Frontend: página "Conciliación bancaria" (crear, importar extracto, listado con
    diferencias, detalle de movimientos con estado de cruce, aprobar/anular).

**Adjuntos**
- ~~Tabla `Adjunto` (entidad/entidadId, archivo en carpeta local, hash, usuario),
  subida/descarga en comprobantes y clientes, incluidos en el respaldo.~~ → implementado:
  - Tabla `Adjunto` (entidad COMPROBANTE/EMPRESA, entidadId, nombre original y
    archivo seguro, mime, tamaño, hash SHA-256, usuario). Archivos en
    `backend/adjuntos/` (o `ADJUNTOS_DIR`), con nombre aleatorio seguro y límite de
    15 MB.
  - Endpoints bajo `/api/adjuntos`: subir (multipart), listar por entidad,
    descargar y eliminar (ADMIN/CONTADOR); todo con auditoría
    (`SUBIR_ADJUNTO`/`ELIMINAR_ADJUNTO`).
  - **Respaldo integrado**: `npm run backup` genera además un ZIP
    (`contabilidad_YYYYMMDD_HHMMSS.adjuntos.zip`) con toda la carpeta de adjuntos
    (método STORE, sin dependencias, `backend/scripts/zip-lite.mjs`); la restauración
    lo extrae automáticamente. Ver `docs/respaldo.md`.
  - Frontend: componente `AdjuntosLista` en el detalle de comprobantes y en el
    resumen de cada empresa.

**Exportación de informes** *(ampliado por solicitud explícita del contador)*

Estado actual verificado en el repositorio: `reportes.controller.ts` devuelve JSON para
libro diario, libro mayor, balance de comprobación, balance general, estado de
resultados e indicadores; `libros-pdf.controller.ts` solo cubre libro diario, libro
mayor y libro de inventarios en PDF. No existe hoy ninguna exportación a Excel/CSV.

Alcance de la fase:

1. **Completar el PDF que falta**: balance general, estado de resultados e
   indicadores, siguiendo el mismo patrón ya usado en `libros-pdf.controller.ts`
   (encabezado con datos de la empresa activa, numeración de folio).
2. **Excel/CSV para todos los reportes**: misma consulta que ya usa cada endpoint
   JSON, servida también como `.xlsx`/`.csv` (parámetro `?formato=xlsx` o ruta
   `.xlsx`, coherente con el patrón `.pdf` ya usado). Útil cuando el contador o el
   cliente necesitan seguir trabajando la información (ajustar, graficar, entregar a
   un tercero) en vez de solo consultarla o imprimirla.
3. **Paquete completo por cliente/periodo**: un endpoint
   `POST /api/empresas/:empresaId/informes/paquete` que recibe un periodo o año y
   devuelve un `.zip` con todos los informes de ese cliente en PDF (libros + estados
   financieros + indicadores), listo para entregar. Pensado para el momento en que el
   contador cierra un mes o un año con un cliente y necesita mandarle "todo" de una
   vez, sin generar archivo por archivo.
4. Todo generado y servido localmente desde el backend — coherente con el principio
   local-first (§2.3): no se sube a ningún servicio externo, el contador decide cómo
   la comparte con su cliente.

- ~~Implementación de 1-3~~ → completada: PDF de balance general, estado de resultados
  e indicadores (`/api/reportes/balance-general.pdf`, `estado-resultados.pdf`,
  `indicadores/:periodoId.pdf`), exportación CSV (con BOM UTF-8 y `;`) y XLSX de los
  seis reportes (rutas `*.csv`/`*.xlsx` o `?formato=`), y paquete ZIP de informes por
  periodo o año. El frontend de "Libros y reportes" ofrece los botones PDF, CSV, XLSX
  y "Paquete de informes (ZIP)".

Estado: suite backend en verde (378 tests, 23 archivos); typecheck y build limpios en
backend y frontend; respaldo con adjuntos probado (creación, verificación y
restauración del ZIP).

### Fase 5 — Permisos por cliente y administración

- `UsuarioEmpresa` ya definido en §4.5; se implementa la UI de administración
  (asignar/retirar usuarios de una empresa, cambiar su rol en esa empresa).
- AUXILIAR ve solo las empresas asignadas; menú y reportes filtrados.
- Bitácora de auditoría extendida a empresa/proceso (acciones del proceso).
- Gestión de clientes (activo/inactivo) y baja ordenada (exportación final usando el
  paquete completo de Fase 4).

### Fase 6 — Consolidación, respaldo y manuales

- Respaldo verificado por empresa (incluyendo adjuntos).
- Manuales de usuario y de operación actualizados al nuevo flujo, incluida la
  exportación de informes.
- Cierre de V2.0: CHANGELOG, tag y despliegue.

## 6. Resumen de prioridad

| Fase | Qué aporta | Prioridad |
|---|---|---|
| 0 | Diseño y decisiones | Cerrada por este documento |
| 1 | Multientidad | Crítica | ✅ Implementada (2026-08-05) |
| 2 | Procesos y seguimiento | Alta | ✅ Implementada (2026-08-05) |
| 3 | Navegación por proceso | Alta | ✅ Implementada (2026-08-05) |
| 4 | Conciliación, soportes, exportación de informes | Media-alta *(subió por solicitud explícita)* | ✅ Implementada (2026-08-05) |
| 5 | Permisos por cliente | Media |
| 6 | Consolidación y manuales | Baja (cierre) |

## 7. Criterios de éxito

- El contador abre el sistema y ve **su cartera de clientes con el estado real de cada
  proceso**.
- Un cliente nuevo se incorpora en minutos (crear empresa + periodo) sin reconfigurar
  nada, salvo la excepción puntual que necesite (§4.3).
- Se puede reconstruir **qué se hizo y cuándo para cada cliente** (auditoría + notas de
  seguimiento).
- El contador puede **entregarle a cualquier cliente un juego completo de informes**
  (PDF o Excel) en un solo paso, sin depender de ningún servicio externo.
- Nada de lo que el sistema calcula sustituye la revisión y la firma del contador: el
  sistema apoya el trabajo profesional, no lo reemplaza.

## 8. Notas de alcance

- Este roadmap reemplaza a la versión anterior de `docs/roadmap-v2.0.md`; conserva su
  visión y estructura y cierra los puntos que quedaban abiertos en Fase 0, además de
  incorporar la exportación de informes como alcance explícito.
- Los módulos de V1.1 quedan funcionalmente congelados; los cambios de V2.0 son de
  scoping (multientidad), integración, seguimiento y exportación, no de reglas
  contables nuevas.
