import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listarProductos,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  listarMovimientos,
  crearMovimiento,
} from "../controllers/productos.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/productos", listarProductos);
router.post("/productos", requireRole("ADMIN", "CONTADOR"), crearProducto);
router.patch("/productos/:id", requireRole("ADMIN", "CONTADOR"), actualizarProducto);
router.delete("/productos/:id", requireRole("ADMIN", "CONTADOR"), eliminarProducto);

router.get("/productos/:id/movimientos", listarMovimientos);
router.post("/productos/:id/movimientos", requireRole("ADMIN", "CONTADOR"), crearMovimiento);

export default router;
