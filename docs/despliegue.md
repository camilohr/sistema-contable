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

El servidor usa actualmente **DHCP** (IP `192.168.18.219`, gateway `192.168.18.1`,
MAC `00:25:22:ae:b6:44`). Método elegido: **reserva DHCP por MAC** — registrar en el
router `192.168.18.1` la entrada `00:25:22:ae:b6:44` → IP `192.168.18.219`.

Alternativa (no elegida): configurar una **IP estática** en el adaptador del servidor.

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

## TLS en la red local (opcional — S1-09)

Por defecto el servidor escucha en **HTTP** sobre la LAN. Para proteger los datos
personales (login, terceros, adjuntos) en tránsito frente a un sniffer de la red, el
backend soporta **HTTPS** con un certificado autofirmado:

1. Generar el certificado autofirmado (OpenSSL disponible con PostgreSQL o Git):

   ```powershell
   openssl req -x509 -newkey rsa:2048 -keyout backend\certs\local-key.pem -out backend\certs\local-cert.pem -days 3650 -nodes -subj "/CN=192.168.18.219"
   ```

   Use como `CN` la IP o nombre con el que acceden los demás equipos.

2. Declarar en `backend\.env`:

   ```
   HTTPS_CERT=C:\ruta\a\local-cert.pem
   HTTPS_KEY=C:\ruta\a\local-key.pem
   ```

3. Reiniciar el backend (`pm2 restart contabilidad-backend`). El log mostrará
   `Servidor contable en https://localhost:3000`.

Los navegadores advertirán que el certificado no es de confianza (autofirmado); el
usuario debe aceptar la advertencia una vez por equipo. **La carpeta `backend\certs`
nunca se sube al repositorio**: la clave privada es sensible (ver `.gitignore`).

> Alternativa sin TLS: mantener HTTP restringiendo la red (segmento confiable, sin
> equipos desconocidos) y asumir el riesgo residual documentado en la auditoría
> (S1-09).

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Otro equipo no accede | Firewall bloquea 3000 | `scripts\abrir-puerto.ps1` como administrador |
| Error `EADDRINUSE` | Ya hay un proceso en 3000 | `pm2 kill` o cerrar el proceso previo y reintentar |
| `FATAL: password authentication failed` | Password mal en `.env` | Revisar `DATABASE_URL` en `backend\.env` |
| La página carga pero la API falla | Build desactualizado | Volver a ejecutar `scripts\desplegar.ps1` |
| La página carga en blanco (solo fondo claro) | CSP de `helmet` con `upgrade-insecure-requests` sobre HTTP | Corregido (2.2.1): `upgradeInsecureRequests: null` en `backend\src\app.ts` |

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
| **Firewall LAN (puerto 3000)** | ✓ Regla creada: entrada TCP 3000 (Private) `New-NetFirewallRule` vía `scripts\abrir-puerto.ps1` |
| **Acceso por IP (misma red)** | ✓ `http://192.168.18.219:3000` → `200` (UI) y `/api/health` → `{"status":"ok"}` |
| **Acceso desde un segundo equipo** | **Windows + Chrome** por WiFi (`192.168.18.31`): login OK, dashboard, selector de empresa y consulta ✓; rol **AUXILIAR** verificado |

### Prueba en un segundo equipo — realizada ✓

1. Windows + Chrome, equipo por WiFi (`192.168.18.31`): se abrió
   `http://192.168.18.219:3000`, login con un usuario real, dashboard, selector de
   empresa y al menos una consulta. ✓
2. Rol **AUXILIAR** desde el mismo equipo: permisos respetados por red. ✓
3. **IP fija**: método elegido — reserva DHCP por MAC (ver `## IP fija del servidor`).

### Página en blanco (anotación técnica)

Al servir la SPA por HTTP en la LAN, el middleware `helmet` incluía
`upgrade-insecure-requests` en su Content-Security-Policy y el navegador intentaba
cargar los assets (`/assets/*`) por HTTPS, dejando la página en blanco. Corregido en
`backend\src\app.ts` (`contentSecurityPolicy.directives.upgradeInsecureRequests:
null`), compilar con `npm run build` + `pm2 restart`. Ver commit `533b732` y la entrada
2.2.1 del `CHANGELOG.md`.

### Reserva DHCP — realizada ✓

- Se registró la reserva en el router `192.168.18.1`: `MAC 00:25:22:ae:b6:44` →
  IP `192.168.18.219`. Comprobado con `ipconfig /renew` en el servidor: la IP se
  mantiene en `192.168.18.219` y `http://192.168.18.219:3000/api/health` responde
  `{"status":"ok"}`. La URL de acceso a la LAN queda fija:
  `http://192.168.18.219:3000`.
