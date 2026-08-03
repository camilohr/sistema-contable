import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { libroDiario, libroMayor, balanceComprobacion, balanceGeneral, estadoResultados } from "../controllers/reportes.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/libro-diario", libroDiario);
router.get("/libro-mayor", libroMayor);
router.get("/balance-comprobacion", balanceComprobacion);
router.get("/balance-general", balanceGeneral);
router.get("/estado-resultados", estadoResultados);

export default router;
