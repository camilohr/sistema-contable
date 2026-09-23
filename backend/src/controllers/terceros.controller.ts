import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { TipoDocumento, TipoTercero, AccionAuditoria } from "@prisma/client";
import { registrarAuditoria } from "../lib/auditoria.js";
import { parsearPaginacion, respuestaPaginada, type Paginacion } from "../lib/paginacion.js";

function regexPorTipo(tipo: TipoDocumento): RegExp {
  switch (tipo) {
    case "NIT":
      return /^\d{8,10}(-\d{1})?$/;
    case "CE":
      return /^[A-Za-z0-9]{5,12}$/;
    case "PASAPORTE":
      return /^[A-Za-z0-9]{5,15}$/;
    default:
      return /^\d{6,10}$/;
  }
}

const documentoValido = (tipo: TipoDocumento, documento: string): boolean =>
  regexPorTipo(tipo).test(documento);

const crearSchema = z.object({
  tipo: z.nativeEnum(TipoTercero).optional(),
  tipoDocumento: z.nativeEnum(TipoDocumento),
  documento: z.string().min(1),
  nombreRazonSocial: z.string().min(1),
  direccion: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  ciudad: z.string().optional().nullable(),
}).superRefine((val, ctx) => {
  if (!documentoValido(val.tipoDocumento, val.documento)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["documento"], message: "Documento inválido para el tipo seleccionado" });
  }
});

const actualizarSchema = z.object({
  tipo: z.nativeEnum(TipoTercero).optional(),
  tipoDocumento: z.nativeEnum(TipoDocumento).optional(),
  documento: z.string().min(1).optional(),
  nombreRazonSocial: z.string().min(1).optional(),
  direccion: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  ciudad: z.string().optional().nullable(),
  activo: z.boolean().optional(),
}).superRefine((val, ctx) => {
  if (val.tipoDocumento && val.documento !== undefined && !documentoValido(val.tipoDocumento, val.documento)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["documento"], message: "Documento inválido para el tipo seleccionado" });
  }
});

export async function listar(req: Request, res: Response): Promise<void> {
  const tipo = req.query.tipo ? String(req.query.tipo) : undefined;
  const busqueda = req.query.busqueda ? String(req.query.busqueda).trim() : undefined;
  const soloActivos = req.query.soloActivos === "true";

  const where: Record<string, unknown> = { empresaId: req.empresaId };
  if (tipo && (Object.values(TipoTercero) as string[]).includes(tipo)) where.tipo = tipo;
  if (soloActivos) where.activo = true;
  if (busqueda) {
    where.OR = [
      { nombreRazonSocial: { contains: busqueda, mode: "insensitive" } },
      { documento: { contains: busqueda } },
      { email: { contains: busqueda, mode: "insensitive" } },
    ];
  }

  let paginacion: Paginacion | undefined;
  try {
    paginacion = parsearPaginacion(req.query);
  } catch {
    res.status(400).json({ error: "Parámetros de paginación inválidos" });
    return;
  }

  const total = paginacion ? await prisma.tercero.count({ where }) : 0;
  const terceros = await prisma.tercero.findMany({
    where,
    orderBy: { nombreRazonSocial: "asc" },
    ...(paginacion ? { skip: (paginacion.pagina - 1) * paginacion.porPagina, take: paginacion.porPagina } : {}),
  });
  res.json(respuestaPaginada(terceros, total, paginacion?.pagina, paginacion?.porPagina));
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

  const existe = await prisma.tercero.findFirst({
    where: { empresaId, tipoDocumento: data.tipoDocumento, documento: data.documento },
  });
  if (existe) {
    res.status(409).json({ error: `Ya existe un tercero con ${data.tipoDocumento} ${data.documento}` });
    return;
  }

  const tercero = await prisma.tercero.create({
    data: {
      empresaId,
      tipo: data.tipo ?? "CLIENTE",
      tipoDocumento: data.tipoDocumento,
      documento: data.documento,
      nombreRazonSocial: data.nombreRazonSocial,
      direccion: data.direccion ?? null,
      telefono: data.telefono ?? null,
      email: data.email ?? null,
      ciudad: data.ciudad ?? null,
    },
  });
  res.status(201).json(tercero);
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const parsed = actualizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;

  const existe = await prisma.tercero.findFirst({ where: { id, empresaId: req.empresaId } });
  if (!existe) {
    res.status(404).json({ error: "Tercero no encontrado" });
    return;
  }
  if (existe.anonimizado) {
    res.status(400).json({ error: "No se puede editar un tercero anonimizado (datos personales suprimidos a petición del titular, Ley 1581)" });
    return;
  }

  const tipoDoc = (data.tipoDocumento ?? existe.tipoDocumento) as TipoDocumento;
  const documento = data.documento ?? existe.documento;
  if (tipoDoc !== existe.tipoDocumento || documento !== existe.documento) {
    const duplicado = await prisma.tercero.findFirst({
      where: { empresaId: req.empresaId, tipoDocumento: tipoDoc, documento },
    });
    if (duplicado) {
      res.status(409).json({ error: `Ya existe un tercero con ${tipoDoc} ${documento}` });
      return;
    }
  }

  const tercero = await prisma.tercero.update({ where: { id }, data });
  res.json(tercero);
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const existe = await prisma.tercero.findFirst({ where: { id, empresaId: req.empresaId } });
  if (!existe) {
    res.status(404).json({ error: "Tercero no encontrado" });
    return;
  }
  await prisma.tercero.update({ where: { id }, data: { activo: false } });
  res.json({ ok: true });
}

/**
 * Anonimiza los datos personales de un tercero a petición del titular (derecho
 * de supresión, Ley 1581 de 2012). Conserva el registro contable (movimientos y
 * montos siguen existiendo) pero limpia los campos identificables: nombre,
 * dirección, teléfono, email y ciudad. El `documento` se conserva porque la
 * norma contable exige trazabilidad. El tercero queda inactivo y marcado como
 * anonimizado para impedir ediciones posteriores.
 */
export async function anonimizar(req: Request, res: Response): Promise<void> {
  const empresaId = req.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: "Empresa no seleccionada" });
    return;
  }
  const id = req.params.id;
  const existe = await prisma.tercero.findFirst({ where: { id, empresaId } });
  if (!existe) {
    res.status(404).json({ error: "Tercero no encontrado" });
    return;
  }
  if (existe.anonimizado) {
    res.status(400).json({ error: "Este tercero ya fue anonimizado" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.tercero.update({
      where: { id },
      data: {
        nombreRazonSocial: "[ANONIMIZADO]",
        direccion: null,
        telefono: null,
        email: null,
        ciudad: null,
        anonimizado: true,
        activo: false,
      },
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId,
      accion: AccionAuditoria.ANONIMIZAR_TERCERO,
      entidad: "Tercero",
      entidadId: id,
      detalle: { documento: existe.documento, mensaje: "Datos personales suprimidos (Ley 1581); registro contable conservado" },
    });
  });
  res.json({ ok: true, mensaje: "Tercero anonimizado: datos personales suprimidos, registro contable conservado" });
}
