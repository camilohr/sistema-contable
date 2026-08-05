import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, EstadoPeriodo, EstadoActivoFijo, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { crearComprobanteDiario, AsientoGenerado } from "../lib/comprobantes.js";

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

const bajaSchema = z.object({
  periodoId: z.number().int().positive(),
  fecha: z.string().min(1),
  concepto: z.string().min(1),
});

function num(x: Prisma.Decimal | null | undefined): number {
  return x ? x.toNumber() : 0;
}

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

  const activos = await prisma.activoFijo.findMany({
    where,
    orderBy: [{ fechaAdquisicion: "desc" }, { nombre: "asc" }],
    include: {
      cuenta: { select: { codigo: true, nombre: true } },
      cuentaDepreciacion: { select: { codigo: true, nombre: true } },
      cuentaGasto: { select: { codigo: true, nombre: true } },
      _count: { select: { depreciaciones: true } },
    },
  });
  res.json(activos.map((a) => serializarActivo(a)));
}

export async function crear(req: Request, res: Response): Promise<void> {
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

  const validado = await validarCuentas(data.cuentaId, data.cuentaDepreciacionId, data.cuentaGastoId, req.empresaId!);
  if ("error" in validado) {
    res.status(400).json({ error: validado.error });
    return;
  }

  const activo = await prisma.$transaction(async (tx) => {
    const a = await tx.activoFijo.create({
      data: {
        empresaId: req.empresaId,
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
      empresaId: req.empresaId,
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
  const periodoId = Number(req.params.periodoId);
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId: req.empresaId } });
  if (!periodo) {
    res.status(404).json({ error: `No existe el periodo ${periodoId}` });
    return;
  }
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    res.status(400).json({ error: "El periodo está cerrado" });
    return;
  }
  const yaGenerado = await prisma.depreciacion.count({ where: { periodoId } });
  if (yaGenerado > 0) {
    res.status(400).json({ error: "La depreciación para este periodo ya fue generada" });
    return;
  }

  const activos = await prisma.activoFijo.findMany({ where: { estado: EstadoActivoFijo.ACTIVO, empresaId: req.empresaId } });

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
    res.status(400).json({ error: "No hay activos vigentes por depreciar en este periodo" });
    return;
  }

  const usuarioId = req.user!.sub;
  const asientos: AsientoGenerado[] = porDepreciar.flatMap((p) => [
    { cuentaId: p.activo.cuentaGastoId, debito: p.valorMes, credito: 0, detalle: `Depreciación ${p.activo.nombre}` },
    { cuentaId: p.activo.cuentaDepreciacionId, debito: 0, credito: p.valorMes, detalle: `Depreciación ${p.activo.nombre}` },
  ]);

  const resultado = await prisma.$transaction(async (tx) => {
    const comprobante = await crearComprobanteDiario(tx, {
      empresaId: req.empresaId!,
      periodoId,
      fecha: new Date(),
      concepto: `Depreciación periodo ${periodo.nombre}`,
      usuarioId,
      asientos,
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
      empresaId: req.empresaId,
      accion: AccionAuditoria.DEPRECIAR_ACTIVOS,
      entidad: "Periodo",
      entidadId: periodoId,
      detalle: { periodo: periodo.nombre, procesados: porDepreciar.length, comprobanteId: comprobante.id },
    });
    return comprobante;
  });

  res.status(201).json({
    comprobante: {
      id: resultado.id,
      tipo: resultado.tipo,
      consecutivo: resultado.consecutivo,
      concepto: resultado.concepto,
      totalDebito: num(resultado.totalDebito),
      totalCredito: num(resultado.totalCredito),
      numAsientos: resultado.asientos.length,
    },
    procesados: porDepreciar.length,
  });
}

export async function baja(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const activo = await prisma.activoFijo.findFirst({ where: { id, empresaId: req.empresaId } });
  if (!activo) {
    res.status(404).json({ error: "Activo no encontrado" });
    return;
  }
  if (activo.estado === EstadoActivoFijo.DADO_DE_BAJA) {
    res.status(400).json({ error: "El activo ya fue dado de baja" });
    return;
  }

  const parsed = bajaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const fecha = new Date(data.fecha);
  if (isNaN(fecha.getTime())) {
    res.status(400).json({ error: "Fecha inválida" });
    return;
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: data.periodoId, empresaId: req.empresaId } });
  if (!periodo) {
    res.status(404).json({ error: `No existe el periodo ${data.periodoId}` });
    return;
  }
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    res.status(400).json({ error: "El periodo está cerrado" });
    return;
  }
  if (fecha < periodo.fechaInicio || fecha > periodo.fechaFin) {
    res.status(400).json({ error: "La fecha debe estar dentro del periodo" });
    return;
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
      empresaId: req.empresaId!,
      periodoId: data.periodoId,
      fecha,
      concepto: data.concepto,
      usuarioId: req.user!.sub,
      asientos,
    });
    await tx.activoFijo.update({
      where: { id },
      data: { estado: EstadoActivoFijo.DADO_DE_BAJA },
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.BAJA_ACTIVO,
      entidad: "ActivoFijo",
      entidadId: id,
      detalle: { nombre: activo.nombre, valor, depreciacionAcumulada: acumulada, valorLibros },
    });
    return creado;
  });

  res.status(201).json({
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
  });
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
