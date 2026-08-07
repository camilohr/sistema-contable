# Despliegue en red local

El sistema se sirve desde **un solo puerto** (3000): el backend de Express sirve la
API (`/api/*`) y el frontend compilado (React) en la misma URL. Los clientes solo
necesitan un navegador y acceso a la red local.

## Arquitectura de despliegue

```
  RED LOCAL (LAN)
 ┌──────────────────────────────────────────────┐
 │  Cliente (navegador) ─► http://IP:3000        │
 │                       │  frontend + /api      │
 │  SERVIDOR LOCAL                               │
 │   PM2 ── node dist/index.js (puerto 3000)     │
 │   └─ sirve frontend/dist (estático + SPA)     │
 │   └─ API REST Express                         │──► PostgreSQL (local)
 └──────────────────────────────────────────────┘
```

## Requisitos en el servidor

- Node.js 20+ y npm.
- PostgreSQL con la base creada y migrada (`npm run db:migrate` en `backend/`).
- Opcional: PM2 (`npm install -g pm2`) para reinicio automático y logs.

## Despliegue automático (recomendado)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\desplegar.ps1
```

El script:

1. Compila el backend (`backend\dist`) y el frontend (`frontend\dist`).
2. Abre el puerto 3000 en el Firewall de Windows (perfil Privado); requiere
   PowerShell como administrador, si no se eleva lo indica sin detener el proceso.
3. Inicia el servidor con PM2 (`ecosystem.config.cjs`) o en primer plano con `-SinPM2`.
4. Imprime las URL de acceso de la red local.

## Pasos manuales equivalentes

```bash
# 1. Compilar
cd backend && npm run build
cd ../frontend && npm run build

# 2. Firewall (PowerShell como administrador)
powershell -ExecutionPolicy Bypass -File scripts\abrir-puerto.ps1

# 3. Iniciar con PM2 desde la raíz del proyecto
pm2 start ecosystem.config.cjs
pm2 save          # para que PM2 lo reinicie al arrancar el sistema
pm2 startup       # genera el comando de inicio automático (requiere admin)
```

## Verificación

- `http://localhost:3000` → página de inicio de sesión.
- `http://localhost:3000/api/health` → `{"status":"ok"}`.
- Desde otro equipo de la red: `http://<IP-del-servidor>:3000`.

## IP fija del servidor

Para que los clientes siempre usen la misma URL:

- Configurar una **IP estática** en el adaptador de red del servidor, o
- Reservar la IP en el DHCP del router (reserva DHCP por MAC).

Comandos útiles:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" }
```

## Administración con PM2

```powershell
pm2 ls                      # estado de los procesos
pm2 logs contabilidad-backend   # ver los logs del backend
pm2 restart contabilidad-backend # reiniciar
pm2 stop contabilidad-backend    # detener
```

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Otro equipo no accede | Firewall bloquea 3000 | `scripts\abrir-puerto.ps1` como administrador |
| Error `EADDRINUSE` | Ya hay un proceso en 3000 | `pm2 kill` o cerrar el proceso previo y reintentar |
| `FATAL: password authentication failed` | Password mal en `.env` | Revisar `DATABASE_URL` en `backend\.env` |
| La página carga pero la API falla | Build desactualizado | Volver a ejecutar `scripts\desplegar.ps1` |

## Desarrollo (no producción)

En desarrollo se usa Vite con proxy: `cd frontend && npm run dev`
(Vite en el puerto 5173 y reenvía `/api` a `http://localhost:3000`, donde debe estar
corriendo `cd backend && npm run dev`).

## Validación realizada

Última verificación en vivo del despliegue en red local.

| Campo | Valor / estado |
|---|---|
| **Fecha** | 2026-08-07 |
| **Servidor** | Equipo local (este repositorio), perfil de red **Privado** |
| **IP del servidor** | `192.168.18.219` (adaptador Ethernet) |
| **URL de acceso** | `http://192.168.18.219:3000` |
| **Proceso** | PM2 `contabilidad-backend` (2.2.0) ✓ `online` |
| **Health** | `GET /api/health` → `{"status":"ok"}` ✓ |
| **Carga de la UI** | `GET /` → `200` con el contenedor de React de la SPA ✓ |
| **Firewall LAN (puerto 3000)** | Pendiente de confirmar: ejecutar `scripts\abrir-puerto.ps1` como **administrador** (perfil Privado) |
| **Acceso desde un segundo equipo** | Pendiente de probar en vivo |

Pasos que faltan para cerrar la validación (prueba real desde otro
computador de la LAN, preferiblemente con un rol distinto, p. ej. AUXILIAR, y un
navegador/equipo diferente):

1. Desde el otro equipo abrir `http://192.168.18.219:3000` y confirmar que carga el
   inicio de sesión.
2. Iniciar sesión con un usuario real y confirmar dashboard, selector de empresa y al
   menos una consulta (Resumen o Cartera).
3. Revisar con un usuario de rol AUXILIAR que los permisos también se respetan por red.
4. Confirmar la **IP fija** (reserva DHCP por MAC o IP estática) para que la URL no
   cambie; anotar aquí cuál se usó y con qué IP quedó el servidor.

Al cerrar la lista, anotar aquí qué IP fija se usó, desde qué equipos y navegadores se
probó y el resultado, para dejar el registro en el histórico del despliegue.
