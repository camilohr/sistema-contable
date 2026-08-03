import { Router } from "express";
import { login, me, cambiarPassword } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/login", login);
router.get("/me", requireAuth, me);
router.post("/cambiar-password", requireAuth, cambiarPassword);

export default router;
