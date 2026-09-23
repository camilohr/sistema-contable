---
description: Corre los tests del backend y el lint del frontend, y corrige cualquier fallo.
---

Ejecuta la validación completa del proyecto y corrige lo que falle:

1. Backend (workdir `backend/`): `npm test` (Vitest + supertest).
2. Frontend (workdir `frontend/`): `npm run lint` (oxlint).

Entrega al final un resumen: cuántos tests pasaron (total/aprobados/fallidos) y qué corregiste.

Si el usuario indicó argumentos (`$ARGUMENTS`, ej. "backend" o "frontend"), ejecuta solo esa parte.