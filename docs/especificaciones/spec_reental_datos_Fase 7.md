# Forma de los datos: registros, resúmenes e informe anual

**Versión del formato:** 2.0. Palabras y nombres: [`glosario.md`](glosario.md);
dentro de `reental_cache.json` los nombres de antes no cambian (glosario, §3).

Referencia de los nombres y la forma de lo que calcula la app: los registros
clasificados (`state.registros`), el resumen de cada ejercicio
(`resumenFiscalAnual`, `js/21`) y el informe para la Renta
(`informesRentaAnuales`, `js/22`). Los ejemplos son **inventados**. Los
bloques se describen juntos, como un solo `reental_datos.json`; la app no
genera ese archivo entero.

---

## 1. Estructura general

```
reental_datos.json
├── metadatos               → Objeto
├── libro_diario            → Array de registros (el corazón)
├── catalogo_inmuebles      → Objeto: dirección → metadatos
├── lotes_fifo              → Objeto: activo → posición abierta
├── resumenes_anuales       → Objeto: año → resumen fiscal
├── informes_renta          → Objeto: año → informe para Renta Web (versión 2)
├── serie_saldo_vault       → Array de movimientos del vault
├── tipos_bce               → Array de {fecha, usd_por_eur}
└── leyenda_casillas        → Objeto: código fiscal → info por año
```

---

## 2. `metadatos`

| Campo | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `generado` | string ISO | `"2026-01-15T10:00:00"` | Fecha/hora de generación |
| `wallet` | string hex | `"0x1111aaaa..."` | Wallet (sin checksum) |
| `rango_datos` | objeto | `{"desde":"2024-01-10","hasta":"2025-12-31"}` | Fecha del primer y del último movimiento del libro diario. No es el «datos hasta» del informe |
| `num_registros` | int | `300` | Total de registros en libro_diario |
| `num_revisar` | int | `5` | Registros marcados como REVISAR. Los avisos «a revisar» del informe que no vienen de un registro no cuentan aquí: están en `informes_renta` |
| `serie_bce` | string | `"EXR.D.USD.EUR.SP00.A"` | Serie BCE usada para tipos de cambio |
| `version_contrato` | string | `"2.0"` | Versión del formato |
| `movimientos_vault_ignorados` | int | `0` | Movimientos del vault que no se pudieron interpretar |

---

## 3. `libro_diario` — El corazón

Array de registros clasificados. Cada registro representa un evento on-chain o CSV con su clasificación fiscal.

### 3.1 Campos de cada registro

