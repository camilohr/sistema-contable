import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { FormaPago, EstadoCartera } from "@prisma/client";
import { asegurarSecuencia, obtenerSiguienteNumeroSecuencia, type EntidadSecuencia } from "../lib/secuencia.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const crearSchema = z.object({
  terceroId: z.string().min(1),
  comprobanteId: z.number().int().positive().optional().nullable(),
  numeroDocumento: z.string().min(1),
  fechaEmision: z.string().min(1),
  fechaVencimiento: z.string().min(1),
  valor: z.number().positive().multipleOf(0.01),
});

const actualizarSchema = z.object({
  terceroId: z.string().min(1).optional(),
  comprobanteId: z.number().int().positive().optional().nullable(),
  numeroDocumento: z.string().min(1).optional(),
  fechaEmision: z.string().min(1).optional(),
  fechaVencimiento: z.string().min(1).optional(),
});

const abonoSchema = z.object({
  valor: z.number().positive().multipleOf(0.01),
  formaPago: z.nativeEnum(FormaPago).optional(),
  fecha: z.string().min(1).optional(),
  comprobanteId: z.number().int().positive().optional().nullable(),
});

const num = (v: { toNumber(): number } | number): number => (typeof v === "number" ? v : v.toNumber());

async function sincronizarVencidas(empresaId: string): Promise<void> {
  const hoy = new Date();
  const condicion = { empresaId, estado: { in: [EstadoCartera.PENDIENTE, EstadoCartera.ABONADA] }, fechaVencimiento: { lt: hoy }, saldo: { gt: 0 } };
  await prisma.cuentaPorCobrar.updateMany({ where: condicion, data: { estado: EstadoCartera.VENCIDA } });
  await prisma.cuentaPorPagar.updateMany({ where: condicion, data: { estado: EstadoCartera.VENCIDA } });
}

function estadoEfectivo(doc: { saldo: { toNumber(): number }; valor: { toNumber(): number }; fechaVencimiento: Date; estado: string }): string {
  const saldo = num(doc.saldo);
  if (doc.estado === "CANCELADA" || saldo === 0) return "CANCELADA";
  if (new Date(doc.fechaVencimiento) < new Date()) return "VENCIDA";
  return saldo < num(doc.valor) ? "ABONADA" : "PENDIENTE";
}

type TipoCartera = "cxc" | "cxp";

