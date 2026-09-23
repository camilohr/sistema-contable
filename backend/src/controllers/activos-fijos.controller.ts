import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, EstadoPeriodo, EstadoActivoFijo, EstadoComprobante, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { num } from "../lib/decimal.js";
import { depreciarOrquestado, bajaOrquestado } from "../lib/activos-fijos.js";
import { parsearPaginacion, respuestaPaginada, type Paginacion } from "../lib/paginacion.js";

const crearSchema = z.object({
  cuentaId: z.number().int().positive(),
  cuentaDepreciacionId: z.number().int().positive(),
  cuentaGastoId: z.number().int().positive(),
  nombre: z.string().min(1),
  fechaAdquisicion: z.string().min(1),
  valor: z.number().positive(),
  vidaUtilMeses: z.number().int().positive(),
  valorResidual: z.number().min(0).default(0),
});

const actualizarSchema = z.object({
  nombre: z.string().min(1),
});

type ActivoConRel = Prisma.ActivoFijoGetPayload<{
  include: {
    cuenta: { select: { codigo: true; nombre: true } };
    cuentaDepreciacion: { select: { codigo: true; nombre: true } };
    cuentaGasto: { select: { codigo: true; nombre: true } };
    _count: { select: { depreciaciones: true } };
  };
}>;

function serializarActivo(a: ActivoConRel) {
  return {
    id: a.id,
    cuentaId: a.cuentaId,
    codigoCuenta: a.cuenta.codigo,
    nombreCuenta: a.cuenta.nombre,
    cuentaDepreciacionId: a.cuentaDepreciacionId,
    codigoCuentaDepreciacion: a.cuentaDepreciacion.codigo,
    nombreCuentaDepreciacion: a.cuentaDepreciacion.nombre,
    cuentaGastoId: a.cuentaGastoId,
    codigoCuentaGasto: a.cuentaGasto.codigo,
    nombreCuentaGasto: a.cuentaGasto.nombre,
    nombre: a.nombre,
    fechaAdquisicion: a.fechaAdquisicion.toISOString().slice(0, 10),
    valor: num(a.valor),
    vidaUtilMeses: a.vidaUtilMeses,
    valorResidual: num(a.valorResidual),
    metodo: a.metodo,
    depreciacionAcumulada: num(a.depreciacionAcumulada),
    estado: a.estado,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    numDepreciaciones: a._count.depreciaciones,
  };
}

async function validarCuentas(cuentaId: number, cuentaDepreciacionId: number, cuentaGastoId: number, empresaId: string) {
  const ids = [...new Set([cuentaId, cuentaDepreciacionId, cuentaGastoId])];
  const cuentas = await prisma.cuenta.findMany({
    where: { id: { in: ids }, OR: [{ empresaId: null }, { empresaId }] },
  });
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  for (const id of ids) {
    const c = porId.get(id);
    if (!c) return { error: `La cuenta ${id} no existe` };
    if (!c.activa) return { error: `La cuenta ${c.codigo} (${c.nombre}) está inactiva` };
    if (!c.permiteMovimiento) return { error: `La cuenta ${c.codigo} (${c.nombre}) no permite movimiento` };
  }
  return { porId };
}

export async function listar(req: Request, res: Response): Promise<void> {
  const estado = req.query.estado ? String(req.query.estado) : undefined;
  const where: Prisma.ActivoFijoWhereInput = { empresaId: req.empresaId };
  if (estado && (Object.values(EstadoActivoFijo) as string[]).includes(estado)) where.estado = estado as EstadoActivoFijo;

  let paginacion: Paginacion | undefined;
  try {
    paginacion = parsearPaginacion(req.query);
  } catch {
    res.status(400).json({ error: "Parámetros de paginación inválidos" });
    return;
  }

  const total = paginacion ? await prisma.activoFijo.count({ where }) : 0;
  const activos = await prisma.activoFijo.findMany({
    where,
    orderBy: [{ fechaAdquisicion: "desc" }, { nombre: "asc" }],
    include: {
      cuenta: { select: { codigo: true, nombre: true } },
      cuentaDepreciacion: { select: { codigo: true, nombre: true } },
      cuentaGasto: { select: { codigo: true, nombre: true } },
      _count: { select: { depreciaciones: true } },
    },
    ...(paginacion ? { skip: (paginacion.pagina - 1) * paginacion.porPagina, take: paginacion.porPagina } : {}),
  });
  res.json(respuestaPaginada(activos.map((a) => serializarActivo(a)), total, paginacion?.pagina, paginacion?.porPagina));
}

