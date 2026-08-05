import { Router } from "express";
import { Request, Response } from "express";
import { requireAuth, requireEmpresa } from "../middleware/auth.js";
import { libroDiario, libroMayor, balanceComprobacion, balanceGeneral, estadoResultados } from "../controllers/reportes.controller.js";
import { indicadoresComparativo, indicadoresPorPeriodo } from "../controllers/indicadores.controller.js";
import {
  libroDiarioPdf,
  libroMayorPdf,
  libroInventariosPdf,
  balanceGeneralPdf,
  estadoResultadosPdf,
  indicadoresPdf,
} from "../controllers/libros-pdf.controller.js";
import { exportarReporte, TipoReporte, FormatoExportacion } from "../controllers/exportacion.controller.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);

router.get("/libro-diario.pdf", libroDiarioPdf);
router.get("/libro-mayor.pdf", libroMayorPdf);
router.get("/libro-inventarios.pdf", libroInventariosPdf);
router.get("/balance-general.pdf", balanceGeneralPdf);
router.get("/estado-resultados.pdf", estadoResultadosPdf);
router.get("/indicadores/:periodoId.pdf", indicadoresPdf);
router.get("/indicadores/:periodoId.csv", (req: Request, res: Response) => {
  req.query.periodoId = req.params.periodoId;
  return exportarReporte("indicadores", "csv", req, res);
});
router.get("/indicadores/:periodoId.xlsx", (req: Request, res: Response) => {
  req.query.periodoId = req.params.periodoId;
  return exportarReporte("indicadores", "xlsx", req, res);
});

type Handler = (req: Request, res: Response) => Promise<void> | void;

const jsonHandlers: Record<TipoReporte, Handler> = {
  "libro-diario": libroDiario,
  "libro-mayor": libroMayor,
  "balance-comprobacion": balanceComprobacion,
  "balance-general": balanceGeneral,
  "estado-resultados": estadoResultados,
  indicadores: indicadoresPorPeriodo,
};

const tipos: { tipo: TipoReporte; path: string }[] = [
  { tipo: "libro-diario", path: "/libro-diario" },
  { tipo: "libro-mayor", path: "/libro-mayor" },
  { tipo: "balance-comprobacion", path: "/balance-comprobacion" },
  { tipo: "balance-general", path: "/balance-general" },
  { tipo: "estado-resultados", path: "/estado-resultados" },
];

for (const { tipo, path } of tipos) {
  router.get(`${path}.:formato(csv|xlsx)`, (req: Request, res: Response) => {
    return exportarReporte(tipo, req.params.formato as FormatoExportacion, req, res);
  });
  router.get(path, (req: Request, res: Response) => {
    const f = req.query.formato;
    if (f === "csv" || f === "xlsx") return exportarReporte(tipo, f, req, res);
    return jsonHandlers[tipo](req, res);
  });
}

router.get("/indicadores/comparativo", indicadoresComparativo);
router.get("/indicadores/:periodoId", jsonHandlers.indicadores);

export default router;
