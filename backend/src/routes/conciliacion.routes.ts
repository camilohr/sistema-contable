import { Router } from "express";
import { requireAuth, requireEmpresa, requireRole } from "../middleware/auth.js";
import { listar, detalle, crear, importar, importarExtractoUpload, cruzar, aprobar, anular } from "../controllers/conciliacion.controller.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);

router.get("/", listar);
router.get("/:id", detalle);
router.post("/", requireRole("ADMIN", "CONTADOR"), crear);
router.post("/importar", requireRole("ADMIN", "CONTADOR"), importarExtractoUpload, importar);
router.post("/:id/cruzar", requireRole("ADMIN", "CONTADOR"), cruzar);
router.post("/:id/aprobar", requireRole("ADMIN", "CONTADOR"), aprobar);
router.post("/:id/anular", requireRole("ADMIN", "CONTADOR"), anular);

export default router;
