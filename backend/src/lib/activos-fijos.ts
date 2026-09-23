import { z } from "zod";
import { Prisma, EstadoPeriodo, EstadoActivoFijo, EstadoComprobante, AccionAuditoria } from "@prisma/client";
import { prisma } from "./prisma.js";
import { registrarAuditoria } from "./auditoria.js";
import { crearComprobanteDiario, AsientoGenerado } from "./comprobantes.js";
import { num } from "./decimal.js";

export interface RespuestaHttp {
  status: number;
  body: object;
}

export async function depreciarOrquestado(args: {
  empresaId: string;
  usuarioId: string;
  periodoId: number;
}): Promise<RespuestaHttp> {
  const { empresaId, usuarioId, periodoId } = args;
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId } });
  if (!periodo) {
    return { status: 404, body: { error: `No existe el periodo ${periodoId}` } };
  }
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    return { status: 400, body: { error: "El periodo está cerrado" } };
  }
  const yaGenerado = await prisma.depreciacion.findMany({
    where: { periodoId },
    include: { comprobante: { select: { estado: true } } },
  });
  const vigente = yaGenerado.find((d) => d.comprobante && d.comprobante.estado === EstadoComprobante.CONTABILIZADO);
  if (vigente) {
    return { status: 400, body: { error: "La depreciación para este periodo ya fue contabilizada; anule el comprobante para recalcular" } };
  }
  if (yaGenerado.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const d of yaGenerado) {
        const activo = await tx.activoFijo.findUnique({ where: { id: d.activoId } });
        if (!activo) continue;
        const baseDepreciable = num(activo.valor) - num(activo.valorResidual);
        const acumulada = num(activo.depreciacionAcumulada) - num(d.valor);
        await tx.activoFijo.update({
          where: { id: activo.id },
          data: {
            depreciacionAcumulada: new Prisma.Decimal(acumulada),
            estado: acumulada < baseDepreciable ? EstadoActivoFijo.ACTIVO : activo.estado,
          },
        });
      }
      const comprobanteId = yaGenerado[0].comprobanteId;
      await tx.depreciacion.deleteMany({ where: { periodoId } });
      if (comprobanteId) {
        await tx.comprobante.delete({ where: { id: comprobanteId } });
      }
    });
  }

  const activos = await prisma.activoFijo.findMany({ where: { estado: EstadoActivoFijo.ACTIVO, empresaId } });

  interface PorDepreciar {
    activo: typeof activos[number];
    baseDepreciable: number;
    valorMes: number;
  }
  const porDepreciar: PorDepreciar[] = [];
  for (const activo of activos) {
    const baseDepreciable = num(activo.valor) - num(activo.valorResidual);
    if (baseDepreciable <= 0) continue;
    const cuota = Math.round((baseDepreciable / activo.vidaUtilMeses) * 100) / 100;
    const acumulada = num(activo.depreciacionAcumulada);
    const restante = baseDepreciable - acumulada;
    if (restante <= 0) continue;
    const valorMes = Math.min(cuota, Math.round(restante * 100) / 100);
    if (valorMes <= 0) continue;
    porDepreciar.push({ activo, baseDepreciable, valorMes });
  }

  if (porDepreciar.length === 0) {
    return { status: 400, body: { error: "No hay activos vigentes por depreciar en este periodo" } };
  }

  const asientos: AsientoGenerado[] = porDepreciar.flatMap((p) => [
    { cuentaId: p.activo.cuentaGastoId, debito: p.valorMes, credito: 0, detalle: `Depreciación ${p.activo.nombre}` },
    { cuentaId: p.activo.cuentaDepreciacionId, debito: 0, credito: p.valorMes, detalle: `Depreciación ${p.activo.nombre}` },
  ]);

  const resultado = await prisma.$transaction(async (tx) => {
    const comprobante = await crearComprobanteDiario(tx, {
      empresaId,
      periodoId,
      fecha: periodo.fechaFin,
      concepto: `Depreciación periodo ${periodo.nombre}`,
      usuarioId,
      asientos,
      // S1-15: queda en BORRADOR hasta que un segundo revisor lo contabilice.
      estado: EstadoComprobante.BORRADOR,
    });
    await tx.depreciacion.createMany({
      data: porDepreciar.map((p) => ({
        activoId: p.activo.id,
        periodoId,
        comprobanteId: comprobante.id,
        valor: new Prisma.Decimal(p.valorMes),
      })),
    });
    for (const p of porDepreciar) {
      const nueva = num(p.activo.depreciacionAcumulada) + p.valorMes;
      await tx.activoFijo.update({
        where: { id: p.activo.id },
        data: {
          depreciacionAcumulada: new Prisma.Decimal(nueva),
          estado: nueva >= p.baseDepreciable ? EstadoActivoFijo.DEPRECIADO_TOTAL : EstadoActivoFijo.ACTIVO,
        },
      });
    }
    await registrarAuditoria(tx, {
      usuarioId,
      empresaId,
      accion: AccionAuditoria.DEPRECIAR_ACTIVOS,
      entidad: "Periodo",
      entidadId: periodoId,
      detalle: { periodo: periodo.nombre, procesados: porDepreciar.length, comprobanteId: comprobante.id },
    });
    return comprobante;
  });

  return {
    status: 201,
    body: {
      comprobante: {
        id: resultado.id,
        tipo: resultado.tipo,
        consecutivo: resultado.consecutivo,
        concepto: resultado.concepto,
        estado: resultado.estado,
        totalDebito: num(resultado.totalDebito),
        totalCredito: num(resultado.totalCredito),
        numAsientos: resultado.asientos.length,
      },
      procesados: porDepreciar.length,
    },
  };
}

