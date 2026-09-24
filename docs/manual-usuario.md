# Manual de usuario

Sistema contable local para contadores. Guía de uso por módulo.

## 1. Acceso

1. Abra el navegador y vaya a `http://<IP-del-servidor>:3000` (o `http://localhost:3000` si usa la máquina del servidor).
2. Ingrese con su correo y contraseña.
3. El sistema abre la empresa seleccionada en su **Resumen del proceso**; desde el menú
   lateral accede a los módulos del ciclo contable.

### Roles

| Rol | Permisos |
|---|---|
| **Administrador (ADMIN)** | Todo: editar catálogo, terceros, periodos, comprobantes, cartera, inventario, nómina, procesos y gestionar usuarios |
| **Contador (CONTADOR)** | Editar catálogo, terceros, periodos, comprobantes, cartera, inventario, nómina y procesos |
| **Auxiliar (AUXILIAR)** | Solo consulta (ver comprobantes, reportes y estados) |

Los botones de creación/edición solo aparecen si su rol lo permite.

Los permisos de contador y auxiliar se asignan **por cliente (empresa)**: un usuario
puede tener roles distintos en empresas distintas, y solo ve las empresas a las que
está asignado. El **Administrador** gestiona todos los clientes y usuarios; ver §21.

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

### Anonimización (derechos ARSO)

Para atender solicitudes de supresión sin borrar el registro contable, el **Administrador** puede anonimizar un tercero:

- Al anonimizar se sustituyen los datos personales (razón social, NIT/documento, contactos, direcciones y notas) por valores genéricos, se marca el tercero como `anonimizado` y se conserva intacto su historial contable (comprobantes, CxC/CxP, movimientos).
- Un tercero anonimizado **no se puede volver a editar**; es una operación definitiva e irreversible desde la interfaz.
- Queda registrada en la auditoría (`ANONIMIZAR_TERCERO`).

> Nota: la anonimización facilita el cumplimiento de derechos ARSO pero no sustituye la autorización ante la SIC/RNBD ni los registros de tratamiento de datos de su despacho.

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

## 11. Activos fijos

- **Nuevo activo**: nombre, cuentas contables (activo — grupo 15, depreciación acumulada — grupo 159, gasto — 516/526), valor, vida útil en meses, valor residual y fecha de adquisición. Las cuentas deben existir, estar activas y ser de movimiento.
- La lista es **paginada** y se puede filtrar por estado: **Activo**, **Depreciado totalmente** y **Dado de baja**; muestra el total y el valor en libros (valor − depreciación acumulada).
- **Depreciar periodo**: seleccione el periodo abierto y el sistema calcula la depreciación por **línea recta** (base = valor − valor residual, cuota mensual = base ÷ vida útil). Genera un comprobante **diario en borrador**; un segundo revisor debe **contabilizarlo**. Si la depreciación acumulada llega a la base, el activo pasa a *Depreciado totalmente*.
- **Recalcular**: si la depreciación del periodo está en borrador, se revierte y se recalcula; si ya está **contabilizada**, primero debe **anular** el comprobante.
- **Dar de baja**: indica periodo abierto, fecha y concepto. El sistema muestra el valor en libros a retirar y genera el comprobante **contabilizado** (débito a la depreciación acumulada y al gasto por valor en libros, crédito a la cuenta del activo). El activo pasa a *Dado de baja*; no se puede dar de baja dos veces.
- **Historial**: por activo, tabla de depreciaciones con acumulado y su comprobante.
- **Editar**: solo permite cambiar el nombre del activo.

## 12. Empleados

Los empleados se toman de los **terceros** con documento de identidad tipo **CC**.

- **Nuevo empleado**: selecciona la persona (solo terceros CC no registrados como empleado), cargo, salario base, fecha de ingreso, ajuste al IBC, % de ARL y si lleva auxilio de transporte manual.
- **Editar**: cargo, salario, IBC, ARL y auxilio manual.
- **Retirar**: indica la fecha de retiro; el empleado **deja de incluirse en las liquidaciones de nómina** pero conserva su historial.
- **Historial de liquidaciones**: desde el listado, ver todas las nóminas en que participó cada empleado.
- Filtro *Solo activos* para ocultar los retirados.

## 13. Nómina

