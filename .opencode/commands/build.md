---
description: Compila backend y frontend (TypeScript + Vite) y corrige errores.
---

Compila ambos proyectos y corrige errores de tipos o build si aparecen:

1. Backend (workdir `backend/`): `npm run build` (tsc -> dist/).
2. Frontend (workdir `frontend/`): `npm run build` (tsc -b && vite build).

Si algo falla, anótalo, corrígelo y vuelve a compilar hasta que termine limpio.
Entrega un resumen breve del resultado.