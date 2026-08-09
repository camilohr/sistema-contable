import { Router } from "express";
import { requireAuth, requireEmpresa, requireRole } from "../middleware/auth.js";
import { subir, subirAdjunto, listar, descargar, eliminar } from "../controllers/adjuntos.controller.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);

router.post("/", requireRole("ADMIN", "CONTADOR"), subirAdjunto, subir);
router.get("/", listar);
router.get("/:id/descargar", descargar);
router.delete("/:id", requireRole("ADMIN", "CONTADOR"), eliminar);

export default router;
