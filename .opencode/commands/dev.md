---
description: Levanta los servidores de desarrollo (backend en modo watch y frontend Vite).
---

Levanta el entorno de desarrollo del proyecto:

1. Backend (workdir `backend/`): `npm run dev` (tsx watch, puerto 3000).
2. Frontend (workdir `frontend/`): `npm run dev` (Vite, puerto 5173).

Deja ambos procesos corriendo en segundo plano y confirma que backend (`http://localhost:3000/api/health`) y frontend (`http://localhost:5173`) respondan. Reporta en qué URL queda cada uno.