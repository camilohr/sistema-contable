import { Router } from "express";
import { requireAuth, requireEmpresa, requireRole } from "../middleware/auth.js";
import { empresas } from "../controllers/empresas.controller.js";
import { paqueteInformes, paqueteFinalBaja } from "../controllers/exportacion.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", empresas.listar);
router.get("/administracion", requireRole("ADMIN"), empresas.administracion);

router.post("/", requireRole("ADMIN"), (req, res, next) => {
  empresas.crear(req, res).catch(next);
});
router.patch("/:id", requireRole("ADMIN"), (req, res, next) => {
  empresas.actualizar(req, res).catch(next);
});
router.patch("/:id/estado", requireRole("ADMIN"), (req, res, next) => {
  empresas.cambiarEstado(req, res).catch(next);
});

router.post("/:empresaId/informes/paquete-final", requireRole("ADMIN"), (req, res, next) => {
  paqueteFinalBaja(req, res).catch(next);
});

router.post("/:empresaId/informes/paquete", requireEmpresa, requireRole("ADMIN", "CONTADOR"), (req, res, next) => {
  if (req.params.empresaId !== req.empresaId) {
    res.status(403).json({ error: "La empresa de la URL no coincide con la empresa activa" });
    return;
  }
  paqueteInformes(req, res).catch(next);
});

export default router;