| Campo | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `clave` | string | `"0xhash::0xcontrato"` | ID único: hash + contrato, ambos lowercase. Un rendimiento del archivo de Reental, tenga hash o no: `"csv::<inmueble y periodo>::<AAAA-MM-DD>"` (columna `dividend` y fecha del reparto, en minúsculas; `::2` si dos filas la repiten) |
| `fecha` | string UTC naive | `"2024-01-10 08:00:00"` | Fecha/hora UTC sin timezone (formato `%Y-%m-%d %H:%M:%S`) |
| `hash` | string hex | `"0xaaaa1111..."` | Hash de la transacción (vacío en un reparto del CSV sin hash; nunca se inventa) |
| `contrato` | string hex | `"0xc2132d05..."` | Dirección del contrato del token (o `""` si no aplica) |
| `token` | string | `"Tether USD"` | Nombre del token (tokenName de Etherscan) |
| `simbolo` | string | `"USDT"` | Símbolo del token (tokenSymbol de Etherscan) |
| `cantidad` | float | `10.0` | Cantidad de tokens transferidos |
| `categoria` | string enum | `"RENDIMIENTO"` | Categoría principal (ver §3.2) |
| `subcategoria` | string enum | `"RCM_REINVERTIDO"` | Subcategoría fiscal (ver §3.3) |
| `inmueble` | string/null | `"Toledo 1"` | Nombre del inmueble (si aplica) |
| `periodo_fiscal` | string/null | `"03/2024 #01"` | Periodo del rendimiento, tal como viene en el archivo de Reental |
| `importe_usdt` | float/null | `8.1` | Importe en USDT: en un rendimiento, lo que se movió on-chain (reinvertido + reclamado; en un reclamado, el **neto**). Los informes enseñan el íntegro, no este campo |
| `integro_usdt` | float | `10.0` | Solo en un RENDIMIENTO del CSV: lo repartido (`distributed`), el íntegro que se declara |
| `retencion_usdt` | float | `1.9` | Solo en un RENDIMIENTO del CSV: lo retenido por Reental (`retained`); 0 si no hay |
| `fecha_cobro` | string/null | `"2024-04-02 10:00:00"` | Solo en un RENDIMIENTO del CSV: fecha de la transferencia casada con la fila, o `null` |
| `coste_eur` | float/null | `50.0` | Coste de adquisición en EUR (compras) |
| `cobrado_eur` | float | `950.0` | Solo en una VENTA de «Es una venta…» cobrada en €: lo cobrado, que es el valor de transmisión tal cual (sin tipo del BCE ni importe en USD) |
| `via_compra` | string/null | `"BANCARIA"` | Método de compra (ver §3.4) |
| `origen` | string hex | `"0x2222bbbb..."` | Dirección de origen (from) |
| `destino` | string hex | `"0x1111aaaa..."` | Dirección de destino (to) |
| `fuente` | string enum | `"ONCHAIN"` / `"CSV_REENTAL"` | Origen del dato |
| `nota` | string | `"sin transferencia descargada para este hash: …"` | Texto explicativo del registro |
| `revisar` | bool | `false` | Si necesita revisión manual |
| `tipo_bce` | float/null | `1.08` | Tipo de cambio EUR/USD usado |
| `importe_eur` | float/null | `7.5` | Importe convertido a EUR |
| `base_imponible_eur` | float/null | `9.26` | Base imponible en EUR (en un rendimiento del archivo de Reental, el íntegro: «Ingresos íntegros») |
| `retencion_eur` | float/null | `0.0` | Retención IRPF en EUR (va aparte, en «Retenciones»; nunca se resta del íntegro) |
| `coste_fifo_eur` | float/null | `50.0` | Coste de compra del lote consumido (orden FIFO) |
| `gp_eur` | float/null | `5.0` | Ganancia/Pérdida patrimonial en EUR |
| `codigo_concepto` | string enum | `"RCM_RENDIMIENTO"` | Código fiscal (ver §3.5) |

### 3.2 `categoria` — Categorías principales

| Valor | Descripción | Ejemplo |
|---|---|---|
| `RENDIMIENTO` | Rendimiento que reparte un inmueble | USDT reinvertido en el vault o reclamado |
| `COMPRA` | Adquisición de tokens (de un inmueble, RNT, etc.) | Compra de tokens de un inmueble |
| `VENTA` | Venta/transmisión de tokens | Burn de tokens de un inmueble |
| `DEPOSITO` | Depósito en un contrato DeFi | Staking de RNT |
| `RETIRADA` | Retirada de un contrato DeFi | Unstake de RNT |
| `MOVIMIENTO` | Transferencia sin efecto fiscal | Transferencia entre wallets propias |
| `COMISION` | Comisión/gas pagado | Gas de transacción |
| `SPAM` | Token spam/airdrop no solicitado | Airdrop de token desconocido |
| `REWARD` | Recompensa DeFi | Recompensas de farming/staking |
| `REVISAR` | No clasificado automáticamente | Requiere intervención manual |

### 3.3 `subcategoria` — Subcategorías fiscales

| Valor | Categoría padre | Descripción |
|---|---|---|
| `RCM_REINVERTIDO` | RENDIMIENTO | «Rendimiento reinvertido» (RCM) |
| `RCM_RECLAMADO` | RENDIMIENTO | «Rendimiento reclamado», a la wallet o al vault (RCM) |
| `RCM_PENDIENTE` | RENDIMIENTO | Distribuido, sin reclamar ni reinvertir (RCM; en el año del reparto con retención 0) |
| `RCM_MIXTO` | RENDIMIENTO | Rendimiento mixto (parte reinvertida y parte reclamada): a revisar, no se declara |
| `RCM_REWARD` | REWARD | Recompensa DeFi (RCM) |
| `COSTE_BASE` | COMPRA | Coste de adquisición (base para GP) |
| `GPP_INMUEBLE` | VENTA | GP por venta de token de un inmueble |
| `GPP_SWAP` | VENTA | GP por swap/permuta de tokens |
| `GPP_RETIRADA` | RETIRADA | GP por retirada con ganancia |
| `GPP_REGALO` | COMPRA | Token recibido como regalo (coste 0) |
| `NEUTRO` | MOVIMIENTO | Sin efecto fiscal |
| `PENDIENTE` | REVISAR | Pendiente de clasificación |

