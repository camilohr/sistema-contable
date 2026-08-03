# Manual de usuario

Sistema contable local para contadores. Guía de uso por módulo.

## 1. Acceso

1. Abra el navegador y vaya a `http://<IP-del-servidor>:3000` (o `http://localhost:3000` si usa la máquina del servidor).
2. Ingrese con su correo y contraseña.
3. El sistema muestra el **Dashboard** con los módulos disponibles.

### Roles

| Rol | Permisos |
|---|---|
| **Administrador (ADMIN)** | Todo: editar catálogo, terceros, periodos, comprobantes, cartera, inventario y gestionar usuarios |
| **Contador (CONTADOR)** | Editar catálogo, terceros, periodos, comprobantes, cartera e inventario |
| **Auxiliar (AUXILIAR)** | Solo consulta (ver comprobantes, reportes y estados) |

Los botones de creación/edición solo aparecen si su rol lo permite.

## 2. Catálogo de cuentas (PUC)

- Lista el Plan Único de Cuentas con su código, nombre, naturaleza (débito/crédito) y clasificación.
- **Crear cuenta**: botón *Nueva cuenta*. El código debe seguir la longitud del PUC (1, 2, 4, 6 u 8 dígitos). Las cuentas de 2 dígitos son grupos.
- Las cuentas pueden marcarse como *movimiento* (reciben asientos), *requiere tercero* (exige cliente/proveedor) y activarse/desactivarse.
- **No se puede eliminar** una cuenta que tenga movimientos; se desactiva para conservar el historial.

## 3. Terceros

Registre clientes, proveedores o ambos (tipo CC, NIT, CE o pasaporte).

- **Crear**: botón *Nuevo tercero* — el sistema valida el documento según el tipo.
- **Editar / Desactivar**: conserve el historial; un tercero inactivo no se usa en nuevos documentos.
- Filtros por texto, tipo de tercero y solo activos.

## 4. Periodos contables

- **Nuevo periodo**: nombre y rango de fechas (inicio–fin).
- Un periodo **Abierto** recibe comprobantes; al **Cerrar** ya no se pueden registrar ni modificar movimientos de ese periodo.
- Un periodo con comprobantes **no se elimina**.

> Recomendación: cree un periodo por año contable (p. ej. "Año 2026").

## 5. Comprobantes y asientos

El corazón del sistema. Todo movimiento se registra con **partida doble** (suma de débitos = suma de créditos).

1. **Nuevo comprobante**: elija tipo (diario, ingreso o egreso), fecha, periodo y concepto.
2. Agregue **asientos**: cuenta (solo cuentas de movimiento), tercero (si la cuenta lo requiere), débito y/o crédito.
3. Guarde como **borrador** o **contabilice** directamente.
4. Un comprobante **contabilizado es inmutable**: no se edita ni se borra. Para corregirlo, use **Anular**, que genera un contrasiento y conserva el registro original para auditoría.
5. Los **consecutivos** se asignan por tipo de comprobante, sin saltos.

> Verifique que el total débito coincida con el total crédito antes de contabilizar; el sistema rechaza comprobantes descuadrados.

## 6. Libros y reportes

En *Libros y reportes* encontrará pestañas:

- **Libro diario**: movimientos en orden cronológico.
- **Libro mayor**: saldos por cuenta en el periodo.
- **Balance de comprobación**: débitos, créditos y saldos por cuenta.
- **Balance general**: activo = pasivo + patrimonio; el sistema indica si la ecuación cuadra.
- **Estado de resultados**: ingresos, costos, gastos y utilidad/perdida del periodo.

Estados financieros y libros requieren comprobantes **contabilizados** en el periodo seleccionado.

## 7. Cuentas por cobrar y por pagar (CxC / CxP)

- **Cuentas por cobrar** (clientes) y **Cuentas por pagar** (proveedores) en el menú lateral.
- **Nueva CxC/CxP**: tercero, número de documento, fecha de emisión, vencimiento y valor.
- **Abonar**: abra el documento → *Ver/abonar* → indique valor, forma de pago (efectivo, cheque o transferencia) y fecha. Cada abono genera un recibo (`R-0001`) o pago (`P-0001`).
- **Estados** calculados automáticamente:
  - **Pendiente**: saldo = valor y no ha vencido.
  - **Abonada**: recibió abonos, aún tiene saldo.
  - **Cancelada**: saldo en cero.
  - **Vencida**: pasó la fecha de vencimiento sin cancelarse.
- El sistema **rechaza abonos mayores al saldo** y **no permite eliminar** un documento con abonos.

## 8. Productos e inventario

- **Nuevo producto**: código, nombre, categoría y unidad.
- **Kardex** (botón *Kardex*): registre **entradas y salidas** con cantidad, costo unitario y fecha.
  - En cada entrada el **costo promedio** se recalcula automáticamente.
  - Las salidas toman el costo promedio vigente y **no pueden exceder el stock**.
- Un producto con movimientos **no se elimina**: se desactiva conservando el kardex.
- La lista muestra stock, costo promedio y valor del inventario.

## 9. Cambiar contraseña

En *Cambiar contraseña* ingrese la actual y la nueva (mínimo 8 caracteres).

## 10. Buenas prácticas

- Registre los movimientos **dentro de su periodo** (la fecha del comprobante debe estar entre inicio y fin del periodo abierto).
- Contabilice siempre con soporte documental (factura, recibo, egreso) en el concepto.
- Revise el **balance de comprobación** antes de cerrar el periodo.
- Al final del periodo: genere reportes, **cierre el periodo** y cree el siguiente.
- Realice **respaldos frecuentes** (ver *Manual de operación*).
