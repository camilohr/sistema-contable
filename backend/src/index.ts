import { createApp } from "./app.js";
import { garantizarCarpetaAdjuntos } from "./lib/adjuntos.js";
import { createServer } from "node:https";
import { readFile } from "node:fs/promises";

// A1: ninguna promesa rechazada (p. ej. en streams de exportación) debe tumbar el proceso.
process.on("unhandledRejection", (reason) => {
  console.error("UnhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("UncaughtException:", err);
});

const port = Number(process.env.PORT ?? 3000);
const httpsCert = process.env.HTTPS_CERT;
const httpsKey = process.env.HTTPS_KEY;

await garantizarCarpetaAdjuntos();

// S1-09/B7: TLS para proteger los datos personales en tránsito por la LAN.
// Configuración: HTTPS_CERT y HTTPS_KEY apuntan a un certificado y su clave (p. ej.
// autofirmado con OpenSSL). Si solo se definen ambos, el servidor escucha por HTTPS;
// de lo contrario, HTTP (comportamiento por defecto — se documenta el riesgo claramente).
if (httpsCert && httpsKey) {
  const [cert, key] = await Promise.all([readFile(httpsCert, "utf8"), readFile(httpsKey, "utf8")]);
  createServer({ cert, key }, createApp()).listen(port, "0.0.0.0", () => {
    console.log(`Servidor contable en https://localhost:${port}`);
  });
} else {
  createApp().listen(port, "0.0.0.0", () => {
    console.log(`Servidor contable en http://localhost:${port}`);
    console.warn(
      "B7: SIN TLS. En redes LAN no confiables, los datos personales transitan en claro. " +
        "Defina HTTPS_CERT y HTTPS_KEY (certificado autofirmado con openssl) para producción."
    );
  });
}
