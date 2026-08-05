import { Router } from "express";
import { listar } from "../controllers/auditoria.controller.js";
import { requireAuth, requireRole, requireEmpresa } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);
router.get("/", requireRole("ADMIN"), listar);

export default router;
