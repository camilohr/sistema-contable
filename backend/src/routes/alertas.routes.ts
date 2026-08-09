import { Router } from "express";
import { requireAuth, requireRole, requireEmpresa } from "../middleware/auth.js";
import { listar, listarReglas, actualizarReglas } from "../controllers/alertas.controller.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);

router.get("/", listar);
router.get("/reglas", listarReglas);
// Las reglas de alerta son globales (afectan a todas las empresas); solo ADMIN
// puede modificarlas — un CONTADOR de una empresa no debe cambiar reglas que
// impactan a los demás clientes del contador (ver S3-09 en docs/auditoria-2026-08.md).
router.put("/reglas", requireRole("ADMIN"), actualizarReglas);

export default router;
