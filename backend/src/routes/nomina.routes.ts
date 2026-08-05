import { Router } from "express";
import { requireAuth, requireRole, requireEmpresa } from "../middleware/auth.js";
import { nomina } from "../controllers/nomina.controller.js";

const router = Router();

router.use(requireAuth);
router.use(requireEmpresa);

router.get("/parametros", nomina.obtenerParametros);
router.put("/parametros/:anio", requireRole("ADMIN", "CONTADOR"), nomina.actualizarParametros);
router.get("/parametros-cuentas", nomina.obtenerParametrosCuentas);
router.put("/parametros-cuentas", requireRole("ADMIN", "CONTADOR"), nomina.actualizarParametrosCuentas);

router.get("/provision/:periodoId", nomina.obtenerProvision);
router.post("/provisionar/:periodoId", requireRole("ADMIN", "CONTADOR"), nomina.provisionar);
router.post("/contabilizar/:periodoId", requireRole("ADMIN", "CONTADOR"), nomina.contabilizar);
router.post("/liquidar/:periodoId", requireRole("ADMIN", "CONTADOR"), nomina.liquidar);

router.get("/:periodoId", nomina.obtenerLiquidacion);

export default router;
