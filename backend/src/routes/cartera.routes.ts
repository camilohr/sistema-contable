import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { cxc, cxp } from "../controllers/cartera.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/cxc", cxc.listar);
router.post("/cxc", cxc.crear);
router.get("/cxc/:id", cxc.detalle);
router.patch("/cxc/:id", cxc.actualizar);
router.delete("/cxc/:id", cxc.eliminar);
router.post("/cxc/:id/recibos", cxc.abonar);

router.get("/cxp", cxp.listar);
router.post("/cxp", cxp.crear);
router.get("/cxp/:id", cxp.detalle);
router.patch("/cxp/:id", cxp.actualizar);
router.delete("/cxp/:id", cxp.eliminar);
router.post("/cxp/:id/pagos", cxp.abonar);

export default router;
