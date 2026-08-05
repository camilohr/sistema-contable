import { Router } from "express";
import { requireAuth, requireRole, requireEmpresa } from "../middleware/auth.js";
import { procesos } from "../controllers/procesos.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/cartera", procesos.cartera);

router.use(requireEmpresa);

router.get("/", procesos.listar);
router.post("/", requireRole("ADMIN", "CONTADOR"), procesos.crear);
router.get("/:id", procesos.obtener);
router.patch("/:id", requireRole("ADMIN", "CONTADOR"), procesos.actualizar);
router.delete("/:id", requireRole("ADMIN"), procesos.eliminar);
router.patch("/:id/actividades/:actividadId", requireRole("ADMIN", "CONTADOR"), procesos.marcarActividad);
router.post("/:id/notas", requireRole("ADMIN", "CONTADOR"), procesos.agregarNota);

export default router;
