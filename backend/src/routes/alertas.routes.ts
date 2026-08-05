import { Router } from "express";
import { requireAuth, requireRole, requireEmpresa } from "../middleware/auth.js";
import { listar, listarReglas, actualizarReglas } from "../controllers/alertas.controller.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);

router.get("/", listar);
router.get("/reglas", listarReglas);
router.put("/reglas", requireRole("ADMIN", "CONTADOR"), actualizarReglas);

export default router;