Proceso en **dos pasos**: se liquida, se revisa y luego se **contabiliza** (la contabilización y la provisión generan comprobante que otro usuario aprueba).

1. **Liquidación de periodo** (solo periodo **abierto**): pulse *Liquidar* y ajuste por empleado — días (por defecto 30), horas extras, comisiones, bonificaciones, otros devengados, retefuente, libranzas, embargos y otros descuentos.
   - El sistema calcula: sueldo por días trabajados, IBC (con tope en salarios mínimos), auxilio de transporte, aportes de salud y pensión del empleado, solidaridad pensional (cuando aplica) y el **neto a pagar**.
   - Los aportes patronales (salud, pensión, ARL, caja de compensación, y en su caso ICBF/SENA según el número de empleados) se suman al costo del periodo.
2. **Contabilizar**: genera el comprobante **diario contabilizado** con asientos agregados por concepto, según el mapeo de cuentas de los parámetros de nómina (§14).
3. **Provisionar prestaciones**: calcula cesantías, intereses a las cesantías, prima y vacaciones sobre la nómina **contabilizada** y deja el comprobante en **borrador**; un segundo revisor lo **contabiliza**.
4. **Consultar**: en *Consultar nómina y provisión por periodo* se ven las líneas de liquidación, la provisión con su asiento y el estado de cada comprobante.

> Si reliquida un periodo cuya nómina ya está **contabilizada**, el sistema lo rechaza: primero debe **anular** el comprobante. Una línea de liquidación **anulada** obliga a reliquidar.

## 14. Parámetros de nómina

- **Parámetros por año**: montos y porcentajes legales — SMMLV, auxilio de transporte, tope del auxilio y del IBC en salarios mínimos, % de salud y pensión (empleado y empleador), % ARL, % caja de compensación, % ICBF, % SENA, número de empleados para pago de parafiscales, umbral de solidaridad pensional y % anual de intereses a las cesantías.
  - Si la empresa no tiene parámetros propios para el año, se usan los **globales**.
- **Mapeo de cuentas contables (PUC)**: asigna la cuenta de débito/crédito a cada concepto de nómina (sueldo, extras, aportes, neto por pagar, provisión, etc.). Las cuentas deben existir, estar activas y permitir movimiento.
- El campo ARL admite un porcentaje diferente por empleado (ver §12).

## 15. Presupuesto

- **Cargar presupuesto por periodo**: seleccione el periodo y agregue partidas buscando la cuenta por código o nombre (resultados limitados) con su **valor presupuestado**. Al **guardar**, el sistema reemplaza el presupuesto completo del periodo (una lista vacía lo borra).
- **Ejecución presupuestal**: para un periodo, muestra **presupuestado vs. ejecutado** (saldos de comprobantes contabilizados y anulados), la variación y el **% de ejecución**, con el detalle por cuenta.
- Al guardar el presupuesto se marca automáticamente la actividad *Presupuesto* del proceso contable del año (§19).

## 16. Provisión de cartera (deterioro)

- **Parámetros (días de mora)**: rangos de `días desde`/`días hasta`/`porcentaje` de provisión. No pueden solaparse ni duplicarse; solo el último rango puede quedar sin límite superior. Se guardan por empresa (o se usan los globales).
- **Calcular provisión**: seleccione el periodo **abierto**. El sistema toma las cuentas por cobrar con saldo y mora, calcula `saldo × %`, la compara contra el saldo acumulado de la cuenta **1399** (provisión) y genera si hace falta un comprobante **diario en borrador** que **débita 5199** (gasto) y acredita 1399 (o la reversión si la provisión requerida es menor). Un segundo revisor lo **contabiliza**.
- Si la provisión requerida ya está cubierta (incremento = 0), no genera comprobante.
- **Recalcular**: si el comprobante de provisión del periodo está en borrador se revierte y recalcula; si está **contabilizado**, debe **anularlo** primero (un comprobante anulado queda como pista).
- Las cuentas 1399 y 5199 deben existir (propias de la empresa o del catálogo PUC), estar activas y permitir movimiento.

## 17. Cierre anual

Operación **solo del Administrador**, se ejecuta **una vez por año** (sobre el año que se indica) y requiere que **todos los periodos** de ese año estén **cerrados**.

