import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, EstadoComprobante, TipoComprobante, EstadoPeriodo, EstadoNomina, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";

const asientoSchema = z.object({
  cuentaId: z.number().int().positive(),
  terceroId: z.string().optional().nullable(),
  debito: z.number().positive().optional(),
  credito: z.number().positive().optional(),
  detalle: z.string().optional().nullable(),
}).superRefine((a, ctx) => {
  if ((a.debito === undefined) === (a.credito === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cada asiento debe tener exactamente un débito o un crédito",
    });
  }
});

const guardarSchema = z.object({
  tipo: z.nativeEnum(TipoComprobante),
  fecha: z.string().min(1),
  periodoId: z.number().int().positive(),
  terceroId: z.string().optional().nullable(),
  concepto: z.string().min(1),
  estado: z.nativeEnum(EstadoComprobante).optional(),
  asientos: z.array(asientoSchema).min(2, "Un comprobante requiere al menos 2 asientos"),
});

const actualizarSchema = z.object({
  fecha: z.string().min(1).optional(),
  terceroId: z.string().optional().nullable(),
  concepto: z.string().min(1).optional(),
  asientos: z.array(asientoSchema).min(2, "Un comprobante requiere al menos 2 asientos").optional(),
});

function num(x: Prisma.Decimal | null | undefined): number {
  return x ? x.toNumber() : 0;
}

type AsientoBase = Prisma.AsientoGetPayload<{}>;
type AsientoConRel = Prisma.AsientoGetPayload<{
  include: { cuenta: { select: { codigo: true; nombre: true } }; tercero: { select: { nombreRazonSocial: true } } };
}>;

function serializarAsiento(a: AsientoBase | AsientoConRel) {
  const c = (a as AsientoConRel).cuenta;
  const t = (a as AsientoConRel).tercero;
  return {
    id: a.id,
    comprobanteId: a.comprobanteId,
    cuentaId: a.cuentaId,
    codigoCuenta: c?.codigo,
    nombreCuenta: c?.nombre,
    terceroId: a.terceroId,
    tercero: t?.nombreRazonSocial,
    debito: num(a.debito),
    credito: num(a.credito),
    detalle: a.detalle,
  };
}

interface ComprobanteConRel {
  id: number;
  tipo: TipoComprobante;
  consecutivo: number;
  fecha: Date;
  periodoId: number;
  terceroId: string | null;
  concepto: string;
  totalDebito: Prisma.Decimal;
  totalCredito: Prisma.Decimal;
  estado: EstadoComprobante;
  usuarioCreoId: string;
  usuarioAnuloId: string | null;
  fechaAnulacion: Date | null;
  createdAt: Date;
  updatedAt: Date;
  periodo?: { id: number; nombre: string; estado: EstadoPeriodo };
  tercero?: { nombreRazonSocial: string } | null;
  asientos?: (AsientoBase | AsientoConRel)[];
  _count?: { asientos: number };
}

function serializarComprobante(c: ComprobanteConRel) {
  const { asientos, _count, ...rest } = c;
  return {
    ...rest,
    totalDebito: num(c.totalDebito),
    totalCredito: num(c.totalCredito),
    asientos: asientos ? asientos.map((a) => serializarAsiento(a)) : undefined,
    numAsientos: _count?.asientos,
  };
}

