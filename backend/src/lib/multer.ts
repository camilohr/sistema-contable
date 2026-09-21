import multer from "multer";

const MIME_ADJUNTOS = new Set([
  // Imágenes
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  // Documentos
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  // Texto plano
  "text/plain",
  "text/csv",
  // Comprimidos
  "application/zip",
  "application/x-zip-compressed",
]);

const EXT_ADJUNTOS = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".pdf",
  ".doc", ".docx",
  ".xls", ".xlsx", ".ods",
  ".txt",
  ".zip",
];

function fileFilterPermitido(exts: string[]): multer.Options["fileFilter"] {
  return (_req, file, cb) => {
    if (MIME_ADJUNTOS.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    // Clientes pueden enviar octet-stream sin mimetype inferido; la extensión
    // real del archivo (contra la whitelist) es el segundo factor.
    if (file.mimetype === "application/octet-stream") {
      const ext = file.originalname.toLowerCase();
      if (exts.some((e) => ext.endsWith(e))) {
        cb(null, true);
        return;
      }
    }
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
  };
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: fileFilterPermitido(EXT_ADJUNTOS),
});

export const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (file.mimetype === "text/csv" || file.mimetype === "text/plain" || file.mimetype === "application/vnd.ms-excel") {
      cb(null, true);
      return;
    }
    // Navegadores pueden enviar el .csv como octet-stream; la extensión y el
    // parseo posterior (parsearExtractoCsv) son la validación real.
    if (file.mimetype === "application/octet-stream" && (ext.endsWith(".csv") || ext.endsWith(".txt"))) {
      cb(null, true);
      return;
    }
    cb(new Error(`Formato esperado: CSV. Tipo recibido: ${file.mimetype}`));
  },
});
