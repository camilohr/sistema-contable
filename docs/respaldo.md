# Respaldo y restauración de la base de datos

El sistema incluye scripts de respaldo (pg_dump) y restauración (pg_restore / psql)
para PostgreSQL, con verificación automática de cada copia y **retención por
niveles** (esquema abuelo-padre-hijo, GFS).

## Requisitos

- PostgreSQL instalado (los binarios `pg_dump`, `pg_restore` y `psql` deben estar en
  el PATH o se localizan en `C:\Program Files\PostgreSQL\<versión>\bin`).
- La conexión a la base se toma de `DATABASE_URL` en `backend/.env`.
- Si las herramientas no se encuentran automáticamente, se pueden indicar con las
  variables `PGDUMP_PATH`, `PGRESTORE_PATH` y `PSQL_PATH`.

## Crear un respaldo

```bash
cd backend
npm run backup
```

Crea `backups\contabilidad_YYYYMMDD_HHMMSS.dump` (formato custom, comprimido) en la
carpeta `backups\` del proyecto, lo **verifica** con `pg_restore --list` y aplica la
**retención GFS** (ver más abajo).

Además del `.dump`, el respaldo genera un archivo hermano
`contabilidad_YYYYMMDD_HHMMSS.adjuntos.zip` con **toda la carpeta de adjuntos**
(`backend/adjuntos`, o la ruta indicada en `ADJUNTOS_DIR`). El ZIP usa el método
STORE (sin compresión, el contenido ya suele ser PDF/ofimático) implementado en
`backend/scripts/zip-lite.mjs` sin dependencias externas. Si la carpeta de adjuntos
no existe o está vacía, el ZIP no se genera y la restauración lo omite sin error.

Cada respaldo incluye además una **verificación por empresa**: el script consulta la
base (vía `psql`) y muestra en pantalla y en `backup.log` los conteos de objetos de
cada cliente (terceros, periodos, comprobantes, CxC/CxP, productos, activos fijos,
procesos, conciliaciones, adjuntos y usuarios asignados), con su estado activa/
inactiva. Como el `.dump` es una copia íntegra de la base verificada con
`pg_restore --list`, estos totales son los que debe contener el archivo; si un cliente
esperado no aparece o aparece con ceros, el respaldo puede estar incompleto. Si `psql`
no está disponible, se muestra un aviso y el respaldo **no se descarta** (la
verificación estructural con `pg_restore` sigue siendo la que valida el archivo).

Opciones:

| Comando | Efecto |
|---|---|
| `npm run backup -- --keep 30` | Retención simple: conserva las 30 copias más recientes (backward compat) |
| `npm run backup -- --daily 30 --monthly 12 --annual 5` | GFS con valores personalizados (estos son los defaults) |
| `npm run backup -- --dir C:\respaldos` | Guarda en otra carpeta |
| `npm run backup:list` | Lista los respaldos e indica si cada uno es `OK` o `CORRUPTO` |

### Cifrado de respaldos (S1-10)

Los respaldos pueden cifrarse en reposo con **AES-256-GCM** (implementación nativa de
Node, sin dependencias; `backend/scripts/cifrado.mjs`). Para activarlo basta definir
en `backend/.env`:

```
BACKUP_ENCRYPT_KEY=<frase de acceso larga y aleatoria>
```

Cuando la clave está definida, `backup.mjs`:

1. Crea y verifica el `.dump` (y el `adjuntos.zip`) como siempre.
2. Cifra ambos a `contabilidad_*.dump.enc` y `contabilidad_*.adjuntos.zip.enc` y
   **elimina los archivos en claro**.
3. La retención GFS/simple opera sobre los archivos cifrados con normalidad.

La frase de acceso debe respaldarse de forma segura: **sin ella no se puede restaurar
ningún respaldo cifrado**. Si se pierde, los respaldos quedan inaccesibles. Por eso se
recomienda guardarla en un gestor de contraseñas del despacho, separada de los
respaldos mismos.

### Retención GFS (abuelo-padre-hijo) — por defecto

El esquema de retención **por defecto** sigue la estrategia *grandfather-father-son*
(GFS), alineada con el Estatuto Tributario colombiano (art. 632, 5 años) y los
plazos de conservación de libros del Código de Comercio:

| Nivel | Conserva | Cantidad por defecto |
|---|---|---|
| **Diario** | Todas las copias de los últimos N días | 30 días |
| **Mensual** | La copia más reciente de cada mes | 12 meses |
| **Anual** | La copia más reciente de cada año | 5 años |

Con un respaldo diario programado, en cualquier momento habrá:

- ~30 copias diarias recientes (recuperación hasta el día anterior).
- 12 copias mensuales (recuperación a fin de mes de los últimos 12 meses).
- 5 copias anuales (recuperación por ejercicio contable de los últimos 5 años).

Las copias que no caen en ninguno de los tres niveles se eliminan automáticamente
(junto con su `.adjuntos.zip` hermano). Para retención simple (solo las N más
recientes, sin niveles), use `--keep N` (compatible con versiones anteriores).

> **Nota de cumplimiento normativo.** El Estatuto Tributario exige conservar
> respaldos durante 5 años; el Código de Comercio establece hasta 10 años para
> ciertos libros. El valor por defecto (`--annual 5`) cubre la obligación
> tributaria; si debe alinearse con el Código de Comercio, use `--annual 10`.

Cada respaldo se registra en `backups\backup.log` con fecha, tamaño y número de
objetos. Si la copia no supera la verificación se elimina y se registra el error.

## Programar respaldos automáticos (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File backend\scripts\programar-respaldo.ps1
```

