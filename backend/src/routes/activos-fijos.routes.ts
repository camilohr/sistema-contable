import { Router } from "express";
import { requireAuth, requireRole, requireEmpresa } from "../middleware/auth.js";
import {
  listar,
  crear,
  actualizar,
  depreciar,
  contabilizar,
  baja,
  listarDepreciaciones,
} from "../controllers/activos-fijos.controller.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);

router.get("/", listar);
router.post("/", requireRole("ADMIN", "CONTADOR"), crear);
router.patch("/:id", requireRole("ADMIN", "CONTADOR"), actualizar);
router.post("/:id/baja", requireRole("ADMIN", "CONTADOR"), baja);
router.post("/depreciar/:periodoId", requireRole("ADMIN", "CONTADOR"), depreciar);
router.post("/depreciar/:periodoId/contabilizar", requireRole("ADMIN", "CONTADOR"), contabilizar);
router.get("/:id/depreciaciones", listarDepreciaciones);

export default router;
