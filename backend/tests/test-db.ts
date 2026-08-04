import "dotenv/config";

export function testDatabaseUrl(): string {
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("Falta DATABASE_URL en backend/.env para derivar la base de datos de tests.");
  }
  const url = new URL(base);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}
