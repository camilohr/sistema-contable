import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { libroDiario, libroMayor, balanceComprobacion, balanceGeneral, estadoResultados } from "../controllers/reportes.controller.js";
import { indicadoresComparativo, indicadoresPorPeriodo } from "../controllers/indicadores.controller.js";
import { libroDiarioPdf, libroMayorPdf, libroInventariosPdf } from "../controllers/libros-pdf.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/libro-diario", libroDiario);
router.get("/libro-mayor", libroMayor);
router.get("/libro-diario.pdf", libroDiarioPdf);
router.get("/libro-mayor.pdf", libroMayorPdf);
router.get("/libro-inventarios.pdf", libroInventariosPdf);
router.get("/balance-comprobacion", balanceComprobacion);
router.get("/balance-general", balanceGeneral);
router.get("/estado-resultados", estadoResultados);
router.get("/indicadores/comparativo", indicadoresComparativo);
router.get("/indicadores/:periodoId", indicadoresPorPeriodo);

export default router;
