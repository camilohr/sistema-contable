/* Seed de datos demo (idempotente) para el sistema contable.
 * Ejecución:  node scripts/seed-demo.mjs   (o: npm run db:seed:demo)
 * Usa la API REST en http://localhost:3000 y las credenciales del admin.
 * No modifica PUC ni usuarios: solo crea datos operativos si no existen.
 */
import "dotenv/config";

const API = process.env.API_URL || "http://localhost:3000";
const EMAIL = process.env.DEMO_EMAIL || "admin@sistema.local";
const PASSWORD = process.env.DEMO_PASSWORD || "Admin123!";

let token = "";
let empresaId = process.env.DEMO_EMPRESA_ID || "";

function pad(n) {
  return String(n).padStart(3, "0");
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(empresaId ? { "X-Empresa-Id": empresaId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const msg = json && (json.error || json.message) ? (json.error || json.message) : text;
    throw new Error(`${method} ${path} -> ${res.status}: ${msg}`);
  }
  return json;
}

const ok = (label) => console.log(`  ✓ ${label}`);

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login fallido (${res.status}). Verifica credenciales y que el servidor esté arriba en ${API}`);
  const data = await res.json();
  token = data.token;
  if (data.usuario?.debeCambiarPassword) {
    console.log(`  ! El usuario ${data.usuario.email} debe cambiar su contraseña inicial antes de continuar.`);
    console.log(`  Inicia sesión en ${API}, cámbiala desde "Cambiar contraseña" y vuelve a ejecutar este script.`);
    process.exit(0);
  }
  ok(`login como ${data.usuario.nombre} (${data.usuario.rol})`);
  if (!empresaId) {
    const empresas = await api("GET", "/api/empresas");
    if (!empresas.length) throw new Error("El usuario no tiene empresas asociadas. Asigna una empresa al usuario o define DEMO_EMPRESA_ID.");
    empresaId = empresas[0].id;
    ok(`empresa activa: ${empresas[0].nombre} (${empresaId})`);
  } else {
    ok(`empresa activa: ${empresaId} (DEMO_EMPRESA_ID)`);
  }
}

async function cuentas() {
  const lista = await api("GET", "/api/cuentas");
  const mapa = new Map(lista.map((c) => [c.codigo, c]));
  return mapa;
}

const CODIGOS = [
  "110505", "111005", "130505", "134505", "146005", "152005",
  "220505", "236530", "240805", "3105", "410505", "4115",
  "510505", "512025", "6130", "620505",
];

async function verificarCuentas(mapa) {
  const faltantes = CODIGOS.filter((c) => !mapa.has(c));
  if (faltantes.length) throw new Error(`Cuentas PUC no encontradas: ${faltantes.join(", ")}`);
  const sinMov = CODIGOS.filter((c) => !mapa.get(c).permiteMovimiento);
  if (sinMov.length) throw new Error(`Cuentas sin movimiento permitido: ${sinMov.join(", ")}`);
  ok(`16 cuentas PUC validadas (permiteMovimiento=true)`);
}

async function periodo2026() {
  const lista = await api("GET", "/api/periodos");
  const existente = lista.find((p) => p.nombre === "Periodo 2026");
  if (existente) {
    ok(`periodo "Periodo 2026" ya existía (id=${existente.id}, ${existente.estado})`);
    return existente.id;
  }
  const creado = await api("POST", "/api/periodos", {
    nombre: "Periodo 2026",
    fechaInicio: "2026-01-01",
    fechaFin: "2026-12-31",
  });
  ok(`periodo "Periodo 2026" creado (id=${creado.id})`);
  return creado.id;
}

const TERCEROS = [
  {
    tipo: "CLIENTE", tipoDocumento: "CC", documento: "123456789",
    nombreRazonSocial: "Carlos Andrés Pérez", direccion: "Calle 12 # 34-56", telefono: "3001234567",
    email: "carlos.perez@correo.com", ciudad: "Bogotá",
  },
  {
    tipo: "AMBOS", tipoDocumento: "CC", documento: "987654321",
    nombreRazonSocial: "María Fernanda López", direccion: "Cra 7 # 88-90", telefono: "3117654321",
    email: "maria.lopez@correo.com", ciudad: "Medellín",
  },
  {
    tipo: "PROVEEDOR", tipoDocumento: "NIT", documento: "900654321-9",
    nombreRazonSocial: "Distribuidora Andina S.A.S.", direccion: "Av El Dorado 100-20", telefono: "6015558899",
    email: "ventas@distribuidoraandina.co", ciudad: "Bogotá",
  },
  {
    tipo: "CLIENTE", tipoDocumento: "CC", documento: "800012345",
    nombreRazonSocial: "Juan Camilo Restrepo", direccion: "Calle 1 # 2-3", telefono: "3159876543",
    email: "juan.restrepo@correo.com", ciudad: "Cali",
  },
];

async function terceros() {
  const lista = await api("GET", "/api/terceros");
  const porDoc = new Map(lista.map((t) => [t.documento, t]));
  const ids = {};
  for (const t of TERCEROS) {
    const existente = porDoc.get(t.documento);
    if (existente) {
      ids[t.documento] = existente.id;
      ok(`tercero ${t.tipoDocumento} ${t.documento} ya existía (${existente.nombreRazonSocial})`);
    } else {
      const creado = await api("POST", "/api/terceros", t);
      ids[t.documento] = creado.id;
      ok(`tercero ${t.tipoDocumento} ${t.documento} creado (${t.nombreRazonSocial})`);
    }
  }
  return ids;
}

function asiento(mapa, codigo, importe, tipo, terceroId, detalle) {
  const a = { cuentaId: mapa.get(codigo).id, detalle: detalle ?? null };
  if (terceroId) a.terceroId = terceroId;
  a[tipo] = importe;
  return a;
}

async function crearComprobante(mapa, periodoId, idsTerceros, def) {
  const lista = await api("GET", "/api/comprobantes");
  const existente = lista.find((c) => c.concepto === def.concepto);
  if (existente) {
    ok(`comprobante "${def.concepto}" ya existía (${existente.tipo}-${String(existente.consecutivo).padStart(3, "0")}, ${existente.estado})`);
    return existente;
  }
  const creado = await api("POST", "/api/comprobantes", {
    tipo: def.tipo,
    fecha: def.fecha,
    periodoId,
    terceroId: def.terceroId ? idsTerceros[def.terceroId] : null,
    concepto: def.concepto,
    estado: def.estado ?? "CONTABILIZADO",
    asientos: def.asientos.map((a) => asiento(mapa, a.codigo, a.importe, a.tipo, a.terceroId ? idsTerceros[a.terceroId] : null, a.detalle)),
  });
  ok(`comprobante "${def.concepto}" creado (${creado.tipo}-${pad(creado.consecutivo)}, ${creado.estado}, deb ${creado.totalDebito})`);
  return creado;
}

async function comprobantes(mapa, periodoId, idsTerceros) {
  const defs = [
    {
      tipo: "DIARIO", fecha: "2026-01-05", concepto: "Aporte social inicial",
      asientos: [
        { codigo: "111005", tipo: "debito", importe: 15000000, detalle: "Consignación aporte inicial" },
        { codigo: "3105", tipo: "credito", importe: 15000000, detalle: "Aporte social inicial" },
      ],
    },
    {
      tipo: "EGRESO", fecha: "2026-01-10", concepto: "Compra de mercancías a Distribuidora Andina", terceroId: "900654321-9",
      asientos: [
        { codigo: "620505", tipo: "debito", importe: 2000000, terceroId: "900654321-9", detalle: "Compra de mercancías" },
        { codigo: "134505", tipo: "debito", importe: 380000, detalle: "IVA descontable 19%" },
        { codigo: "220505", tipo: "credito", importe: 2310000, terceroId: "900654321-9", detalle: "Proveedor Distribuidora Andina" },
        { codigo: "236530", tipo: "credito", importe: 70000, detalle: "Retefuente 3.5% sobre compras" },
      ],
    },
    {
      tipo: "INGRESO", fecha: "2026-01-15", concepto: "Causación de venta a Carlos Andrés Pérez", terceroId: "123456789",
      asientos: [
        { codigo: "130505", tipo: "debito", importe: 2380000, terceroId: "123456789", detalle: "Factura FC-001" },
        { codigo: "410505", tipo: "credito", importe: 2000000, detalle: "Venta de mercancías" },
        { codigo: "240805", tipo: "credito", importe: 380000, detalle: "IVA generado 19%" },
      ],
    },
    {
      tipo: "DIARIO", fecha: "2026-01-25", concepto: "Pago arrendamiento equipos de cómputo enero",
      asientos: [
        { codigo: "512025", tipo: "debito", importe: 1200000, detalle: "Arrendamiento equipos de cómputo" },
        { codigo: "111005", tipo: "credito", importe: 1200000, detalle: "Pago desde banco" },
      ],
    },
    {
      tipo: "DIARIO", fecha: "2026-01-30", concepto: "Nómina de enero (borrador)", estado: "BORRADOR",
      asientos: [
        { codigo: "510505", tipo: "debito", importe: 4500000, detalle: "Sueldos enero" },
        { codigo: "111005", tipo: "credito", importe: 4500000, detalle: "Pago de nómina" },
      ],
    },
  ];

  const creados = {};
  for (const def of defs) {
    const c = await crearComprobante(mapa, periodoId, idsTerceros, def);
    creados[def.concepto] = c;
  }

  const anulable = listaConcepto(await api("GET", "/api/comprobantes"), "Nota interna de prueba");
  if (anulable && anulable.estado === "CONTABILIZADO") {
    await api("POST", `/api/comprobantes/${anulable.id}/anular`);
    ok(`comprobante "Nota interna de prueba" anulado`);
  } else if (!anulable) {
    const nota = await crearComprobante(mapa, periodoId, idsTerceros, {
      tipo: "DIARIO", fecha: "2026-02-01", concepto: "Nota interna de prueba",
      asientos: [
        { codigo: "111005", tipo: "debito", importe: 100000, detalle: "Nota interna" },
        { codigo: "3105", tipo: "credito", importe: 100000, detalle: "Nota interna" },
      ],
    });
    await api("POST", `/api/comprobantes/${nota.id}/anular`);
    ok(`comprobante "Nota interna de prueba" creado y anulado`);
  } else {
    ok(`comprobante "Nota interna de prueba" ya estaba anulado`);
  }

  return creados;
}

function listaConcepto(lista, concepto) {
  return lista.find((c) => c.concepto === concepto);
}

async function cartera(idsTerceros, comprobantes) {
  const compra = comprobantes["Compra de mercancías a Distribuidora Andina"];
  const venta = comprobantes["Causación de venta a Carlos Andrés Pérez"];

  const estadoPrevisto = {
    "FC-001": "PENDIENTE", "FC-002": "ABONADA", "FC-003": "VENCIDA", "FC-004": "CANCELADA",
    "NP-001": "PENDIENTE", "NP-002": "CANCELADA",
  };

  const docCxC = async (numero, terceroDoc, emision, vencimiento, valor, comprobanteId) => {
    const lista = await api("GET", "/api/cxc");
    const existente = lista.find((d) => d.numeroDocumento === numero);
    if (existente) {
      ok(`CxC ${numero} ya existía (${existente.estado}, saldo ${existente.saldo})`);
      return existente;
    }
    return api("POST", "/api/cxc", {
      terceroId: idsTerceros[terceroDoc], comprobanteId: comprobanteId ?? null,
      numeroDocumento: numero, fechaEmision: emision, fechaVencimiento: vencimiento, valor,
    });
  };

  const docCxP = async (numero, terceroDoc, emision, vencimiento, valor, comprobanteId) => {
    const lista = await api("GET", "/api/cxp");
    const existente = lista.find((d) => d.numeroDocumento === numero);
    if (existente) {
      ok(`CxP ${numero} ya existía (${existente.estado}, saldo ${existente.saldo})`);
      return existente;
    }
    return api("POST", "/api/cxp", {
      terceroId: idsTerceros[terceroDoc], comprobanteId: comprobanteId ?? null,
      numeroDocumento: numero, fechaEmision: emision, fechaVencimiento: vencimiento, valor,
    });
  };

  const abonar = async (ruta, id, valor, formaPago, fecha) => {
    const res = await api("POST", `${ruta}/${id}/recibos`, { valor, formaPago, fecha });
    return res;
  };

  const fc1 = await docCxC("FC-001", "123456789", "2026-07-10", "2026-09-10", 2380000, venta.id);
  if (fc1.estado !== estadoPrevisto["FC-001"]) ok(`CxC FC-001 quedó ${fc1.estado} (se esperaba PENDIENTE — revisar fechas)`);
  ok(`CxC FC-001 para Carlos (${fc1.estado}, saldo ${fc1.saldo})`);

  const fc2 = await docCxC("FC-002", "987654321", "2026-07-20", "2026-10-01", 1500000, null);
  if (fc2.estado === "PENDIENTE") {
    await abonar("/api/cxc", fc2.id, 600000, "TRANSFERENCIA", "2026-07-28");
    ok(`CxC FC-002 abonada (600.000) -> ABONADA`);
  } else {
    ok(`CxC FC-002 ya estaba ${fc2.estado}`);
  }

  const fc3 = await docCxC("FC-003", "800012345", "2026-06-01", "2026-07-15", 800000, null);
  ok(`CxC FC-003 para Juan, vencimiento pasado (${fc3.estado}, saldo ${fc3.saldo})`);

  const fc4 = await docCxC("FC-004", "987654321", "2026-07-01", "2026-09-01", 500000, null);
  if (fc4.estado === "PENDIENTE") {
    await abonar("/api/cxc", fc4.id, 500000, "EFECTIVO", "2026-07-25");
    ok(`CxC FC-004 abonada por el total (500.000) -> CANCELADA`);
  } else {
    ok(`CxC FC-004 ya estaba ${fc4.estado}`);
  }

  const np1 = await docCxP("NP-001", "900654321-9", "2026-07-12", "2026-09-12", 2310000, compra.id);
  ok(`CxP NP-001 para Distribuidora Andina (${np1.estado}, saldo ${np1.saldo})`);

  const np2 = await docCxP("NP-002", "900654321-9", "2026-07-01", "2026-08-20", 900000, null);
  if (np2.estado === "PENDIENTE") {
    await api("POST", `/api/cxp/${np2.id}/pagos`, { valor: 900000, formaPago: "CHEQUE", fecha: "2026-07-22" });
    ok(`CxP NP-002 pagada por el total (900.000) -> CANCELADA`);
  } else {
    ok(`CxP NP-002 ya estaba ${np2.estado}`);
  }
}

async function productos() {
  const lista = await api("GET", "/api/productos");
  let producto = lista.find((p) => p.codigo === "PRD-001");
  if (!producto) {
    producto = await api("POST", "/api/productos", {
      codigo: "PRD-001", nombre: "Laptop HP ProBook", categoria: "Computación", unidad: "und",
    });
    ok(`producto PRD-001 creado (${producto.nombre})`);
  } else {
    ok(`producto PRD-001 ya existía (cantidad ${producto.cantidadActual}, costo ${producto.costoPromedio})`);
  }

  const { movimientos } = await api("GET", `/api/productos/${producto.id}/movimientos`);
  const tiene = (tipo, cantidad) => movimientos.some((m) => m.tipo === tipo && m.cantidad === cantidad);

  if (!tiene("ENTRADA", 10)) {
    await api("POST", `/api/productos/${producto.id}/movimientos`, { tipo: "ENTRADA", cantidad: 10, costoUnitario: 1800000, fecha: "2026-01-08" });
    ok(`PRD-001: entrada 10 @1.800.000`);
  } else {
    ok(`PRD-001: entrada 10 ya registrada`);
  }
  if (!tiene("ENTRADA", 5)) {
    await api("POST", `/api/productos/${producto.id}/movimientos`, { tipo: "ENTRADA", cantidad: 5, costoUnitario: 1900000, fecha: "2026-01-12" });
    ok(`PRD-001: entrada 5 @1.900.000`);
  } else {
    ok(`PRD-001: entrada 5 ya registrada`);
  }
  if (!tiene("SALIDA", 3)) {
    const m3 = await api("POST", `/api/productos/${producto.id}/movimientos`, { tipo: "SALIDA", cantidad: 3, costoUnitario: 0, fecha: "2026-01-20" });
    ok(`PRD-001: salida 3 (costo promedio aplicado ${m3.actualizado.costoPromedio}, stock ${m3.actualizado.cantidadActual})`);
  } else {
    ok(`PRD-001: salida 3 ya registrada`);
  }
}

async function resumen() {
  const [periodos, tercerosLista, comprobantesLista, cxc, cxp, productosLista] = await Promise.all([
    api("GET", "/api/periodos"),
    api("GET", "/api/terceros"),
    api("GET", "/api/comprobantes"),
    api("GET", "/api/cxc"),
    api("GET", "/api/cxp"),
    api("GET", "/api/productos"),
  ]);

  const porEstado = (arr) => arr.reduce((acc, c) => { acc[c.estado] = (acc[c.estado] || 0) + 1; return acc; }, {});

  console.log("\n=== RESUMEN DE DATOS DEMO ===");
  console.log(`Periodos:       ${periodos.length} (${periodos.map((p) => p.nombre).join(", ")})`);
  console.log(`Terceros:       ${tercerosLista.length} (${tercerosLista.map((t) => `${t.tipoDocumento} ${t.documento}`).join(", ")})`);
  console.log(`Comprobantes:   ${comprobantesLista.length} ${JSON.stringify(porEstado(comprobantesLista))}`);
  console.log(`CxC:            ${cxc.length} ${JSON.stringify(porEstado(cxc))}`);
  console.log(`CxP:            ${cxp.length} ${JSON.stringify(porEstado(cxp))}`);
  console.log(`Productos:      ${productosLista.length} (${productosLista.map((p) => `${p.codigo} ${p.nombre} x${p.cantidadActual}`).join(", ")})`);
  console.log("\nAbre http://localhost:3000 e inicia sesión con admin@sistema.local");
}

async function main() {
  await login();
  const mapa = await cuentas();
  await verificarCuentas(mapa);
  const periodoId = await periodo2026();
  const idsTerceros = await terceros();
  const comprobantesDemo = await comprobantes(mapa, periodoId, idsTerceros);
  await cartera(idsTerceros, comprobantesDemo);
  await productos();
  await resumen();
  console.log("\nSeed demo completado.");
}

main().catch((e) => {
  console.error(`\nERROR: ${e.message}`);
  process.exit(1);
});
