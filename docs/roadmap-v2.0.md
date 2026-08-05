# Roadmap V2.0 — Estudio contable multicliente y seguimiento por proceso

Este documento complementa `docs/roadmap-v1.1.md`, `docs/arquitectura.md` y
`docs/modelo-datos.md`. Define la reestructuración del sistema para convertirlo de una
aplicación de contabilidad para una sola empresa en el **cuaderno de trabajo digital de
un contador particular** que atiende a cualquier cliente, sabiendo en todo momento qué
proceso se le lleva a cada uno y con seguimiento de la cartera completa.

No se implementa nada de este documento hasta cerrar la **Fase 0** (diseño y decisiones).
Los módulos de V1.0/V1.1 se consideran estables; V2.0 es reestructuración estructural
(multientidad), integración y seguimiento — no nuevas reglas contables.

---

## 1. Visión

Una herramienta **fundamental pero funcional** para el contador:

- Atiende a **cualquier cliente que llegue**, sin reconfigurar el sistema.
- Muestra **claramente qué proceso se lleva a cada cliente** y en qué punto está.
- Permite **identificar y hacer seguimiento** de los procesos y de la cartera completa.
- **No busca reemplazar al profesional**: el sistema ordena, recuerda y calcula; el
  contador valida, decide y firma.

## 2. Principios rectores (no negociables)

1. **El contador es el dueño de la decisión.** El sistema calcula y propone; el contador
   aprueba. Nada de reclasificaciones o juicios automáticos.
2. **Todo queda auditable y reversible.** Se aprovecha la bitácora de auditoría existente.
3. **Local-first.** Sin dependencias de terceros (DIAN, PILA, bancos en línea) — igual que
   en V1.1, se apoya solo en datos que el sistema captura o calcula internamente.
4. **Una sola base de datos, multientidad por fila** (`empresaId`). Nunca una BD por
   cliente: eso impediría el panel de seguimiento global y complicaría respaldo y
   actualizaciones.
5. **La navegación sigue el flujo del proceso**, no la estructura de tablas.

## 3. Análisis del estado actual: mantener, modificar, agregar, descartar

### 3.1 Se mantiene (son la base del proceso)

| Módulo | Rol en V2.0 |
|---|---|
| Comprobantes/asientos, PUC, terceros, periodos, inventario, CxC/CxP | Núcleo del proceso contable de cada empresa |
| Cierre anual, provisión de cartera, nómina, presupuesto | Pasos del proceso (marcan actividades como completadas) |
| Indicadores, reportes y libros PDF | Entregables por cliente |
| Alertas y recordatorios | Se conectan al proceso (cada alerta indica cliente y proceso) |
| Bitácora de auditoría | Base del principio de auditabilidad; se extiende a empresa/proceso |
| Usuarios y roles | Se extiende con asignación de auxiliares a clientes |

### 3.2 Se modifica

- **`Parametro` (tabla singleton)** → datos propios de cada `Empresa` (se absorbe o se
  relaciona 1:1).
- **Todas las tablas de negocio** → scoping por `empresaId` (índices y unicidades ajustados).
- **Menú plano por tablas** → navegación por proceso: `Mis clientes → Empresa → Proceso → módulos`.
- **Dashboard** → cartera de clientes con el estado real de cada proceso (semáforo).
- **Terceros** → asociados a una empresa (cada cliente del contador tiene sus propios
  terceros; NIT único dentro de la empresa). Decisión: scoping por `empresaId`.

### 3.3 Se agrega

- **`Empresa`** (cliente del contador): identificación, parámetros, estado.
- **`ProcesoContable` + checklist de actividades + notas de seguimiento**: el corazón de
  la visión.
- **Conciliación bancaria simple** + importación de extractos CSV.
- **Documentos/soportes adjuntos** (almacenamiento local, incluidos en el respaldo).
- **Informes presentables por cliente** (juego completo PDF por periodo) y **exportación
  Excel/CSV** de reportes y libros.
- **Asignación de auxiliares a clientes** (permisos por empresa).

### 3.4 Se descarta explícitamente (no se agrega)

