import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listar, obtener, cerrarAnio } from "../controllers/cierre-anual.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listar);
router.get("/:anio", obtener);
router.post("/:anio", requireRole("ADMIN"), cerrarAnio);

export default router;
