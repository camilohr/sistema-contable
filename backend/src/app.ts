import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/auth.routes.js";
import usuariosRoutes from "./routes/usuarios.routes.js";
import empresasRoutes from "./routes/empresas.routes.js";
import cuentasRoutes from "./routes/cuentas.routes.js";
import tercerosRoutes from "./routes/terceros.routes.js";
import periodosRoutes from "./routes/periodos.routes.js";
import comprobantesRoutes from "./routes/comprobantes.routes.js";
import reportesRoutes from "./routes/reportes.routes.js";
import carteraRoutes from "./routes/cartera.routes.js";
import productosRoutes from "./routes/productos.routes.js";
import activosFijosRoutes from "./routes/activos-fijos.routes.js";
import auditoriaRoutes from "./routes/auditoria.routes.js";
import cierreAnualRoutes from "./routes/cierre-anual.routes.js";
import empleadosRoutes from "./routes/empleados.routes.js";
import nominaRoutes from "./routes/nomina.routes.js";
import presupuestoRoutes from "./routes/presupuesto.routes.js";
import alertasRoutes from "./routes/alertas.routes.js";
import { notFound, errorHandler } from "./middleware/error.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.resolve(__dirname, "../../frontend/dist");
const indexFile = path.join(frontendDist, "index.html");
const sirveFrontend = fs.existsSync(indexFile);

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
  app.use("/api/empresas", empresasRoutes);
  app.use("/api/cuentas", cuentasRoutes);
  app.use("/api/terceros", tercerosRoutes);
  app.use("/api/periodos", periodosRoutes);
  app.use("/api/comprobantes", comprobantesRoutes);
  app.use("/api/reportes", reportesRoutes);
  app.use("/api", carteraRoutes);
  app.use("/api", productosRoutes);
  app.use("/api/activos-fijos", activosFijosRoutes);
  app.use("/api/auditoria", auditoriaRoutes);
  app.use("/api/cierre-anual", cierreAnualRoutes);
  app.use("/api/empleados", empleadosRoutes);
  app.use("/api/nomina", nominaRoutes);
  app.use("/api/presupuesto", presupuestoRoutes);
  app.use("/api/alertas", alertasRoutes);

  if (sirveFrontend) {
    app.use(express.static(frontendDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(indexFile);
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
