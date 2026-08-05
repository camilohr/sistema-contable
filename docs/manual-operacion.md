# Manual de operación

Guía técnica para administrar el sistema contable en el servidor local. Complementa
[Despliegue en red local](despliegue.md), [Respaldo y restauración](respaldo.md) y
[Arquitectura](arquitectura.md).

## 1. Componentes

| Componente | Ubicación | Detalle |
|---|---|---|
| Backend (API + frontend) | `backend/` | Node + Express; sirve la UI y la API en el puerto 3000 |
| Frontend (build) | `frontend/dist/` | Generado con `npm run build`; lo sirve el backend |
| Base de datos | PostgreSQL 18, BD `contabilidad` | Conexión en `backend/.env` (`DATABASE_URL`) |
| Proceso | PM2 `contabilidad-backend` | Auto-reinicio y logs (ver `ecosystem.config.cjs`) |
| Respaldos | `backups/` | Copias `.dump` + `.adjuntos.zip` + `backup.log` |
| Adjuntos | `backend/adjuntos/` (o `ADJUNTOS_DIR`) | Archivos soporte de comprobantes y empresas |

## 2. Arranque y detención

```powershell
# Estado
pm2 ls
pm2 logs contabilidad-backend

# Reiniciar / detener / iniciar
pm2 restart contabilidad-backend
pm2 stop contabilidad-backend
pm2 start ecosystem.config.cjs
pm2 save
```

Si no se usa PM2: `cd backend && npm run start` (o `node dist/index.js`).

## 3. Despliegue de una nueva versión

```powershell
powershell -ExecutionPolicy Bypass -File scripts\desplegar.ps1
```

El script compila backend y frontend, abre el puerto 3000 y reinicia el proceso.
El despliegue es **de un solo puerto**: los clientes usan siempre la misma URL.

## 4. Respaldos

Ver [Respaldo y restauración](respaldo.md). Rutina mínima:

```bash
cd backend
npm run backup                 # copia + verificación + retención (14)
npm run backup:list            # comprobar que las copias están OK
```

El respaldo genera además `contabilidad_YYYYMMDD_HHMMSS.adjuntos.zip` con la carpeta
de adjuntos completa; la restauración lo extrae automáticamente. Ver
[respaldo.md](respaldo.md).

Programación automática (semanal):

```powershell
powershell -ExecutionPolicy Bypass -File backend\scripts\programar-respaldo.ps1
```

**Restauración** (solo con la app detenida): ver pasos en [respaldo.md](respaldo.md).

## 5. Seguridad

- `backend/.env` contiene `DATABASE_URL` y `JWT_SECRET`. **No se comparte ni se sube** (está en `.gitignore`).
- Cambie la contraseña del usuario `admin@sistema.local` (seed inicial) y la de PostgreSQL.
- Los respaldos contienen información sensible: la carpeta `backups/` debe tener permisos restringidos y copiarse a un medio externo.
- El firewall solo debe permitir el puerto 3000 en el perfil **Privado** (red de confianza).
- Mantenga copias externas (otra PC, disco, nube cifrada) de la carpeta `backups/`.

## 6. Diagnóstico de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `EADDRINUSE` al iniciar | Puerto 3000 ocupado | `pm2 kill` o cierre el proceso previo |
| Los clientes no acceden | Firewall | `scripts\abrir-puerto.ps1` como administrador |
| `password authentication failed` | Password mal en `.env` | Corregir `DATABASE_URL` en `backend\.env` y reiniciar |
| La app inicia pero la API falla | Build desactualizado | `scripts\desplegar.ps1` |
| `pg_dump` no encontrado | PostgreSQL no está en el PATH | Definir `PGDUMP_PATH` (ver respaldo.md) |
| Adjuntos no aparecen al restaurar | Falta el `.adjuntos.zip` junto al `.dump` | Revisar que el respaldo haya generado el ZIP (ver `backup:list`) |
| BD llena / espacio | Datos y respaldos | Revisar `backups/` y mantener la retención |

Registros útiles:

```powershell
pm2 logs contabilidad-backend        # logs de la aplicación
Get-Content "backups\backup.log"     # historial de respaldos
Get-NetIPAddress -AddressFamily IPv4 # IPs del servidor
```

## 7. Tareas periódicas recomendadas

| Frecuencia | Tarea |
|---|---|
| Diaria/semanal | `npm run backup` (o tarea programada) |
| Mensual | Revisar `npm run backup:list` y probar una restauración en BD de prueba |
| Al cierre de periodo | Cerrar el periodo en la UI, generar reportes finales y respaldar |
| Anual | Validar almacenamiento externo de respaldos |