| Propuesta | Por qué no |
|---|---|
| Integraciones DIAN/PILA/bancos en línea | Dependencias externas; contradice lo local; no aporta al seguimiento |
| Multiidioma | No aporta a la visión; costo alto |
| Versión web pública / SaaS | Riesgo de seguridad y operación que el contador no necesita |
| Notificaciones externas (correo/SMS) | La fase de alertas es interna (panel), y así se mantiene |
| Más módulos de cálculo aislados | El riesgo de V1.1 fue acumular pantallas; V2.0 integra, no acumula |

> Nota: **no se elimina ningún módulo existente**; todos se reutilizan dentro del nuevo
> flujo. Lo que se "quita" son propuestas futuras que no aportan a la visión.

## 4. Decisión de diseño principal: multientidad

### 4.1 Opciones evaluadas

| Opción | Decisión |
|---|---|
| A. BD separada por cliente | **Descartada**: impide el panel global de seguimiento, complica respaldo y actualizaciones |
| B. Fila por empresa en la misma BD (`empresaId`) | **Elegida** |

### 4.2 Catálogo de cuentas (PUC)

- El PUC es norma colombiana (plan estándar), por lo que la mayoría de clientes lo comparte.
- **Decisión recomendada:** catálogo base global compartido (`empresaId` nulo) + cuentas
  propias por cliente cuando lo necesite (`empresaId` = cliente). En Fase 0 se valida con
  datos reales cuánto varía el catálogo entre clientes; si la variación es mínima, se
  simplifica a catálogo único.

### 4.3 Contexto de empresa activa

- El frontend mantiene la **empresa activa** y la refleja en la URL
  (`/empresa/:empresaId/...`), lo que permite tener varias pestañas y compartir enlaces.
- Backend: middleware `requireEmpresa` que valida que el usuario tenga acceso a la empresa
  (ADMIN/CONTADOR: todas; AUXILIAR: solo las asignadas).

### 4.4 Migración de datos

- La empresa actual del sistema se convierte en el **primer cliente** ("Empresa actual"),
  con sus datos en `Empresa`, y se asigna su `id` a todas las filas existentes en una sola
  transacción, previo respaldo (rollback si algo falla).
- Los usuarios actuales se conservan con acceso a esa empresa.

## 5. Fases de trabajo y desarrollo

### Fase 0 — Diseño y cierre de decisiones *(gate; no se avanza sin cerrarla)*

- Validar la variación real del PUC entre clientes y confirmar el modelo de cuentas
  (4.2).
- Inventario completo de tablas → `empresaId` (incluidas las relaciones y unicidades que
  hay que ajustar: `codigo`, `consecutivo`, `nombre` de periodos, etc.).
- Decidir si `Tercero` es estrictamente por empresa (recomendado) o compartible.
- Plan de migración de datos con respaldo, orden de ejecución y pruebas de reversión.
- Estimar el impacto en los tests existentes (helper de empresa de prueba).
- Definir la plantilla de actividades por defecto del proceso.

### Fase 1 — Multientidad (backend + BD)

- Modelo `Empresa`; `Parametro` pasa a ser por empresa (absorber o relación 1:1).
- `empresaId` en las tablas de negocio, índices y `@@unique` ajustados.
- Endpoints `/api/empresas` (CRUD, ADMIN) y selección de empresa activa.
- Middleware `requireEmpresa` + control de acceso por rol.
- Migración de datos: empresa actual → cliente 1.
- Adaptar la suite de tests (base `contabilidad_test`) al nuevo scoping.

### Fase 2 — Procesos contables y seguimiento *(el corazón de la visión)*

- Modelos sugeridos:

```prisma
enum EstadoProceso {
  SIN_INICIAR
  EN_PROCESO
  PENDIENTE
  AL_DIA
  CERRADO
}

model Empresa {
  id            String   @id @default(uuid())
  razonSocial   String
  nit           String   @unique
  direccion     String?
  telefono      String?
  email         String?
  activa        Boolean  @default(true)
  // parametros de la empresa (empresa, moneda, anio fiscal...)
}

model ProcesoContable {
  id         String        @id @default(uuid())
  empresaId  String
  anio       Int
  estado     EstadoProceso @default(SIN_INICIAR)
  // fechas clave: inicio, siguiente cierre, vencimiento de entregables
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  @@unique([empresaId, anio])
}

model ActividadProceso {
  id            Int    @id @default(autoincrement())
  procesoId     String
  tipo          String // COMPROBANTES, CONCILIACION, NOMINA, PROVISION, PRESUPUESTO, CIERRE_PERIODO, CIERRE_ANIO
  orden         Int
  estado        Boolean @default(false) // completada o no
  fechaEsperada DateTime? @db.Date
  fechaReal     DateTime? @db.Date
}

model NotaSeguimiento {
  id         String   @id @default(uuid())
  procesoId  String
  usuarioId  String
  texto      String
  createdAt  DateTime @default(now())
}
```

