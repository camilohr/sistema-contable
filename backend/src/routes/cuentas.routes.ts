import { Router } from "express";
import { listar, crear, actualizar, eliminar } from "../controllers/cuentas.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", listar);
router.post("/", requireRole("ADMIN", "CONTADOR"), crear);
router.patch("/:id", requireRole("ADMIN", "CONTADOR"), actualizar);
router.delete("/:id", requireRole("ADMIN", "CONTADOR"), eliminar);

export default router;
