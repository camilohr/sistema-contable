import { createApp } from "./app.js";
import { garantizarCarpetaAdjuntos } from "./lib/adjuntos.js";

const port = Number(process.env.PORT ?? 3000);

await garantizarCarpetaAdjuntos();

createApp().listen(port, "0.0.0.0", () => {
  console.log(`Servidor contable en http://localhost:${port}`);
});
