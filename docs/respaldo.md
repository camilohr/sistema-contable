# Respaldo y restauración de la base de datos

El sistema incluye scripts de respaldo (pg_dump) y restauración (pg_restore / psql)
para PostgreSQL, con verificación automática de cada copia y retención de las más
recientes.

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
**retención** (por defecto conserva las 14 copias más recientes).

Opciones:

| Comando | Efecto |
|---|---|
| `npm run backup -- --keep 30` | Conserva las 30 copias más recientes |
| `npm run backup -- --dir C:\respaldos` | Guarda en otra carpeta |
| `npm run backup:list` | Lista los respaldos e indica si cada uno es `OK` o `CORRUPTO` |

Cada respaldo se registra en `backups\backup.log` con fecha, tamaño y número de
objetos. Si la copia no supera la verificación se elimina y se registra el error.

## Programar respaldos automáticos (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File backend\scripts\programar-respaldo.ps1
```

Crea una tarea del Programador de Windows que ejecuta el respaldo **cada domingo a
las 22:00** conservando 14 copias. Parámetros: `-Keep 14 -Day Sunday -Time "22:00"
-TaskName "SistemaContable-Respaldo"`.

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

Formatos admitidos: `.dump` (pg_restore) y `.sql` (psql con `ON_ERROR_STOP=1`).

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
  copiarla a un medio externo.
- La restauración usa `--clean --if-exists --no-owner --no-privileges`, es decir,
  elimina los objetos existentes antes de recrearlos sin exigir los mismos roles de
  propietario del servidor original.