export async function crear(req: Request, res: Response): Promise<void> {
  const empresaId = req.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: "Empresa no seleccionada" });
    return;
  }
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const fecha = new Date(data.fechaAdquisicion);
  if (isNaN(fecha.getTime())) {
    res.status(400).json({ error: "Fecha inválida" });
    return;
  }

  const validado = await validarCuentas(data.cuentaId, data.cuentaDepreciacionId, data.cuentaGastoId, empresaId);
  if ("error" in validado) {
    res.status(400).json({ error: validado.error });
    return;
  }

  const activo = await prisma.$transaction(async (tx) => {
    const a = await tx.activoFijo.create({
      data: {
        empresaId,
        cuentaId: data.cuentaId,
        cuentaDepreciacionId: data.cuentaDepreciacionId,
        cuentaGastoId: data.cuentaGastoId,
        nombre: data.nombre,
        fechaAdquisicion: fecha,
        valor: new Prisma.Decimal(data.valor),
        vidaUtilMeses: data.vidaUtilMeses,
        valorResidual: new Prisma.Decimal(data.valorResidual),
      },
      include: {
        cuenta: { select: { codigo: true, nombre: true } },
        cuentaDepreciacion: { select: { codigo: true, nombre: true } },
        cuentaGasto: { select: { codigo: true, nombre: true } },
        _count: { select: { depreciaciones: true } },
      },
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId,
      accion: AccionAuditoria.CREAR_ACTIVO,
      entidad: "ActivoFijo",
      entidadId: a.id,
      detalle: { nombre: a.nombre, valor: data.valor, vidaUtilMeses: a.vidaUtilMeses },
    });
    return a;
  });
  res.status(201).json(serializarActivo(activo));
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const existe = await prisma.activoFijo.findFirst({ where: { id, empresaId: req.empresaId } });
  if (!existe) {
    res.status(404).json({ error: "Activo no encontrado" });
    return;
  }
  const parsed = actualizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const activo = await prisma.$transaction(async (tx) => {
    const a = await tx.activoFijo.update({
      where: { id },
      data: { nombre: parsed.data.nombre },
      include: {
        cuenta: { select: { codigo: true, nombre: true } },
        cuentaDepreciacion: { select: { codigo: true, nombre: true } },
        cuentaGasto: { select: { codigo: true, nombre: true } },
        _count: { select: { depreciaciones: true } },
      },
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.EDITAR_ACTIVO,
      entidad: "ActivoFijo",
      entidadId: id,
      detalle: { nombre: a.nombre },
    });
    return a;
  });
  res.json(serializarActivo(activo));
}

export async function depreciar(req: Request, res: Response): Promise<void> {
  const r = await depreciarOrquestado({
    empresaId: req.empresaId!,
    usuarioId: req.user!.sub,
    periodoId: Number(req.params.periodoId),
  });
  res.status(r.status).json(r.body);
}

export async function contabilizar(req: Request, res: Response): Promise<void> {
  const empresaId = req.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: "Empresa no seleccionada" });
    return;
  }
  const periodoId = Number(req.params.periodoId);
  if (!Number.isInteger(periodoId)) {
    res.status(400).json({ error: "Periodo inválido" });
    return;
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId } });
  if (!periodo) {
    res.status(404).json({ error: `No existe el periodo ${periodoId}` });
    return;
  }
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    res.status(400).json({ error: "El periodo está cerrado" });
    return;
  }

  const depreciaciones = await prisma.depreciacion.findMany({
    where: { periodoId },
    include: { comprobante: true },
  });
  if (depreciaciones.length === 0) {
    res.status(400).json({ error: "Primero calcule la depreciación del periodo (queda en borrador)" });
    return;
  }
  const comprobante = depreciaciones[0].comprobante;
  if (!comprobante) {
    res.status(400).json({ error: "La depreciación no tiene comprobante asociado; vuelva a calcularla" });
    return;
  }
  if (comprobante.estado === EstadoComprobante.CONTABILIZADO) {
    res.status(400).json({ error: "La depreciación del periodo ya está contabilizada" });
    return;
  }
  if (comprobante.estado !== EstadoComprobante.BORRADOR) {
    res.status(400).json({ error: "El comprobante de depreciación no está en borrador" });
    return;
  }

  const usuarioId = req.user!.sub;
  const resultado = await prisma.$transaction(async (tx) => {
    const c = await tx.comprobante.update({
      where: { id: comprobante.id },
      data: { estado: EstadoComprobante.CONTABILIZADO },
      include: { asientos: { include: { cuenta: { select: { codigo: true } } } }, periodo: true },
    });
    await registrarAuditoria(tx, {
      usuarioId,
      empresaId,
      accion: AccionAuditoria.CONTABILIZAR,
      entidad: "Comprobante",
      entidadId: comprobante.id,
      detalle: { consecutivo: c.consecutivo, concepto: c.concepto, origen: "depreciacion", periodo: periodo.nombre },
    });
    return c;
  });

  res.status(200).json({
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
    procesados: depreciaciones.length,
  });
}

export async function baja(req: Request, res: Response): Promise<void> {
  const r = await bajaOrquestado({
    empresaId: req.empresaId!,
    usuarioId: req.user!.sub,
    id: Number(req.params.id),
    body: req.body,
  });
  res.status(r.status).json(r.body);
}

export async function listarDepreciaciones(req: Request, res: Response): Promise<void> {
  const activoId = Number(req.params.id);
  const activo = await prisma.activoFijo.findFirst({ where: { id: activoId, empresaId: req.empresaId } });
  if (!activo) {
    res.status(404).json({ error: "Activo no encontrado" });
    return;
  }
  const depreciaciones = await prisma.depreciacion.findMany({
    where: { activoId },
    orderBy: { createdAt: "asc" },
    include: { periodo: { select: { nombre: true } } },
  });
  res.json(depreciaciones.map((d) => ({
    id: d.id,
    periodoId: d.periodoId,
    periodo: d.periodo.nombre,
    comprobanteId: d.comprobanteId,
    valor: num(d.valor),
    createdAt: d.createdAt,
  })));
}