function crearControlador(kind: TipoCartera) {
  const esCxC = kind === "cxc";
  const modelo: any = esCxC ? prisma.cuentaPorCobrar : prisma.cuentaPorPagar;
  const abonoModelo: any = esCxC ? prisma.recibo : prisma.pago;
  const abonoCampo = esCxC ? "cxcId" : "cxpId";
  const abonoRel = esCxC ? "recibos" : "pagos";

  const incluir = {
    tercero: { select: { id: true, nombreRazonSocial: true, documento: true, tipoDocumento: true } },
    comprobante: { select: { id: true, tipo: true, consecutivo: true, concepto: true } },
    [abonoRel]: { orderBy: { fecha: "asc" as const } },
  };

  const serializarAbono = (a: any) => ({ ...a, valor: num(a.valor) });

  const serializar = (doc: any) => {
    const abonos = doc[abonoRel];
    return { ...doc, estado: estadoEfectivo(doc), valor: num(doc.valor), saldo: num(doc.saldo), [abonoRel]: abonos ? abonos.map(serializarAbono) : abonos };
  };

  async function listar(req: Request, res: Response): Promise<void> {
    await sincronizarVencidas(req.empresaId!);
    const busqueda = req.query.busqueda ? String(req.query.busqueda).trim() : undefined;
    const estado = req.query.estado ? String(req.query.estado) : undefined;
    const terceroId = req.query.terceroId ? String(req.query.terceroId) : undefined;

    const where: Record<string, unknown> = { empresaId: req.empresaId };
    if (terceroId) where.terceroId = terceroId;
    if (busqueda) {
      where.OR = [
        { numeroDocumento: { contains: busqueda, mode: "insensitive" } },
        { tercero: { nombreRazonSocial: { contains: busqueda, mode: "insensitive" } } },
        { tercero: { documento: { contains: busqueda } } },
      ];
    }

    const docs = await modelo.findMany({
      where,
      include: incluir,
      orderBy: [{ fechaVencimiento: "asc" }],
    });
    const conEstado = docs.map(serializar);
    const filtrados = estado ? conEstado.filter((d: { estado: string }) => d.estado === estado) : conEstado;
    res.json(filtrados);
  }

  async function crear(req: Request, res: Response): Promise<void> {
    const parsed = crearSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    const tercero = await prisma.tercero.findFirst({ where: { id: data.terceroId, empresaId: req.empresaId } });
    if (!tercero || !tercero.activo) {
      res.status(400).json({ error: "El tercero no existe o está inactivo" });
      return;
    }
    if (new Date(data.fechaVencimiento) < new Date(data.fechaEmision)) {
      res.status(400).json({ error: "La fecha de vencimiento no puede ser anterior a la emisión" });
      return;
    }
    if (data.comprobanteId) {
      const comprobante = await prisma.comprobante.findFirst({
        where: { id: data.comprobanteId, empresaId: req.empresaId },
      });
      if (!comprobante) {
        res.status(400).json({ error: `No existe el comprobante ${data.comprobanteId}` });
        return;
      }
    }

    const doc = await modelo.create({
      data: {
        empresaId: req.empresaId,
        terceroId: data.terceroId,
        comprobanteId: data.comprobanteId ?? null,
        numeroDocumento: data.numeroDocumento,
        fechaEmision: new Date(data.fechaEmision),
        fechaVencimiento: new Date(data.fechaVencimiento),
        valor: data.valor,
        saldo: data.valor,
        estado: "PENDIENTE",
      },
      include: incluir,
    });
    res.status(201).json(serializar(doc));
  }

  async function detalle(req: Request, res: Response): Promise<void> {
    await sincronizarVencidas(req.empresaId!);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Id inválido" });
      return;
    }
    const doc = await modelo.findFirst({ where: { id, empresaId: req.empresaId }, include: incluir });
    if (!doc) {
      res.status(404).json({ error: "Documento no encontrado" });
      return;
    }
    res.json(serializar(doc));
  }

  async function actualizar(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const parsed = actualizarSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    const existe = await modelo.findFirst({ where: { id, empresaId: req.empresaId } });
    if (!existe) {
      res.status(404).json({ error: "Documento no encontrado" });
      return;
    }

    if (data.terceroId) {
      const tercero = await prisma.tercero.findFirst({ where: { id: data.terceroId, empresaId: req.empresaId } });
      if (!tercero || !tercero.activo) {
        res.status(400).json({ error: "El tercero no existe o está inactivo" });
        return;
      }
    }
    if (data.comprobanteId !== undefined && data.comprobanteId) {
      const comprobante = await prisma.comprobante.findFirst({
        where: { id: data.comprobanteId, empresaId: req.empresaId },
      });
      if (!comprobante) {
        res.status(400).json({ error: `No existe el comprobante ${data.comprobanteId}` });
        return;
      }
    }
    if (data.fechaEmision || data.fechaVencimiento) {
      const emision = data.fechaEmision ? new Date(data.fechaEmision) : existe.fechaEmision;
      const vencimiento = data.fechaVencimiento ? new Date(data.fechaVencimiento) : existe.fechaVencimiento;
      if (vencimiento < emision) {
        res.status(400).json({ error: "La fecha de vencimiento no puede ser anterior a la emisión" });
        return;
      }
    }

    const dataUpdate: Record<string, unknown> = {};
    if (data.terceroId) dataUpdate.terceroId = data.terceroId;
    if (data.comprobanteId !== undefined) dataUpdate.comprobanteId = data.comprobanteId;
    if (data.numeroDocumento) dataUpdate.numeroDocumento = data.numeroDocumento;
    if (data.fechaEmision) dataUpdate.fechaEmision = new Date(data.fechaEmision);
    if (data.fechaVencimiento) dataUpdate.fechaVencimiento = new Date(data.fechaVencimiento);

    await modelo.update({ where: { id }, data: dataUpdate, include: incluir });
    // Al cambiar fechas el estado VENCIDA puede cambiar: re-evaluar en la BD
    // (M3) para que los reportes por estado y la provisión usen el valor vigente.
    await sincronizarVencidas(req.empresaId!);
    const doc = await modelo.findFirst({ where: { id, empresaId: req.empresaId }, include: incluir });
    if (!doc) {
      res.status(404).json({ error: "Documento no encontrado" });
      return;
    }
    res.json(serializar(doc));
  }

  async function eliminar(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const existe = await modelo.findFirst({
      where: { id, empresaId: req.empresaId },
      include: { _count: { select: { [abonoRel]: true } } },
    });
    if (!existe) {
      res.status(404).json({ error: "Documento no encontrado" });
      return;
    }
    if (existe._count[abonoRel] > 0) {
      res.status(400).json({ error: "No se puede eliminar: el documento tiene abonos registrados" });
      return;
    }
    await modelo.delete({ where: { id } });
    res.json({ ok: true });
  }

  async function abonar(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const parsed = abonoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    const doc = await modelo.findFirst({ where: { id, empresaId: req.empresaId } });
    if (!doc) {
      res.status(404).json({ error: "Documento no encontrado" });
      return;
    }
    const saldo = num(doc.saldo);
    if (data.valor > saldo) {
      res.status(400).json({ error: `El abono (${data.valor}) supera el saldo (${saldo})` });
      return;
    }
    if (data.comprobanteId) {
      const comprobante = await prisma.comprobante.findFirst({
        where: { id: data.comprobanteId, empresaId: req.empresaId },
      });
      if (!comprobante) {
        res.status(400).json({ error: `No existe el comprobante ${data.comprobanteId}` });
        return;
      }
    }

    const entidad: EntidadSecuencia = esCxC ? "RECIBO" : "PAGO";
    await asegurarSecuencia(prisma, entidad, async () => {
      const filas = await abonoModelo.findMany({ select: { numero: true } });
      let max = 0;
      for (const f of filas as Array<{ numero: string }>) {
        const n = Number(f.numero.split("-")[1]);
        if (Number.isFinite(n) && n > max) max = n;
      }
      return max;
    });

    const resultado = await prisma.$transaction(async (txn) => {
      const tx = txn as any;
      const aplicado = await tx[esCxC ? "cuentaPorCobrar" : "cuentaPorPagar"].updateMany({
        where: { id, empresaId: req.empresaId, saldo: { gte: data.valor } },
        data: { saldo: { decrement: data.valor } },
      });
      if (aplicado.count === 0) return null;
      const numero = `${esCxC ? "R" : "P"}-${String(await obtenerSiguienteNumeroSecuencia(tx, entidad)).padStart(4, "0")}`;
      const abono = await tx[esCxC ? "recibo" : "pago"].create({
        data: {
          numero,
          fecha: data.fecha ? new Date(data.fecha) : new Date(),
          terceroId: doc.terceroId,
          [abonoCampo]: doc.id,
          comprobanteId: data.comprobanteId ?? null,
          valor: data.valor,
          formaPago: data.formaPago ?? "EFECTIVO",
        },
      });
      const nuevo = await tx[esCxC ? "cuentaPorCobrar" : "cuentaPorPagar"].findUniqueOrThrow({
        where: { id },
        select: { saldo: true },
      });
      const nuevoSaldo = num(nuevo.saldo);
      const actualizado = await tx[esCxC ? "cuentaPorCobrar" : "cuentaPorPagar"].update({
        where: { id },
        data: { estado: nuevoSaldo === 0 ? "CANCELADA" : "ABONADA" },
        include: incluir,
      });
      return { abono, actualizado };
    });

    if (!resultado) {
      res.status(400).json({ error: `El abono (${data.valor}) supera el saldo actual` });
      return;
    }

    res.status(201).json({ abono: serializarAbono(resultado.abono), documento: serializar(resultado.actualizado) });
  }

  return { listar, crear, detalle, actualizar, eliminar, abonar };
}

export const cxc = crearControlador("cxc");
export const cxp = crearControlador("cxp");
