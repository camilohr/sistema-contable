import { Router } from "express";
import { requireAuth, requireEmpresa } from "../middleware/auth.js";
import { resumen } from "../controllers/resumen.controller.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);

router.get("/", resumen);

export default router;