Crea una tarea del Programador de Windows que ejecuta el respaldo **todos los días a
las 22:00** aplicando retención GFS (30 diarios / 12 mensuales / 5 anuales). Parámetros:

| Parámetro | Descripción | Valor por defecto |
|---|---|---|
| `-Keep` | Número de respaldos a conservar | `14` |
| `-Day` | `Daily` (todos los días) o un día de la semana (`Monday`…`Sunday`) | `Daily` |
| `-Time` | Hora de ejecución (formato `"HH:mm"`) | `"22:00"` |
| `-TaskName` | Nombre de la tarea de Windows | `SistemaContable-Respaldo` |

Ejemplo con respaldo diario y retención simple de 30 copias:

```powershell
powershell -ExecutionPolicy Bypass -File backend\scripts\programar-respaldo.ps1 -Day Daily -Time "22:00" -Keep 30
```

## Copia externa opcional (disco USB u otra carpeta)

Para disponer de una copia fuera del disco del servidor, defina
`BACKUP_COPIA_EXTERNA_DIR` en `backend/.env` con la ruta de destino (por ejemplo, un
disco USB: `BACKUP_COPIA_EXTERNA_DIR="X:\respaldo-sistema-contable"`). En cada
`npm run backup`:

1. Se crea y verifica el respaldo local en `backups\`.
2. Si la ruta externa existe, se copian el `.dump` y su `.adjuntos.zip` a esa carpeta
   (se sobrescriben las versiones anteriores con el mismo nombre).
3. Si la ruta no está disponible (por ejemplo, el USB no está conectado), el respaldo
   local se genera igual y se registra un `AVISO copia-externa` y un
   `ERROR copia-externa` por archivo en `backups\backup.log`.

Cada acierto u omisión queda registrado en `backup.log` para su revisión.

## Alerta de respaldo desactualizado

Si el sistema tiene activa la regla de alertas **Respaldo desactualizado** (viene
activa por defecto con umbral de 2 días), el panel de alertas mostrará una alerta de
severidad **ALTA** cuando el último respaldo exitoso registrado en `backup.log` tenga
más de ese número de días de antigüedad, o cuando no exista ningún respaldo
registrado. La regla se puede ajustar o desactivar desde *Alertas y recordatorios*;
el registro se lee de `backups\backup.log` (o de `BACKUP_LOG_PATH` si está definido
en `backend/.env`).

## Restaurar un respaldo

> La restauración reemplaza los objetos de la base de datos de destino. Realícela
> con la aplicación detenida y preferiblemente primero en una base de prueba.

```bash
cd backend
# 1. Previsualización (no modifica nada): muestra qué contiene el respaldo
node scripts/restore.mjs "..\backups\contabilidad_20260803_143507.dump"

# 2. Restauración real en la base de DATABASE_URL
node scripts/restore.mjs "..\backups\contabilidad_20260803_143507.dump" --confirm

# 3. Restaurar en otra base (por ejemplo, una copia de prueba)
node scripts/restore.mjs "..\backups\contabilidad_20260803_143507.dump" --confirm --target "postgresql://usuario:clave@localhost:5432/contabilidad_prueba"

# 4. Solo listar el contenido
node scripts/restore.mjs "..\backups\contabilidad_20260803_143507.dump" --list
```

Formatos admitidos: `.dump` (pg_restore), `.sql` (psql con `ON_ERROR_STOP=1`) y sus
versiones **cifradas** `.dump.enc` / `.sql.enc`. Para restaurar un respaldo cifrado,
`BACKUP_ENCRYPT_KEY` debe estar definida en `backend/.env` con la misma frase de
acceso que se usó al crearlo; el script descifra a un archivo temporal, opera y lo
elimina al terminar. Sin la clave correcta, la restauración aborta con error.

Si existe el archivo `contabilidad_YYYYMMDD_HHMMSS.adjuntos.zip` junto al `.dump`,
la restauración con `--confirm` lo **extrae automáticamente** en la carpeta de
adjuntos (`backend/adjuntos` o `ADJUNTOS_DIR`), dejando la información contable y
sus documentos asociados consistentes. Se puede configurar `ADJUNTOS_DIR` antes de
restaurar para que los adjuntos vayan a otra ubicación.

## Procedimiento de restauración recomendado

1. Detener el servicio del backend (PM2 o la ventana de Node).
2. Crear una base temporal y restaurar allí la copia para validar el archivo:
   ```sql
   CREATE DATABASE contabilidad_prueba;
   ```
   `node scripts/restore.mjs <archivo> --confirm --target "postgresql://.../contabilidad_prueba"`
3. Verificar datos clave (usuarios, cuentas, saldos) en la base temporal.
4. Restaurar en la base de producción con `--confirm`.
5. Iniciar nuevamente el backend y probar el acceso.

## Notas

- Los respaldos contienen información contable sensible: la carpeta `backups\` está
  excluida del control de versiones; protéjala con permisos del sistema y considere
  copiarla a un medio externo. El ZIP de adjuntos tiene la misma sensibilidad que la
  base de datos: no se debe distribuir sin cifrado. Con `BACKUP_ENCRYPT_KEY` definida,
  tanto el `.dump` como el `adjuntos.zip` quedan cifrados en reposo (AES-256-GCM).
- La retención elimina por cada `.dump` sobrante su archivo `.adjuntos.zip`
  asociado, para que no queden respaldos huérfanos.
- La restauración usa `--clean --if-exists --no-owner --no-privileges`, es decir,
  elimina los objetos existentes antes de recrearlos sin exigir los mismos roles de
  propietario del servidor original.
