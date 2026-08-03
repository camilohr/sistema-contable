import { Router } from "express";
import { listar, detalle, crear, actualizar, contabilizar, anular, eliminar } from "../controllers/comprobantes.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", listar);
router.get("/:id", detalle);
router.post("/", requireRole("ADMIN", "CONTADOR"), crear);
router.patch("/:id", requireRole("ADMIN", "CONTADOR"), actualizar);
router.post("/:id/contabilizar", requireRole("ADMIN", "CONTADOR"), contabilizar);
router.post("/:id/anular", requireRole("ADMIN", "CONTADOR"), anular);
router.delete("/:id", requireRole("ADMIN", "CONTADOR"), eliminar);

export default router;