const bajaSchema = z.object({
  periodoId: z.number().int().positive(),
  fecha: z.string().min(1),
  concepto: z.string().min(1),
});

export async function bajaOrquestado(args: {
  empresaId: string;
  usuarioId: string;
  id: number;
  body: unknown;
}): Promise<RespuestaHttp> {
  const { empresaId, usuarioId, id, body } = args;
  const activo = await prisma.activoFijo.findFirst({ where: { id, empresaId } });
  if (!activo) {
    return { status: 404, body: { error: "Activo no encontrado" } };
  }
  if (activo.estado === EstadoActivoFijo.DADO_DE_BAJA) {
    return { status: 400, body: { error: "El activo ya fue dado de baja" } };
  }

  const parsed = bajaSchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, body: { error: "Datos inválidos", detalle: parsed.error.flatten() } };
  }
  const data = parsed.data;
  const fecha = new Date(data.fecha);
  if (isNaN(fecha.getTime())) {
    return { status: 400, body: { error: "Fecha inválida" } };
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: data.periodoId, empresaId } });
  if (!periodo) {
    return { status: 404, body: { error: `No existe el periodo ${data.periodoId}` } };
  }
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    return { status: 400, body: { error: "El periodo está cerrado" } };
  }
  if (fecha < periodo.fechaInicio || fecha > periodo.fechaFin) {
    return { status: 400, body: { error: "La fecha debe estar dentro del periodo" } };
  }

  const valor = num(activo.valor);
  const acumulada = num(activo.depreciacionAcumulada);
  const valorLibros = Math.round((valor - acumulada) * 100) / 100;

  const asientos: AsientoGenerado[] = [];
  if (acumulada > 0) {
    asientos.push({ cuentaId: activo.cuentaDepreciacionId, debito: acumulada, credito: 0, detalle: `Baja ${activo.nombre}` });
  }
  if (valorLibros > 0) {
    asientos.push({ cuentaId: activo.cuentaGastoId, debito: valorLibros, credito: 0, detalle: `Baja ${activo.nombre} (valor en libros)` });
  }
  asientos.push({ cuentaId: activo.cuentaId, debito: 0, credito: valor, detalle: `Baja ${activo.nombre}` });

  const comprobante = await prisma.$transaction(async (tx) => {
    const creado = await crearComprobanteDiario(tx, {
      empresaId,
      periodoId: data.periodoId,
      fecha,
      concepto: data.concepto,
      usuarioId,
      asientos,
    });
    await tx.activoFijo.update({
      where: { id },
      data: { estado: EstadoActivoFijo.DADO_DE_BAJA },
    });
    await registrarAuditoria(tx, {
      usuarioId,
      empresaId,
      accion: AccionAuditoria.BAJA_ACTIVO,
      entidad: "ActivoFijo",
      entidadId: id,
      detalle: { nombre: activo.nombre, valor, depreciacionAcumulada: acumulada, valorLibros },
    });
    return creado;
  });

  return {
    status: 201,
    body: {
      comprobante: {
        id: comprobante.id,
        tipo: comprobante.tipo,
        consecutivo: comprobante.consecutivo,
        concepto: comprobante.concepto,
        totalDebito: num(comprobante.totalDebito),
        totalCredito: num(comprobante.totalCredito),
        numAsientos: comprobante.asientos.length,
      },
      activo: {
        id,
        estado: EstadoActivoFijo.DADO_DE_BAJA,
        valor: valor,
        depreciacionAcumulada: acumulada,
        valorLibros,
      },
    },
  };
}