---
description: Despliega el sistema contable con PM2 en el puerto 3000 (build + restart + verificación).
---

Despliega el sistema contable en producción local:

1. Backend (workdir `backend/`): `npm run build`.
2. Frontend (workdir `frontend/`): `npm run build`.
3. Desde la raíz del repo: si `contabilidad-backend` no está en PM2, `pm2 start ecosystem.config.cjs`; si ya está, `pm2 restart contabilidad-backend`. Luego `pm2 save`.
4. Verifica que `http://localhost:3000/api/health` responda 200.

Si algo falla en el build, corrígelo antes de desplegar. Al terminar reporta el estado de PM2.