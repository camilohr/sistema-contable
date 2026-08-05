import { Router } from "express";
import { listar, crear } from "../controllers/usuarios.controller.js";
import { requireAuth, requireRole, requireEmpresa } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);
router.get("/", requireRole("ADMIN"), listar);
router.post("/", requireRole("ADMIN"), crear);

export default router;
