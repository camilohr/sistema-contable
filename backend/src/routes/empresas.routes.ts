import { Router } from "express";
import { requireAuth, requireEmpresa, requireRole } from "../middleware/auth.js";
import { empresas } from "../controllers/empresas.controller.js";
import { paqueteInformes } from "../controllers/exportacion.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", empresas.listar);

router.post("/:empresaId/informes/paquete", requireEmpresa, requireRole("ADMIN", "CONTADOR"), (req, res, next) => {
  if (req.params.empresaId !== req.empresaId) {
    res.status(403).json({ error: "La empresa de la URL no coincide con la empresa activa" });
    return;
  }
  paqueteInformes(req, res).catch(next);
});

export default router;