async function validarYPreparar(data: z.infer<typeof guardarSchema>, empresaId: string) {
  const periodo = await prisma.periodo.findFirst({ where: { id: data.periodoId, empresaId } });
  if (!periodo) return { error: `No existe el periodo ${data.periodoId}` as string };
  if (periodo.estado !== EstadoPeriodo.ABIERTO) return { error: "El periodo está cerrado" };
  const fecha = new Date(data.fecha);
  if (isNaN(fecha.getTime())) return { error: "Fecha inválida" };
  if (fecha < periodo.fechaInicio || fecha > periodo.fechaFin) {
    return { error: `La fecha debe estar dentro del periodo (${periodo.fechaInicio.toISOString().slice(0, 10)} a ${periodo.fechaFin.toISOString().slice(0, 10)})` };
  }

  if (data.terceroId) {
    const tercero = await prisma.tercero.findFirst({ where: { id: data.terceroId, empresaId } });
    if (!tercero) return { error: "El tercero no existe" };
  }

  const idsCuenta = [...new Set(data.asientos.map((a) => a.cuentaId))];
  const cuentas = await prisma.cuenta.findMany({
    where: { id: { in: idsCuenta }, OR: [{ empresaId: null }, { empresaId }] },
  });
  const cuentaPorId = new Map(cuentas.map((c) => [c.id, c]));

  const anioPeriodo = Number(periodo.fechaInicio.toISOString().slice(0, 4));
  const cierreAnio = await prisma.cierreAnual.findFirst({ where: { anio: anioPeriodo, empresaId } });
  if (cierreAnio && cuentas.some((c) => c.clase >= 4 && c.clase <= 7)) {
    return { error: `El año ${anioPeriodo} está cerrado; no se permiten movimientos en cuentas de resultado` };
  }

  let totalDebito = new Prisma.Decimal(0);
  let totalCredito = new Prisma.Decimal(0);

  for (const a of data.asientos) {
    const cuenta = cuentaPorId.get(a.cuentaId);
    if (!cuenta) return { error: `La cuenta ${a.cuentaId} no existe` };
    if (!cuenta.activa) return { error: `La cuenta ${cuenta.codigo} está inactiva` };
    if (!cuenta.permiteMovimiento) return { error: `La cuenta ${cuenta.codigo} (${cuenta.nombre}) no permite movimiento` };
    if (cuenta.requiereTercero) {
      if (!a.terceroId) return { error: `La cuenta ${cuenta.codigo} requiere asociar un tercero` };
      const t = await prisma.tercero.findFirst({ where: { id: a.terceroId, empresaId } });
      if (!t) return { error: "El tercero asociado no existe" };
    }
    if (a.debito) totalDebito = totalDebito.plus(a.debito);
    if (a.credito) totalCredito = totalCredito.plus(a.credito);
  }

  if (!totalDebito.equals(totalCredito)) {
    return { error: `La partida doble no cuadra: débitos ${totalDebito.toFixed(2)} vs créditos ${totalCredito.toFixed(2)}` };
  }

  return { periodo, fecha, totalDebito, totalCredito };
}

export async function listar(req: Request, res: Response): Promise<void> {
  const tipo = req.query.tipo ? String(req.query.tipo) : undefined;
  const estado = req.query.estado ? String(req.query.estado) : undefined;
  const periodoId = req.query.periodoId ? Number(req.query.periodoId) : undefined;
  const fechaDesde = req.query.fechaDesde ? String(req.query.fechaDesde) : undefined;
  const fechaHasta = req.query.fechaHasta ? String(req.query.fechaHasta) : undefined;
  const busqueda = req.query.busqueda ? String(req.query.busqueda).trim() : undefined;

  const where: Prisma.ComprobanteWhereInput = { empresaId: req.empresaId };
  if (tipo && (Object.values(TipoComprobante) as string[]).includes(tipo)) where.tipo = tipo as TipoComprobante;
  if (estado && (Object.values(EstadoComprobante) as string[]).includes(estado)) where.estado = estado as EstadoComprobante;
  if (periodoId) where.periodoId = periodoId;
  if (fechaDesde || fechaHasta) {
    where.fecha = {};
    if (fechaDesde) where.fecha.gte = new Date(fechaDesde);
    if (fechaHasta) where.fecha.lte = new Date(fechaHasta);
  }
  if (busqueda) where.concepto = { contains: busqueda, mode: "insensitive" };

  const comprobantes = await prisma.comprobante.findMany({
    where,
    orderBy: [{ fecha: "desc" }, { consecutivo: "desc" }],
    include: {
      periodo: true,
      tercero: { select: { nombreRazonSocial: true } },
      _count: { select: { asientos: true } },
    },
  });

  res.json(comprobantes.map((c) => serializarComprobante(c)));
}

