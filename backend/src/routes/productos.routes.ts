import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
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
router.post("/productos", crearProducto);
router.patch("/productos/:id", actualizarProducto);
router.delete("/productos/:id", eliminarProducto);

router.get("/productos/:id/movimientos", listarMovimientos);
router.post("/productos/:id/movimientos", crearMovimiento);

export default router;