### 3.4 `via_compra` — Método de adquisición

| Valor | Descripción |
|---|---|
| `BANCARIA` | Compra externa: la app no encuentra el pago (inmuebles: 100 € por token por defecto) |
| `ONCHAIN` | Compra on-chain (DEX, etc.) |
| `VAULT` | Adquisición vía reinversión en vault |
| `CANJE` | Canje/swap de otro token |

### 3.5 `codigo_concepto` — Códigos fiscales

| Código | Descripción | Tipo |
|---|---|---|
| `RCM_RENDIMIENTO` | Rendimiento del capital mobiliario: rendimientos de los inmuebles | Ahorro |
| `RCM_STAKING` | Rendimiento del capital mobiliario: recompensas DeFi | Ahorro |
| `GP_CRIPTO` | Ganancia/pérdida: criptomonedas | Ahorro |
| `GP_OTROS_ELEM` | Ganancia/pérdida: otros elementos patrimoniales | Ahorro |
| `GP_BASE_GRAL` | Ganancia/pérdida: base general | General |

---

## 4. `catalogo_inmuebles`

Objeto donde cada clave es una dirección de contrato (lowercase) y el valor son los metadatos del inmueble. En la cache se llama `catalogo_propiedades`.

| Campo | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `nombre_reental` | string/null | `"Toledo 1"` | Nombre que le da el archivo de Reental |
| `nombre_etherscan` | string | `"Toledo 1"` | Nombre del token en Etherscan |
| `simbolo` | string | `"Reental-TOL-1"` | Símbolo del token |
| `via` | string | `"B"` / `"A"` / `"A+B"` | Vía de descubrimiento |
| `primera_aparicion` | string fecha | `"2024-01-10"` | Fecha de primera aparición |
| `estado` | string enum | `"CONFIRMADA"` / `"CANDIDATA"` | Estado de confirmación. `"DESCARTADA"` es de copias viejas: al abrirlas pasa a `spam_usuario.tokens` (spam de todo el token) y queda `"CANDIDATA"` |

Si `nombre_reental` es null, se usa `nombre_etherscan`.

---

## 5. `lotes_fifo`

Objeto donde cada clave es el símbolo del activo y el valor es la posición abierta.

| Campo | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `etiqueta` | string | `"RNT"` | Nombre del activo |
| `cantidad_total` | float | `100.0` | Cantidad total de tokens abiertos |
| `coste_total_eur` | float | `25.0` | Coste total de adquisición en EUR |
| `coste_medio_eur` | float | `0.25` | Coste medio ponderado |
| `lotes` | array | `[...]` | Lotes individuales abiertos |

Cada lote individual:

| Campo | Tipo | Descripción |
|---|---|---|
| `fecha` | string | Fecha de adquisición |
| `cantidad` | float | Cantidad de tokens en el lote |
| `coste_eur` | float | Coste del lote en EUR |
| `via` | string | Método de adquisición |

Activos típicos con posición abierta: RNT, USDT, POL y tokens de inmuebles.

---

## 6. `resumenes_anuales`

Objeto donde cada clave es el año (string) y el valor es el resumen fiscal (`resumenFiscalAnual`, `js/21`).

| Campo | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `base_rendimientos_eur` | float | `30.0` | Base imponible de los rendimientos (íntegro) |
| `base_rendimientos_con_retencion_eur` | float | `10.0` | Parte del íntegro de los rendimientos que lleva retención |
| `base_rendimientos_sin_retencion_eur` | float | `20.0` | Parte que no la lleva; las dos suman `base_rendimientos_eur` |
| `base_rewards_eur` | float | `5.0` | Base imponible de las recompensas DeFi |
| `retenciones_eur` | float | `1.9` | Total retenciones IRPF |
| `gp_positiva_eur` | float | `40.0` | Ganancias patrimoniales positivas |
| `gp_negativa_eur` | float | `-5.0` | Pérdidas patrimoniales |
| `gp_neta_eur` | float | `35.0` | GP neta (positiva - negativa) |
| `gp_otros_elem_eur` | float | `0.0` | GP de otros elementos patrimoniales |
| `gp_base_general_eur` | float | `2.0` | GP integrada en base general |
| `comisiones_gas_pol` | float | `0.5` | Gas pagado en POL |
| `comisiones_gas_eur` | float | `0.4` | Gas convertido a EUR |