export async function detalle(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const comprobante = await prisma.comprobante.findFirst({
    where: { id, empresaId: req.empresaId },
    include: {
      periodo: true,
      tercero: { select: { nombreRazonSocial: true } },
      asientos: { include: { cuenta: { select: { codigo: true, nombre: true } }, tercero: { select: { nombreRazonSocial: true } } } },
    },
  });
  if (!comprobante) {
    res.status(404).json({ error: "Comprobante no encontrado" });
    return;
  }
  res.json(serializarComprobante(comprobante));
}

export async function crear(req: Request, res: Response): Promise<void> {
  const parsed = guardarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;

  const validado = await validarYPreparar(data, req.empresaId!);
  if ("error" in validado) {
    res.status(400).json({ error: validado.error });
    return;
  }
  const { periodo, fecha, totalDebito, totalCredito } = validado;
  const usuarioId = req.user!.sub;
  const estado = data.estado ?? EstadoComprobante.BORRADOR;

  const comprobante = await prisma.$transaction(async (tx) => {
    const [max, cont] = await Promise.all([
      tx.comprobante.aggregate({ _max: { consecutivo: true }, where: { tipo: data.tipo, empresaId: req.empresaId } }),
      tx.consecutivo.upsert({
        where: { empresaId_tipo: { empresaId: req.empresaId!, tipo: data.tipo } },
        create: { empresaId: req.empresaId!, tipo: data.tipo, ultimo: 0 },
        update: {},
      }),
    ]);
    const base = Math.max(max._max.consecutivo ?? 0, cont.ultimo);
    const consecutivo = base + 1;
    await tx.consecutivo.update({
      where: { empresaId_tipo: { empresaId: req.empresaId!, tipo: data.tipo } },
      data: { ultimo: consecutivo },
    });
    const creado = await tx.comprobante.create({
      data: {
        empresaId: req.empresaId!,
        tipo: data.tipo,
        consecutivo,
        fecha,
        periodoId: periodo.id,
        terceroId: data.terceroId ?? null,
        concepto: data.concepto,
        totalDebito,
        totalCredito,
        estado,
        usuarioCreoId: usuarioId,
        asientos: {
          create: data.asientos.map((a) => ({
            cuentaId: a.cuentaId,
            terceroId: a.terceroId ?? null,
            debito: a.debito ?? 0,
            credito: a.credito ?? 0,
            detalle: a.detalle ?? null,
          })),
        },
      },
      include: { asientos: true, periodo: true },
    });
    return creado;
  });

  res.status(201).json(serializarComprobante(comprobante));
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const existe = await prisma.comprobante.findFirst({
    where: { id, empresaId: req.empresaId },
    include: { periodo: true },
  });
  if (!existe) {
    res.status(404).json({ error: "Comprobante no encontrado" });
    return;
  }
  if (existe.estado !== EstadoComprobante.BORRADOR) {
    res.status(400).json({ error: "Solo se pueden editar comprobantes en borrador" });
    return;
  }

  const parsed = actualizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;

  const base = {
    tipo: existe.tipo,
    fecha: data.fecha ?? existe.fecha.toISOString().slice(0, 10),
    periodoId: existe.periodoId,
    terceroId: data.terceroId !== undefined ? data.terceroId : existe.terceroId,
    concepto: data.concepto ?? existe.concepto,
    asientos: data.asientos ?? (await prisma.asiento.findMany({
      where: { comprobanteId: id },
      select: { cuentaId: true, terceroId: true, debito: true, credito: true, detalle: true },
    })).map((a) => ({
      cuentaId: a.cuentaId,
      terceroId: a.terceroId,
      debito: num(a.debito) || undefined,
      credito: num(a.credito) || undefined,
      detalle: a.detalle,
    })),
  };

  const validado = await validarYPreparar(base as z.infer<typeof guardarSchema>, req.empresaId!);
  if ("error" in validado) {
    res.status(400).json({ error: validado.error });
    return;
  }
  const { totalDebito, totalCredito } = validado;

  const actualizado = await prisma.$transaction(async (tx) => {
    await tx.asiento.deleteMany({ where: { comprobanteId: id } });
    const c = await tx.comprobante.update({
      where: { id },
      data: {
        fecha: data.fecha ? new Date(data.fecha) : undefined,
        terceroId: data.terceroId !== undefined ? data.terceroId : undefined,
        concepto: data.concepto,
        totalDebito,
        totalCredito,
        asientos: {
          create: base.asientos.map((a) => ({
            cuentaId: a.cuentaId,
            terceroId: a.terceroId ?? null,
            debito: a.debito ?? 0,
            credito: a.credito ?? 0,
            detalle: a.detalle ?? null,
          })),
        },
      },
      include: { asientos: true, periodo: true },
    });
    return c;
  });

  res.json(serializarComprobante(actualizado));
}

