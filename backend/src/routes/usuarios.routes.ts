import { Router } from "express";
import { listar, crear, disponibles, vincular, cambiarRol, retirar } from "../controllers/usuarios.controller.js";
import { requireAuth, requireRole, requireEmpresa } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);
router.get("/", requireRole("ADMIN"), listar);
router.get("/disponibles", requireRole("ADMIN"), disponibles);
router.post("/", requireRole("ADMIN"), crear);
router.post("/:id/vincular", requireRole("ADMIN"), vincular);
router.patch("/:id/rol", requireRole("ADMIN"), cambiarRol);
router.delete("/:id", requireRole("ADMIN"), retirar);

export default router;
