import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { PUC } from "./seed/puc.js";
import { derivarPuc } from "../src/lib/puc.js";

async function importarPuc(): Promise<void> {
  const codes = new Set(PUC.map(([c]) => c));
  const esHoja = (codigo: string) =>
    ![...codes].some((c) => c.length > codigo.length && c.startsWith(codigo));

  let creadas = 0;
  for (const [codigo, nombre] of PUC) {
    const derivado = derivarPuc(codigo);
    const existente = await prisma.cuenta.findFirst({ where: { codigo, empresaId: null } });
    if (existente) {
      await prisma.cuenta.update({ where: { id: existente.id }, data: { nombre } });
    } else {
      await prisma.cuenta.create({
        data: {
          codigo,
          nombre,
          permiteMovimiento: esHoja(codigo),
          ...derivado,
        },
      });
      creadas += 1;
    }
  }
  console.log(`PUC importado: ${PUC.length} cuentas (${creadas} nuevas).`);
}

async function seedEmpresa(): Promise<string> {
  let empresa = await prisma.empresa.findFirst({ orderBy: { createdAt: "asc" } });
  if (!empresa) {
    empresa = await prisma.empresa.create({
      data: { nombre: "Mi Empresa", nit: "000000000" },
    });
    console.log("Empresa por defecto creada.");
  }
  return empresa.id;
}

async function seedUsuarioAdmin(empresaId: string): Promise<void> {
  const adminEmail = "admin@sistema.local";
  let admin = await prisma.usuario.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    const passwordHash = await bcrypt.hash("Admin123!", 10);
    admin = await prisma.usuario.create({
      data: { nombre: "Administrador", email: adminEmail, passwordHash, rol: "ADMIN", debeCambiarPassword: true },
    });
    console.log("Usuario administrador creado: admin@sistema.local / Admin123!  (deberá cambiar la contraseña en el primer ingreso)");
  } else {
    console.log("El usuario administrador ya existe.");
  }
  await prisma.usuarioEmpresa.upsert({
    where: { usuarioId_empresaId: { usuarioId: admin.id, empresaId } },
    update: { rol: "ADMIN", activo: true },
    create: { usuarioId: admin.id, empresaId, rol: "ADMIN" },
  });
}

const PARAMETROS_PROVISION_DEFECTO = [
  { diasDesde: 1, diasHasta: 30, porcentaje: 1 },
  { diasDesde: 31, diasHasta: 60, porcentaje: 5 },
  { diasDesde: 61, diasHasta: 90, porcentaje: 10 },
  { diasDesde: 91, diasHasta: null, porcentaje: 20 },
];

async function seedParametroProvision(): Promise<void> {
  const existentes = await prisma.parametroProvision.count();
  if (existentes > 0) return;
  await prisma.parametroProvision.createMany({
    data: PARAMETROS_PROVISION_DEFECTO.map((p) => ({
      empresaId: null,
      diasDesde: p.diasDesde,
      diasHasta: p.diasHasta,
      porcentaje: new Prisma.Decimal(p.porcentaje),
    })),
  });
  console.log("Parámetros de provisión de cartera por defecto creados.");
}

const PARAMETROS_NOMINA_DEFECTO_2026 = {
  anio: 2026,
  smmlv: 1750905,
  auxilioTransporte: 249095,
  topeAuxilioTransporteSalarios: 2,
  topeIbcSalarios: 25,
  saludEmpleado: 4,
  pensionEmpleado: 4,
  saludEmpleador: 8.5,
  pensionEmpleador: 12,
  arlEmpleador: 0.522,
  cajaCompensacion: 4,
  icbf: 3,
  sena: 2,
  umbralParafiscales: 10,
  solidaridadUmbralSalarios: 4,
  interesesCesantias: 12,
};

async function seedParametroNomina(): Promise<void> {
  const anio = PARAMETROS_NOMINA_DEFECTO_2026.anio;
  const existente = await prisma.parametroNomina.findFirst({ where: { empresaId: null, anio } });
  if (existente) return;
  await prisma.parametroNomina.create({
    data: {
      empresaId: null,
      anio,
      ...(Object.fromEntries(
        Object.entries(PARAMETROS_NOMINA_DEFECTO_2026)
          .filter(([k]) => k !== "anio")
          .map(([k, v]) => [k, new Prisma.Decimal(v)])
      ) as Prisma.ParametroNominaCreateInput),
    },
  });
  console.log("Parámetros de nómina 2026 por defecto creados.");
}

