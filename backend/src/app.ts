import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes.js";
import usuariosRoutes from "./routes/usuarios.routes.js";
import cuentasRoutes from "./routes/cuentas.routes.js";
import tercerosRoutes from "./routes/terceros.routes.js";
import { notFound, errorHandler } from "./middleware/error.js";

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/usuarios", usuariosRoutes);
  app.use("/api/cuentas", cuentasRoutes);
  app.use("/api/terceros", tercerosRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