---

## 6b. `informes_renta` (versión 2)

Informe de cada año pensado para rellenar Renta Web. Lo monta
`informesRentaAnuales` (`js/22`) con lo que el motor fiscal ya calculó;
🧾 Fiscal, el PDF y el Excel lo leen de aquí **sin recalcular**. Cada clave
es el año (string): los que tienen movimientos, los que quedan sin
movimientos entre ellos y, si al 31/12 del último quedaba cartera, los del
final hasta donde llegan los datos (estos dos sin entrada en
`resumenes_anuales`).

**Palabras:** «rendimiento» (como lo llama Reental), «íntegro», «retención»
y «neto» = íntegro − retención. Sin notas de en qué parte de Renta Web va
cada importe: solo `a_declarar_en` en cada tabla. El glosario y el descargo
siguen las definiciones de la web de Reental (preguntas frecuentes, ayuda y
su glosario), con palabras propias.

**Céntimos:** los importes van redondeados al céntimo. Cada total se suma
con todos los decimales y se redondea al final (los de `resumenes_anuales`,
redondeados). Tres importes se obtienen de otros **ya redondeados**, para
que la cuenta salga al céntimo: el neto (íntegro − retención), la ganancia o
pérdida (valor de transmisión − valor de adquisición) y el desinvertido
(capital inicial + invertido − capital final). Por eso `gp_total` puede
diferir un céntimo de `gp_neta_eur` y la suma a mano de una columna larga,
unos céntimos de su total.

| Campo | Tipo | Descripción |
|---|---|---|
| `version` | int | `2` |
| `ejercicio` | int | Año del informe |
| `cabecera` | objeto | `titular`, `nif` (de la configuración), `wallet`, `periodo_desde` y `periodo_hasta` (siempre 1/1 y 31/12), `anio_terminado` (bool: los datos pasan del 31/12; el mismo 31/12 aún no ha terminado), `datos_hasta` (el día de la ejecución si la descarga de Etherscan fue bien; si falló, o sin ese día, la fecha del último movimiento o cobro, sin las posteriores a hoy), `divisa` (`"EUR"`) y `alcance` (texto). Sin pagador. La fecha de generación está en `metadatos.generado` |
| `resumen` | array | I. Resumen del ejercicio, en filas y solo en euros (ver abajo) |
| `inversiones_activas` | objeto | II. Lo que se conserva a la fecha de corte (ver abajo) |
| `detalle` | objeto | III. Tablas en USD y en euros (ver abajo) |
| `avisos` | array | IV. `{fecha, tipo, concepto, detalle}`; `tipo` = `"revisar"` o `"nota"`. «A revisar»: un registro a revisar (con su motivo) o sin fecha; una fecha o una fecha de cobro posterior a hoy; «otros movimientos» del capital; el vault (sin tipo BCE, USDT sin coste, saldo negativo); la descarga de Etherscan fallida; una diferencia del cuadre con la blockchain (concepto «Cuadre con la blockchain», una por token, en el informe del año de hoy o del último hasta hoy, con `fecha` = el día de la ejecución). Los demás que no son de un registro llevan `fecha` `null`. «Nota»: reclamado sin retención, rendimiento sin fila en el archivo de Reental, gas sin coste, tokens cuyo saldo no se pudo leer en el cuadre |
| `descargo` | string | V. Descargo de responsabilidad |
| `glosario` | array | V. `{termino, definicion}` en llano |
| `nota_metodologica` | array | V. `{titulo, texto}` |
| `nota_centimos` | string | La regla de los céntimos |

**Fila de `resumen`:** `grupo` (título del bloque), `clave` (estable),
`concepto` (texto a mostrar), `importe` (número o `null` si no está
disponible), `unidad` (`"EUR"` o `"POL"`), `nota` (o `null`) y `total`
(bool: fila de total, en negrita). Bloques y claves, en este orden:

