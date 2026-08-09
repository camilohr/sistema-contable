import { Router } from "express";
import { requireAuth, requireRole, requireEmpresa } from "../middleware/auth.js";
import { cxc, cxp } from "../controllers/cartera.controller.js";
import { provision } from "../controllers/provision-cartera.controller.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);

router.get("/cxc", cxc.listar);
router.post("/cxc", requireRole("ADMIN", "CONTADOR"), cxc.crear);
router.get("/cxc/:id", cxc.detalle);
router.patch("/cxc/:id", requireRole("ADMIN", "CONTADOR"), cxc.actualizar);
router.delete("/cxc/:id", requireRole("ADMIN", "CONTADOR"), cxc.eliminar);
router.post("/cxc/:id/recibos", requireRole("ADMIN", "CONTADOR"), cxc.abonar);

router.get("/cxp", cxp.listar);
router.post("/cxp", requireRole("ADMIN", "CONTADOR"), cxp.crear);
router.get("/cxp/:id", cxp.detalle);
router.patch("/cxp/:id", requireRole("ADMIN", "CONTADOR"), cxp.actualizar);
router.delete("/cxp/:id", requireRole("ADMIN", "CONTADOR"), cxp.eliminar);
router.post("/cxp/:id/pagos", requireRole("ADMIN", "CONTADOR"), cxp.abonar);

router.get("/cartera/provision/parametros", provision.obtenerParametros);
router.put("/cartera/provision/parametros", requireRole("ADMIN", "CONTADOR"), provision.actualizarParametros);
router.post("/cartera/provision/calcular/:periodoId", requireRole("ADMIN", "CONTADOR"), provision.calcularProvision);
router.post("/cartera/provision/calcular/:periodoId/contabilizar", requireRole("ADMIN", "CONTADOR"), provision.contabilizar);
router.get("/cartera/provision/:periodoId", provision.obtenerProvision);

export default router;