const CUENTAS_NOMINA_DEFECTO: Array<[concepto: string, codigoCuenta: string]> = [
  ["SUELDO", "510505"],
  ["HORAS_EXTRAS", "510510"],
  ["COMISIONES", "510515"],
  ["BONIFICACIONES", "510575"],
  ["AUXILIO_TRANSPORTE", "510595"],
  ["OTROS_DEVENGADOS", "510590"],
  ["SALUD_GASTO", "510555"],
  ["SALUD_PASIVO", "237005"],
  ["PENSION_GASTO", "510565"],
  ["PENSION_PASIVO", "237055"],
  ["ARL_GASTO", "510560"],
  ["ARL_PASIVO", "237010"],
  ["CAJA_GASTO", "510540"],
  ["CAJA_PASIVO", "237025"],
  ["ICBF_GASTO", "510545"],
  ["ICBF_PASIVO", "237015"],
  ["SENA_GASTO", "510550"],
  ["SENA_PASIVO", "237020"],
  ["SOLIDARIDAD", "237030"],
  ["RETEFUENTE", "236580"],
  ["LIBRANZAS", "237035"],
  ["EMBARGOS", "237040"],
  ["OTROS_DESCUENTOS", "238055"],
  ["NETO_POR_PAGAR", "238035"],
  ["CESANTIAS_GASTO", "510535"],
  ["CESANTIAS_PASIVO", "251005"],
  ["INTERESES_CESANTIAS_GASTO", "510535"],
  ["INTERESES_CESANTIAS_PASIVO", "251010"],
  ["PRIMA_GASTO", "510535"],
  ["PRIMA_PASIVO", "252005"],
  ["VACACIONES_GASTO", "510535"],
  ["VACACIONES_PASIVO", "252505"],
];

async function seedParametroCuentaNomina(empresaId: string): Promise<void> {
  const codigos = CUENTAS_NOMINA_DEFECTO.map(([, c]) => c);
  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: codigos } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  let creados = 0;
  for (const [concepto, codigoCuenta] of CUENTAS_NOMINA_DEFECTO) {
    const cuentaId = porCodigo.get(codigoCuenta);
    if (!cuentaId) {
      console.warn(`Nómina: no existe la cuenta ${codigoCuenta} para el concepto ${concepto}; se omite.`);
      continue;
    }
    const resultado = await prisma.parametroCuentaNomina.upsert({
      where: { empresaId_concepto: { empresaId, concepto } },
      update: {},
      create: { empresaId, concepto, cuentaId },
    });
    if (resultado.createdAt.getTime() === resultado.updatedAt.getTime()) creados += 1;
  }
  console.log(`Mapeo de cuentas de nómina: ${CUENTAS_NOMINA_DEFECTO.length} conceptos (${creados} nuevos).`);
}

const REGLAS_ALERTA_DEFECTO: Array<{ tipo: Prisma.TipoAlerta; dias: number | null }> = [
  { tipo: "CARTERA_VENCE", dias: 15 },
  { tipo: "PERIODO_SIN_CERRAR", dias: null },
  { tipo: "ACTIVO_SIN_BAJA", dias: null },
  { tipo: "TERCERO_SIN_MOVIMIENTO", dias: 90 },
];

async function seedReglasAlerta(): Promise<void> {
  let creadas = 0;
  for (const r of REGLAS_ALERTA_DEFECTO) {
    const resultado = await prisma.reglaAlerta.upsert({
      where: { tipo: r.tipo },
      update: {},
      create: { tipo: r.tipo, dias: r.dias },
    });
    if (resultado.createdAt.getTime() === resultado.updatedAt.getTime()) creadas += 1;
  }
  console.log(`Reglas de alertas por defecto: ${REGLAS_ALERTA_DEFECTO.length} (${creadas} nuevas).`);
}

async function main(): Promise<void> {
  const empresaId = await seedEmpresa();
  await seedUsuarioAdmin(empresaId);
  await seedParametroProvision();
  await importarPuc();
  await seedParametroNomina();
  await seedParametroCuentaNomina(empresaId);
  await seedReglasAlerta();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
