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

Los permisos de contador y auxiliar se asignan **por cliente (empresa)**: un usuario
puede tener roles distintos en empresas distintas, y solo ve las empresas a las que
está asignado. El **Administrador** gestiona todos los clientes y usuarios; ver §13.

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

### Exportación de informes

En la parte superior de cada pestaña hay botones para **exportar** la información:

- **CSV / XLSX**: descarga la tabla del reporte en curso (útil para ajustar, graficar o entregar a un tercero). Respeta los filtros activos (periodo, fechas, cuenta).
- **PDF**: descarga el informe en PDF (libro diario, libro mayor, libro de inventarios, balance general y estado de resultados).
- **Paquete de informes (ZIP)**: un solo clic empaqueta todos los informes del cliente en PDF (libros + estados financieros + indicadores) en un `.zip`. Si hay un periodo seleccionado empaqueta ese periodo; si no, el año en curso. Ideal al cerrar un mes o un año con un cliente.

Todo se genera y descarga localmente; nada se sube a servicios externos.

En la página de **Clientes**, antes de dar de baja un cliente, el sistema ofrece
descargar su **paquete final** (todos los informes de un año o periodo) para conservar
el histórico del cliente fuera del sistema.

## 7. Conciliación bancaria

Permite comparar el **saldo de libros** (asientos de la cuenta de bancos 1110) con el **saldo del extracto** del banco y cruzar los movimientos.

1. En *Conciliación bancaria* seleccione el **periodo** y pulse *Crear conciliación*. El sistema calcula el saldo de libros y toma la cuenta de bancos (1110) por defecto.
2. Descargue el extracto del banco como **CSV** y pulse *Importar extracto (CSV)* eligiendo el archivo.
   - El CSV debe tener columnas de fecha, referencia, descripción y saldo (débito/crédito opcionales). Puede usar `;` o `,` como separador y UTF-8 (con o sin BOM).
   - El sistema valida las filas, las importa (sin duplicar si vuelve a importar el mismo archivo) y las **cruza automáticamente** con los asientos del libro de bancos.
3. Revise el resultado: filas del archivo, importadas, movimientos totales, **conciliados** y la **diferencia** (saldo extracto − saldo libros).
4. Abra el detalle (`Ver`) para revisar cada movimiento y si quedó *Conciliado* o *Pendiente*.
5. Cuando la diferencia sea coherente (partidas en tránsito, cheques sin cobrar, etc.), pulse **Aprobar**. La actividad de conciliación del proceso queda marcada y se registra en la bitácora.
6. **Anular** deja la conciliación anulada (útil si se importó el archivo equivocado).

> Si la diferencia no cuadra, revise los movimientos *Pendientes*: faltan registros en libros o en el extracto.

## 8. Documentos adjuntos

Cada **comprobante** y cada **empresa** admite **soportes adjuntos** (facturas, recibos, contratos, PDF, imágenes, etc.) de hasta 15 MB por archivo.

- En el detalle de un comprobante (botón *Ver*) o en el resumen de la empresa, en *Documentos adjuntos* pulse **Adjuntar archivo**.
- El archivo queda ligado a su entidad, con autor, fecha, tamaño y hash.
- **Descargar** lo trae de vuelta con su nombre original; **Eliminar** lo borra (solo ADMIN/CONTADOR). Eliminar borra también el archivo físico.
- Los adjuntos quedan **incluidos en el respaldo** del sistema (ver *Manual de operación*).

## 9. Cuentas por cobrar y por pagar (CxC / CxP)

- **Cuentas por cobrar** (clientes) y **Cuentas por pagar** (proveedores) en el menú lateral.
- **Nueva CxC/CxP**: tercero, número de documento, fecha de emisión, vencimiento y valor.
- **Abonar**: abra el documento → *Ver/abonar* → indique valor, forma de pago (efectivo, cheque o transferencia) y fecha. Cada abono genera un recibo (`R-0001`) o pago (`P-0001`).
- **Estados** calculados automáticamente:
  - **Pendiente**: saldo = valor y no ha vencido.
  - **Abonada**: recibió abonos, aún tiene saldo.
  - **Cancelada**: saldo en cero.
  - **Vencida**: pasó la fecha de vencimiento sin cancelarse.
- El sistema **rechaza abonos mayores al saldo** y **no permite eliminar** un documento con abonos.

## 10. Productos e inventario

- **Nuevo producto**: código, nombre, categoría y unidad.
- **Kardex** (botón *Kardex*): registre **entradas y salidas** con cantidad, costo unitario y fecha.
  - En cada entrada el **costo promedio** se recalcula automáticamente.
  - Las salidas toman el costo promedio vigente y **no pueden exceder el stock**.
- Un producto con movimientos **no se elimina**: se desactiva conservando el kardex.
- La lista muestra stock, costo promedio y valor del inventario.

## 11. Cambiar contraseña

En *Cambiar contraseña* ingrese la actual y la nueva (mínimo 8 caracteres).

## 13. Usuarios y clientes (solo Administrador)

### Usuarios

Página **Usuarios** (módulo de administración):

- Muestra los usuarios **asignados a la empresa activa** con su rol en esa empresa.
- **Crear usuario**: nombre, correo, contraseña y rol. El nuevo usuario queda asignado
  a la empresa activa. Su primer ingreso exige cambiar la contraseña.
- **Cambiar rol**: selector junto a cada usuario. Un administrador no puede cambiarse
  su propio rol en la empresa activa.
- **Asignar un usuario existente**: el listado de *usuarios disponibles* (no asignados
  a la empresa) permite vincularlos con un rol. Un usuario solo puede estar asignado a
  empresas activas.
- **Retirar**: desvincula al usuario de la empresa. Un administrador no puede retirarse
  a sí mismo de la empresa activa. No se eliminan sus registros de auditoría.

### Clientes

Página **Clientes**: lista todos los clientes (activos e inactivos) con su estado y el
número de usuarios, periodos, procesos y adjuntos de cada uno.

- **Nuevo cliente**: nombre/NIT y fecha de apertura. Se crea junto con su proceso
  contable del año en curso.
- **Editar / Desactivar / Activar**: un cliente **inactivo** no es accesible desde el
  selector de empresa ni se permite operar sobre él.
- **Dar de baja (baja ordenada)**: antes de desactivar, el sistema descarga el
  **paquete final** con todos los informes del cliente. Un cliente con procesos de años
  sin informes generados y un periodo abierto del año en curso se bloquea y pide
  cerrarlos primero.
- **Descargar paquete**: empaqueta los informes del año en curso del cliente.

## 14. Buenas prácticas

- Registre los movimientos **dentro de su periodo** (la fecha del comprobante debe estar entre inicio y fin del periodo abierto).
- Contabilice siempre con soporte documental (factura, recibo, egreso) y **adjúntelo** al comprobante.
- Haga la **conciliación bancaria** de cada mes y apruebe solo cuando la diferencia esté explicada.
- Revise el **balance de comprobación** antes de cerrar el periodo.
- Al final del periodo: genere reportes (use el **paquete ZIP** para entregar "todo" al cliente), **cierre el periodo** y cree el siguiente.
- Realice **respaldos frecuentes** (ver *Manual de operación*).
