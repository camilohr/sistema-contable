import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { empresas } from "../controllers/empresas.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", empresas.listar);

export default router;
