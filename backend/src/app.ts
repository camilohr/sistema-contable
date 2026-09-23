import "express-async-errors";
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
import procesosRoutes from "./routes/procesos.routes.js";
import resumenRoutes from "./routes/resumen.routes.js";
import alertasRoutes from "./routes/alertas.routes.js";
import adjuntosRoutes from "./routes/adjuntos.routes.js";
import conciliacionRoutes from "./routes/conciliacion.routes.js";
import { notFound, errorHandler } from "./middleware/error.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.resolve(__dirname, "../../frontend/dist");
const indexFile = path.join(frontendDist, "index.html");
const sirveFrontend = fs.existsSync(indexFile);

export function createApp(): express.Express {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // El despliegue es HTTP sobre LAN (sin TLS); `upgrade-insecure-requests`
          // haría que el navegador pida los recursos por HTTPS y rompería el SPA.
          upgradeInsecureRequests: null,
        },
      },
      // En HTTP, HSTS puede ser cacheado por el navegador y romper el acceso LAN.
      hsts: false,
    })
  );
  // B5: tras un proxy/balanceador, req.ip debe salir de la cabecera X-Forwarded-For
  // (necesario para los límites por IP y la auditoría de login).
  app.set("trust proxy", 1);

  // B9: la SPA no usa geolocalización, cámara ni micrófono.
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    next();
  });

  // B3: sin CORS_ORIGIN explícito, solo se acepta la interfaz local (localhost/127.0.0.1).
  const origenesPermitidos = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) ?? [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];
  app.use(cors({ origin: origenesPermitidos, credentials: false }));
  app.use(express.json({ limit: "256kb" }));

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
  app.use("/api/procesos", procesosRoutes);
  app.use("/api/resumen", resumenRoutes);
  app.use("/api/alertas", alertasRoutes);
  app.use("/api/adjuntos", adjuntosRoutes);
  app.use("/api/conciliaciones", conciliacionRoutes);

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
