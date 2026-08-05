import { Router } from "express";
import { requireAuth, requireRole, requireEmpresa } from "../middleware/auth.js";
import { listarPorPeriodo, cargar, ejecucion } from "../controllers/presupuesto.controller.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);

router.get("/:periodoId/ejecucion", ejecucion);
router.get("/:periodoId", listarPorPeriodo);
router.put("/:periodoId", requireRole("ADMIN", "CONTADOR"), cargar);

export default router;