export async function contabilizar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const existe = await prisma.comprobante.findFirst({ where: { id, empresaId: req.empresaId } });
  if (!existe) {
    res.status(404).json({ error: "Comprobante no encontrado" });
    return;
  }
  if (existe.estado !== EstadoComprobante.BORRADOR) {
    res.status(400).json({ error: "El comprobante debe estar en borrador para contabilizarse" });
    return;
  }
  const actualizado = await prisma.$transaction(async (tx) => {
    const c = await tx.comprobante.update({
      where: { id },
      data: { estado: EstadoComprobante.CONTABILIZADO },
      include: { periodo: true },
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.CONTABILIZAR,
      entidad: "Comprobante",
      entidadId: id,
      detalle: { consecutivo: c.consecutivo, tipo: c.tipo, concepto: c.concepto },
    });
    return c;
  });
  res.json(serializarComprobante(actualizado));
}

export async function anular(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const existe = await prisma.comprobante.findFirst({ where: { id, empresaId: req.empresaId } });
  if (!existe) {
    res.status(404).json({ error: "Comprobante no encontrado" });
    return;
  }
  if (existe.estado !== EstadoComprobante.CONTABILIZADO) {
    res.status(400).json({ error: "Solo se pueden anular comprobantes contabilizados" });
    return;
  }
  const actualizado = await prisma.$transaction(async (tx) => {
    const c = await tx.comprobante.update({
      where: { id },
      data: { estado: EstadoComprobante.ANULADO, usuarioAnuloId: req.user!.sub, fechaAnulacion: new Date() },
      include: { periodo: true },
    });
    if (c.concepto.startsWith("Nómina periodo")) {
      await tx.nomina.updateMany({ where: { comprobanteId: id }, data: { estado: EstadoNomina.ANULADO } });
    }
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.ANULAR,
      entidad: "Comprobante",
      entidadId: id,
      detalle: { consecutivo: c.consecutivo, tipo: c.tipo, concepto: c.concepto },
    });
    return c;
  });
  res.json(serializarComprobante(actualizado));
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const existe = await prisma.comprobante.findFirst({ where: { id, empresaId: req.empresaId } });
  if (!existe) {
    res.status(404).json({ error: "Comprobante no encontrado" });
    return;
  }
  if (existe.estado !== EstadoComprobante.BORRADOR) {
    res.status(400).json({ error: "Solo se pueden eliminar comprobantes en borrador" });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.comprobante.delete({ where: { id } });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.ELIMINAR_COMPROBANTE,
      entidad: "Comprobante",
      entidadId: id,
      detalle: { consecutivo: existe.consecutivo, tipo: existe.tipo, concepto: existe.concepto },
    });
  });
  res.json({ ok: true });
}