- Plantilla de actividades por defecto: comprobantes al día, conciliaciones, nómina
  liquidada y provisionada, provisión de cartera, presupuesto cargado, cierre de periodo,
  cierre de año.
- Endpoints: GET/POST/PUT de procesos, checklist de actividades y notas.
- Panel **"Cartera de clientes"** en el Dashboard: semáforo por proceso (verde al día,
  ámbar pendiente, rojo atrasado), antigüedad y acciones rápidas.
- Las alertas existentes se conectan al proceso (cada alerta indica cliente y proceso).
- Integración: cierre de periodo/año, nómina, provisión y presupuesto **marcan automáticamente**
  su actividad como completada.

### Fase 3 — Navegación por proceso y consolidación

- Reestructura del menú y de las rutas: `Mis clientes → Empresa → Proceso → módulos`.
- Vistas por cliente que agrupan su estado: comprobantes, nómina, cierre, presupuesto,
  alertas y proceso.
- Unificar pantallas sueltas de V1.1 como pasos del proceso.

### Fase 4 — Herramientas del proceso (conciliación, soportes, entregables)

- **Conciliación bancaria**: modelo `Conciliacion` / `MovimientoExtracto`, importación CSV
  con mapeo configurable, cruce con asientos (cuenta de bancos 1110), informe de
  diferencias y aprobación.
- **Adjuntos**: tabla `Adjunto` (entidad/entidadId, archivo en carpeta local, hash,
  usuario), subida/descarga en comprobantes y clientes, incluidos en el respaldo.
- **Entregables por cliente**: empaquetado PDF por periodo (juego completo) y exportación
  Excel/CSV de reportes y libros.

### Fase 5 — Permisos por cliente y administración

- Modelo `UsuarioEmpresa` (usuario, empresa, rol dentro de la empresa).
- AUXILIAR ve solo las empresas asignadas; menú y reportes filtrados.
- Bitácora de auditoría extendida a empresa/proceso (acciones del proceso).
- Gestión de clientes (activo/inactivo) y baja ordenada (exportación final).

### Fase 6 — Consolidación, respaldo y manuales

- Respaldo verificado por empresa (incluyendo adjuntos).
- Manuales de usuario y de operación actualizados al nuevo flujo.
- Cierre de V2.0: CHANGELOG, tag y despliegue.

## 6. Resumen de prioridad

| Fase | Qué aporta | Prioridad |
|---|---|---|
| 0 | Diseño y decisiones | Alta (gate) |
| 1 | Multientidad | Crítica |
| 2 | Procesos y seguimiento | Alta |
| 3 | Navegación por proceso | Alta |
| 4 | Conciliación, soportes, entregables | Media |
| 5 | Permisos por cliente | Media |
| 6 | Consolidación y manuales | Baja (cierre) |

## 7. Criterios de éxito

- El contador abre el sistema y ve **su cartera de clientes con el estado real de cada
  proceso**.
- Un cliente nuevo se incorpora en minutos (crear empresa + periodo) sin reconfigurar nada.
- Se puede reconstruir **qué se hizo y cuándo para cada cliente** (auditoría + notas de
  seguimiento).
- Nada de lo que el sistema calcula sustituye la revisión y la firma del contador: el
  sistema apoya el trabajo profesional, no lo reemplaza.

## 8. Notas de alcance

- Este roadmap es la base de la reestructuración; **no se implementa hasta cerrar la Fase 0**.
- Los módulos de V1.1 quedan funcionalmente congelados; los cambios de V2.0 son de
  scoping (multientidad), integración y seguimiento, no de reglas contables nuevas.