| Bloque | Claves |
|---|---|
| 1. Inversiones activas a efectos del Impuesto sobre el Patrimonio | `capital_inicio` (coste de compra de los tokens de inmuebles a 31/12 del año anterior), `invertido` (compras del año, sin canjes), `desinvertido` (coste de compra de lo vendido, sin canjes), `otros_movimientos` (solo si compras y ventas no explican el cambio, p. ej. una venta a revisar sin coste completo) y `capital_final` (a 31/12, o a `datos_hasta` si el año no ha terminado). `capital_inicio + invertido − desinvertido (+ otros_movimientos) = capital_final` al céntimo. Sin la cartera a 31/12 (informes montados sin `cierres`), inicio y final son `null` |
| 2. Rendimientos del capital mobiliario | `rend_inmuebles` (íntegro: reinvertidos, reclamados y pendientes), `rend_defi`, `rend_integro` (total), `rend_retenciones` (aparte, sin restar) y `rend_neto` |
| 3. Ganancias y pérdidas patrimoniales | `gp_inmuebles_transmision`, `gp_inmuebles_adquisicion`, `gp_inmuebles`; `gp_permutas_transmision`, `gp_permutas_adquisicion`, `gp_permutas`; `gp_otros_elementos_transmision` y `gp_otros_elementos_adquisicion` (pools de liquidez, si su resultado lo calculó el programa) y `gp_otros_elementos` (solo si hay pools); `gp_total`; `gp_sin_transmision` (airdrops y regalos, base general, solo si hay) |
| 4. Gastos: comisiones de red (gas) | `gas_pol` (POL) y `gas_eur` (coste de compra del POL; «no restado de ningún importe; consulta si es deducible») |

**`inversiones_activas`:** `fecha_corte` (31/12, o `datos_hasta` si el año
no ha terminado), `anio_terminado`, `nota` (en un año posterior a hoy, lo
dice), `inmuebles` (`{filas, subtotal_eur}`; fila: `activo` (contrato),
`nombre`, `cantidad`, `coste_usd` (lo que costó en dólares; `null` si se
compró por banco), `coste_usd_parcial` (bool: solo una parte se pagó en
dólares) y `coste_eur` (el total, al tipo de cambio del día de cada
compra)), `vault` (`configurado`, `saldo_usd` (USDT a la fecha de corte),
`saldo_eur`, `fecha_tipo_bce` (día del tipo BCE usado: el de corte o el
último publicado antes, como mucho 4 días; 5 si el corte es posterior a lo
descargado del BCE, el día de la sincronización), `nota`, `aviso` (texto
que se pinta junto al saldo, o `null`: sin tipo BCE, USDT sin coste, saldo
negativo) y `usdt_sin_coste` (solo si el vault tiene más USDT de los que
tienen coste); sin vault configurado, saldos `null`; sin tipo BCE,
`saldo_eur` `null`), `otros` (`{filas, subtotal_eur}` con USDT y USDC de la
wallet, lo aportado a pools en su propia fila «… (aportado a pools de
liquidez)», lo que está en otras cuentas tuyas en la suya «… (en otras
cuentas tuyas)», RNT, POL y los demás tokens con coste que no son de
inmuebles, por su símbolo; con los mismos campos de coste) y `total_eur`
(`null` si el vault no pasa a euros). Es **lo que costó** cada activo, no lo
que vale hoy. Sin la cartera a 31/12 (o en un año posterior a hoy),
`inmuebles`, `vault`, `otros` y `total_eur` son `null`.

**`detalle`** (cada tabla lleva `a_declarar_en`, `filas` y `total`; sin
notas al pie):

- `rendimientos`: una sola tabla. Fila: `clave` (la del `libro_diario`),
  `fecha` (del reparto), `inmueble`, `periodo` (p. ej. `"#8/2026"`), `tipo`
  (Rendimiento reinvertido / reclamado / pendiente), `integro_usd`,
  `integro_eur`, `retencion_usd`, `retencion_eur`, `pct_retencion` (`null`
  si no hay retención; calculado, nunca supuesto), `neto_usd` y `neto_eur`.
  Además `subtotal_con_retencion` y `subtotal_sin_retencion` (los mismos
  importes más `repartos`) y `total` (sin %).
- `recompensas`: `clave`, `fecha`, `origen`, `token`, `cantidad`,
  `precio_usd`, `precio_eur`, `importe_usd`, `importe_eur`.
