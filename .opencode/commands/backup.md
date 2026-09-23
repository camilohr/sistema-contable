---
description: Genera un respaldo de la base de datos del sistema contable y lista los respaldos existentes.
---

Genera un respaldo de la base de datos del sistema contable:

1. Backend (workdir `backend/`): `npm run backup`.
2. Luego confirma el resultado con `npm run backup:list` y muestra los respaldos disponibles.

Nunca edites ni imprimas `backend/.env` (contiene credenciales). Si el respaldo falla, diagnostica por qué (conexión a PostgreSQL, directorio `backups/`) y repórtalo.