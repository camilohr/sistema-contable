import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { empleados } from "../controllers/empleados.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", empleados.listar);
router.post("/", requireRole("ADMIN", "CONTADOR"), empleados.crear);
router.patch("/:id", requireRole("ADMIN", "CONTADOR"), empleados.actualizar);
router.post("/:id/retiro", requireRole("ADMIN", "CONTADOR"), empleados.retirar);
router.get("/:id/liquidaciones", empleados.listarLiquidaciones);

export default router;