- `ventas_inmuebles` y `permutas`: **una fila por cada fecha de compra**
  (lote FIFO) de la que sale la operación; los lotes del mismo día van
  juntos. Fila: `clave`, `activo`, `operacion` (Venta / Pago de … / Cambio
  por otra moneda / Retirada), `tipo_activo` (Security token / Stablecoin /
  Utility token / Criptomoneda), `fecha_adquisicion`, `adquirido_por_canje`
  (bool: token llegado por un canje de contrato; la fecha es la de la
  compra original), `fecha_transmision`, `cantidad`,
  `valor_adquisicion_usd` (`null` si no se sabe: compra por banco o coste
  puesto a mano en euros), `valor_adquisicion_eur`, `valor_transmision_usd`,
  `valor_transmision_eur` (repartido por cantidad) y `gp_eur` (solo en
  euros). `total`: `operaciones` y los mismos importes. Los canjes de
  contrato no salen: no son una venta.
- `otros_elementos` (pools de liquidez) y `ganancias_sin_transmision`
  (airdrops, regalos), solo si los hay: `clave`, `fecha`, `concepto`,
  `token`, `cantidad`, `importe_usd`, `importe_eur` (la G/P). Los pools
  llevan además `valor_transmision_eur` y `valor_adquisicion_eur` (los de la
  casilla; `null` si el resultado se puso a mano), también en `total`.

Quien lo pinte (🧾 Fiscal, el PDF, el Excel) añade solo cuatro textos fijos
que no van aquí, iguales en todos: la divisa, «Importes en euros…» del
resumen, «Importes en dólares (USD) y en euros (EUR)» del detalle y las
notas del ejercicio en curso, del asterisco del coste en dólares y del
canje.

---

## 7. `serie_saldo_vault`

Array de movimientos del vault, ordenados cronológicamente.

| Campo | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `fecha` | string UTC naive | `"2024-02-01 12:00:00"` | Fecha/hora del movimiento |
| `hash` | string hex | `"0x..."` | Hash de la transacción |
| `entrada_usdt` | float | `1.5` | Entrada (+) o salida (-) de USDT |
| `saldo_usdt` | float | `1.5` | Saldo acumulado tras el movimiento |

---

## 8. `tipos_bce`

Array de tipos de cambio usados: los del libro diario y el del vault de
cada informe anual (`inversiones_activas.vault.fecha_tipo_bce`), por fecha.

| Campo | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `fecha` | string fecha | `"2024-01-10"` | Fecha del tipo |
| `usd_por_eur` | float | `1.08` | Dólares por euro |

---

## 9. `leyenda_casillas`

Objeto donde cada clave es un código fiscal y el valor es un objeto por año.
En la cache, el de los rendimientos lleva su nombre de antes (glosario, §3).

```json
{
  "RCM_RENDIMIENTO": {
    "2025": { "casilla": "0033", "nombre_oficial": "..." }
  },
  "GP_CRIPTO": {
    "2025": { "casilla": "1800", "nombre_oficial": "..." }
  }
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `casilla` | string | Número de casilla del borrador de la renta |
| `nombre_oficial` | string | Nombre oficial de la casilla |

---

## 10. Formatos

- Importes USDT: 6 decimales; EUR: 2; tipos BCE: 4; cantidades de tokens:
  según tokenDecimal (USDT: 6, RNT: 18).
- Fechas del libro diario y del vault: `YYYY-MM-DD HH:MM:SS` (UTC naive);
  las de metadatos y rangos, `YYYY-MM-DD`.
- Muchos campos pueden ser `null` (p. ej. `importe_usdt` en compras).

---

## 11. Ejemplo de registro completo

```json
{
  "clave": "0xaaaa1111...::0xbbbb2222...",
  "fecha": "2024-01-10 08:00:00",
  "hash": "0xaaaa1111...",
  "contrato": "0xbbbb2222...",
  "token": "Visit example.com",
  "simbolo": "Visit example.com to claim reward",
  "cantidad": 1,
  "categoria": "SPAM",
  "subcategoria": "NEUTRO",
  "inmueble": null,
  "periodo_fiscal": null,
  "importe_usdt": null,
  "coste_eur": null,
  "via_compra": null,
  "origen": "0x3333cccc...",
  "destino": "0x1111aaaa...",
  "fuente": "ONCHAIN",
  "nota": "Token spam/airdrop no solicitado",
  "revisar": false,
  "tipo_bce": 1.08,
  "importe_eur": null,
  "base_imponible_eur": null,
  "retencion_eur": null,
  "coste_fifo_eur": null,
  "gp_eur": null,
  "codigo_concepto": null
}
```
