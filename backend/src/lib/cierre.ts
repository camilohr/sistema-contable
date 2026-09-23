import { z } from "zod";
import { EstadoComprobante, EstadoPeriodo, EstadoProceso, TipoActividadProceso, AccionAuditoria } from "@prisma/client";
import { prisma } from "./prisma.js";
import { registrarAuditoria } from "./auditoria.js";
import { crearComprobanteDiario, AsientoGenerado } from "./comprobantes.js";
import { marcarActividadProceso } from "./procesos.js";
import { redondear2 } from "./decimal.js";

export interface RespuestaHttp {
  status: number;
  body: object;
}

const cerrarSchema = z.object({
  cuentaUtilidadId: z.number().int().positive().optional(),
});

const CLASES_RESULTADO = [4, 5, 6, 7];

export async function cerrarAnioOrquestado(args: {
  empresaId?: string;
  usuarioId: string;
  anio: number;
  body: unknown;
}): Promise<RespuestaHttp> {
  const { empresaId, usuarioId, anio, body } = args;
  if (!empresaId) {
    return { status: 403, body: { error: "Empresa no seleccionada" } };
  }
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return { status: 400, body: { error: "Año inválido" } };
  }

  const parsed = cerrarSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return { status: 400, body: { error: "Datos inválidos", detalle: parsed.error.flatten() } };
  }

  const yaCerrado = await prisma.cierreAnual.findFirst({ where: { anio, empresaId } });
  if (yaCerrado) {
    return { status: 400, body: { error: `El año ${anio} ya fue cerrado` } };
  }

  const inicio = new Date(`${anio}-01-01`);
  const fin = new Date(`${anio}-12-31`);
  const periodos = await prisma.periodo.findMany({
    where: { empresaId, fechaInicio: { lte: fin }, fechaFin: { gte: inicio } },
    orderBy: { fechaFin: "asc" },
  });
  if (periodos.length === 0) {
    return { status: 400, body: { error: `No hay periodos para el año ${anio}` } };
  }
  const abiertos = periodos.filter((p) => p.estado !== EstadoPeriodo.CERRADO);
  if (abiertos.length > 0) {
    return { status: 400, body: { error: `No se puede cerrar el año: hay periodos abiertos (${abiertos.map((p) => p.nombre).join(", ")})` } };
  }

  let cuentaUtilidadId = parsed.data.cuentaUtilidadId;
  if (cuentaUtilidadId) {
    const cuenta = await prisma.cuenta.findFirst({
      where: { id: cuentaUtilidadId, OR: [{ empresaId: null }, { empresaId }] },
    });
    if (!cuenta || cuenta.clase !== 3 || !cuenta.activa || !cuenta.permiteMovimiento) {
      return { status: 400, body: { error: "La cuenta de utilidades debe ser una cuenta de patrimonio (clase 3), activa y con movimiento" } };
    }
  } else {
    const porDefecto = await prisma.cuenta.findFirst({
      where: { codigo: "3605", OR: [{ empresaId: null }, { empresaId }] },
    });
    if (!porDefecto || porDefecto.clase !== 3 || !porDefecto.activa || !porDefecto.permiteMovimiento) {
      return { status: 400, body: { error: "La cuenta 3605 no es válida (debe ser patrimonio clase 3, activa y con movimiento); indique una cuenta de utilidades" } };
    }
    cuentaUtilidadId = porDefecto.id;
  }

  const comprobantes = await prisma.comprobante.findMany({
    where: { empresaId, estado: { in: [EstadoComprobante.CONTABILIZADO, EstadoComprobante.ANULADO] }, periodoId: { in: periodos.map((p) => p.id) } },
    select: {
      asientos: {
        include: { cuenta: { select: { id: true, codigo: true, nombre: true, clase: true, naturaleza: true } } },
      },
    },
  });

  interface Acumulado {
    id: number;
    codigo: string;
    nombre: string;
    clase: number;
    debitos: number;
    creditos: number;
  }
  const porCuenta = new Map<number, Acumulado>();
  for (const c of comprobantes) {
    for (const a of c.asientos) {
      const act = porCuenta.get(a.cuenta.id) ?? {
        id: a.cuenta.id,
        codigo: a.cuenta.codigo,
        nombre: a.cuenta.nombre,
        clase: a.cuenta.clase,
        debitos: 0,
        creditos: 0,
      };
      act.debitos += a.debito.toNumber();
      act.creditos += a.credito.toNumber();
      porCuenta.set(a.cuenta.id, act);
    }
  }

  const asientos: AsientoGenerado[] = [];
  for (const c of [...porCuenta.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))) {
    if (!CLASES_RESULTADO.includes(c.clase)) continue;
    const saldo = c.clase === 4 ? c.creditos - c.debitos : c.debitos - c.creditos;
    const monto = redondear2(saldo);
    if (monto === 0) continue;
    if (c.clase === 4) {
      if (monto > 0) {
        asientos.push({ cuentaId: c.id, debito: monto, credito: 0, detalle: `Cierre ${anio}: ${c.codigo} ${c.nombre}` });
      } else {
        asientos.push({ cuentaId: c.id, debito: 0, credito: -monto, detalle: `Cierre ${anio}: ${c.codigo} ${c.nombre} (saldo inverso)` });
      }
    } else {
      if (monto > 0) {
        asientos.push({ cuentaId: c.id, debito: 0, credito: monto, detalle: `Cierre ${anio}: ${c.codigo} ${c.nombre}` });
      } else {
        asientos.push({ cuentaId: c.id, debito: -monto, credito: 0, detalle: `Cierre ${anio}: ${c.codigo} ${c.nombre} (saldo inverso)` });
      }
    }
  }

  if (asientos.length === 0) {
    return { status: 400, body: { error: `No hay cuentas de resultado con saldo para cerrar en el año ${anio}` } };
  }

  const totalDebitos = redondear2(asientos.reduce((s, a) => s + a.debito, 0));
  const totalCreditos = redondear2(asientos.reduce((s, a) => s + a.credito, 0));
  const debitoIngresos = totalDebitos;
  const creditoGastos = totalCreditos;
  const resultado = redondear2(debitoIngresos - creditoGastos);

  if (resultado > 0) {
    asientos.push({ cuentaId: cuentaUtilidadId, debito: 0, credito: resultado, detalle: `Utilidad del ejercicio ${anio}` });
  } else if (resultado < 0) {
    asientos.push({ cuentaId: cuentaUtilidadId, debito: -resultado, credito: 0, detalle: `Pérdida del ejercicio ${anio}` });
  }

  const ultimoPeriodo = periodos[periodos.length - 1];
  const fechaCierre = ultimoPeriodo.fechaFin;

  const cuentaUtilidad = await prisma.cuenta.findFirst({
    where: { id: cuentaUtilidadId, OR: [{ empresaId: null }, { empresaId }] },
  });

  try {
    const resultadoTransaccion = await prisma.$transaction(async (tx) => {
      const comprobante = await crearComprobanteDiario(tx, {
        empresaId,
        periodoId: ultimoPeriodo.id,
        fecha: fechaCierre,
        concepto: `Cierre de ejercicio ${anio}`,
        usuarioId,
        asientos,
        verificarPeriodoAbierto: false,
        // A3 valida cuentas por defecto; aquí ya se validó 3605 (A4) y las cuentas
        // de resultado vienen posteadas, así que se omite la re-validación.
        verificarCuentas: false,
      });
      const cierre = await tx.cierreAnual.create({
        data: {
          empresaId,
          anio,
          comprobanteId: comprobante.id,
          cuentaUtilidadId,
          usuarioId,
        },
        include: { cuentaUtilidad: { select: { codigo: true, nombre: true } } },
      });
      await registrarAuditoria(tx, {
        usuarioId,
        empresaId,
        accion: AccionAuditoria.CERRAR_ANIO,
        entidad: "Anio",
        entidadId: anio,
        detalle: {
          comprobanteId: comprobante.id,
          totalDebito: comprobante.totalDebito.toNumber(),
          totalCredito: comprobante.totalCredito.toNumber(),
          resultado,
          cuentaUtilidad: cuentaUtilidad!.codigo,
        },
      });
      await marcarActividadProceso(tx, empresaId, anio, TipoActividadProceso.CIERRE_ANIO, fechaCierre);
      await tx.procesoContable.updateMany({
        where: { empresaId, anio },
        data: { estado: EstadoProceso.CERRADO },
      });
      return { comprobante, cierre };
    });

    const { comprobante, cierre } = resultadoTransaccion;
    return {
      status: 201,
      body: {
        cierre: {
          id: cierre.id,
          anio,
          fecha: cierre.fecha.toISOString(),
          comprobanteId: comprobante.id,
          cuentaUtilidadId,
          codigoCuentaUtilidad: cierre.cuentaUtilidad.codigo,
          nombreCuentaUtilidad: cierre.cuentaUtilidad.nombre,
        },
        comprobante: {
          id: comprobante.id,
          tipo: comprobante.tipo,
          consecutivo: comprobante.consecutivo,
          fecha: comprobante.fecha.toISOString().slice(0, 10),
          concepto: comprobante.concepto,
          totalDebito: comprobante.totalDebito.toNumber(),
          totalCredito: comprobante.totalCredito.toNumber(),
          numAsientos: comprobante.asientos.length,
        },
        resumen: { debitoIngresos, creditoGastos, resultado },
        asientos: comprobante.asientos.map((a) => ({
          codigoCuenta: (a as { cuenta?: { codigo: string } }).cuenta?.codigo,
          debito: a.debito.toNumber(),
          credito: a.credito.toNumber(),
          detalle: a.detalle,
        })),
      },
    };
  } catch (err) {
    return { status: 400, body: { error: err instanceof Error ? err.message : "No se pudo cerrar el año" } };
  }
}