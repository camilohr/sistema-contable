import { Router } from "express";
import { listar, crear, actualizar, eliminar, anonimizar } from "../controllers/terceros.controller.js";
import { requireAuth, requireRole, requireEmpresa } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);
router.get("/", listar);
router.post("/", requireRole("ADMIN", "CONTADOR"), crear);
router.patch("/:id", requireRole("ADMIN", "CONTADOR"), actualizar);
router.delete("/:id", requireRole("ADMIN", "CONTADOR"), eliminar);
router.post("/:id/anonimizar", requireRole("ADMIN"), anonimizar);

export default router;