1. Elija el **año a cerrar** y la **cuenta de utilidades** (clase 3); por defecto usa `3605 - Utilidad del ejercicio`.
2. El sistema cancela las cuentas de resultado (clases 4, 5, 6 y 7) con saldo y lleva la diferencia contra la cuenta de utilidades (o de pérdida del ejercicio).
3. El comprobante de cierre se crea como **diario contabilizado** en el último periodo del año.
4. Al cerrar, el **proceso contable** del año pasa a estado **CERRADO** (§19) y la actividad de cierre se marca automáticamente.

En *Cierre anual* encontrará el listado de **años cerrados** (con su comprobante y consecutivo) y podrá **ver el asiento** de cada cierre.

## 18. Indicadores

- **Indicadores del periodo**: elija el periodo y *Calcular* para ver seis razones con su fórmula y los **datos base** (activos y pasivos corrientes y no corrientes, patrimonio, inventario, cartera, ingresos, ventas, costo de ventas, gastos y utilidad neta).
  - **Razón corriente** y **prueba ácida** (liquidez), **endeudamiento**, **margen neto**, **rotación de cartera** y **rotación de inventario**. Si un denominador es cero, la razón se muestra vacía.
- **Comparativo entre periodos**: seleccione *desde*/*hasta* y vea las razones de ambos periodos con su **variación %**, el **análisis vertical** (participación de cada cuenta sobre su sección del balance/estado de resultados) y el **análisis horizontal** (variación por cuenta).
- **Exportar**: los indicadores se descargan en **PDF, CSV o XLSX** desde la misma página.
- Los cálculos usan solo comprobantes **contabilizados** y **anulados** del periodo.

## 19. Procesos y seguimiento

Organiza el ciclo contable anual de cada cliente con un **checklist** y notas de seguimiento.

- **Crear proceso**: un proceso por empresa y año (si existe, el sistema lo rechaza). Al crearlo se genera la plantilla de **7 actividades**: comprobantes, conciliación, nómina, provisión de cartera, presupuesto, cierre de periodo y cierre de año.
- **Avance y semáforo**: cada proceso muestra su barra de avance (actividades completadas / total) y un semáforo en el listado. Cada actividad puede **completarse o desmarcarse** y tiene fechas esperada y real.
- **Estados**: sin iniciar, en proceso, pendiente, al día o cerrado (el cierre anual pone el proceso en **CERRADO**).
- **Notas**: agregue notas de seguimiento con autor y fecha.
- **Integración automática**: cuando otro módulo ejecuta su operación (presupuesto, nómina, provisión de cartera, cierre de año, conciliación), la actividad correspondiente se **marca sola** y la marca se revierte si la operación se revierte.
- **Resumen y cartera de clientes**: la página *Resumen* de cada empresa muestra su proceso y el semáforo de la cartera de todos sus clientes.
- **Eliminar**: solo el Administrador, con confirmación.

## 20. Cambiar contraseña

En *Cambiar contraseña* ingrese la actual y la nueva. La nueva contraseña debe
tener **mínimo 8 caracteres**, e incluir **letras y al menos un número**.

## 21. Usuarios y clientes (solo Administrador)

### Usuarios

Página **Usuarios** (módulo de administración):

- Muestra los usuarios **asignados a la empresa activa** con su rol en esa empresa.
- **Crear usuario**: nombre, correo, contraseña y rol. La contraseña debe tener
  **mínimo 8 caracteres**, con **letras y al menos un número**. El nuevo usuario queda
  asignado
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

## 22. Buenas prácticas

- Registre los movimientos **dentro de su periodo** (la fecha del comprobante debe estar entre inicio y fin del periodo abierto).
- Contabilice siempre con soporte documental (factura, recibo, egreso) y **adjúntelo** al comprobante.
- Haga la **conciliación bancaria** de cada mes y apruebe solo cuando la diferencia esté explicada.
- Revise el **balance de comprobación** antes de cerrar el periodo.
- Al final del periodo: genere reportes (use el **paquete ZIP** para entregar "todo" al cliente), **cierre el periodo** y cree el siguiente.
- Registre **nómina, provisión de cartera y depreciación** a tiempo y contabilice sus comprobantes en borrador lo antes posible (un segundo revisor los aprueba).
- Use **Procesos** para no perder actividades pendientes de cada cliente (§19).
- Realice **respaldos frecuentes** (ver *Manual de operación*).