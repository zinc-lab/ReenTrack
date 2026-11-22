# Solo totales (CSV)

> El archivo de 📤 Exportar → «📄 Solo totales (CSV)»: los totales de tu
> cartera a cada 31/12 y al último día de tus datos, para llevarlos a otra
> hoja o app. Se hace en tu ordenador con el cálculo de 🧾 (sin él no sale y
> se dice por qué) y no sale a internet. Código: `Reental-SPA/js/30-totales.js`.
> Palabras: [`glosario.md`](glosario.md). Los importes del ejemplo son
> **inventados**.

## Formato

- UTF-8 sin BOM, separado por comas, una línea por fila (`\n`), acabado en
  salto de línea. Un texto con coma o comillas va entre comillas (`""`
  dentro); uno que empieza por `=`, `+`, `-` o `@`, con `'` delante (una
  hoja de cálculo lo tomaría por una fórmula).
- Nombre: `reentrack-totales_AAAA-MM-DD.csv`, con el día en que se saca.
- Cabecera:
  `fecha_corte,concepto,inmueble,pais,importe_eur,importe_usd,completo`.
- Fechas `AAAA-MM-DD`; importes con punto decimal, dos decimales y sin
  separador de miles. Un importe que no se sabe va **vacío**, nunca 0.
- Una sola fila por (`fecha_corte`, `concepto`, `inmueble`).

| Columna | Qué |
|---|---|
| `fecha_corte` | El 31/12 de cada ejercicio con informe y, del año en curso, el día hasta el que llegan tus datos (el de 🧾), no el día en que se saca |
| `concepto` | Uno de los de abajo |
| `inmueble` | El nombre del inmueble en las filas `inmueble_…`; vacío en los totales |
| `pais` | El país que apuntes en 🚀 (dos letras), o vacío |
| `importe_eur` | En euros |
| `importe_usd` | En dólares, solo donde la cifra es en dólares (si no, vacío) |
| `completo` | `si` o `no`: `no` si la cifra es incompleta o supuesta (abajo) |

## Conceptos

Todo sale del cálculo de 🧾: el apartado «Inversiones activas» del informe
de cada ejercicio y el resumen del ejercicio. Los dólares pasan a euros con
el tipo del BCE del día de corte o el último anterior, como mucho 4 días
antes (el mismo que el del vault en el informe); si no hay, vacío y `no`.

| Concepto | Qué |
|---|---|
| `coste_compra` | Lo pagado por los tokens de inmuebles que tienes ese día (el «Capital» del informe) |
| `valor_nominal` | Los tokens de inmuebles que tienes × 100 en la moneda del proyecto (€ o $, la de 📊) |
| `saldo_vault` | El saldo del vault (sin vault, vacío) |
| `saldo_wallet` | USDT y USDC en tu wallet |
| `rnt_valor` | Tus RNT × su precio ese día (CoinGecko) |
| `rnt_coste_compra` | Lo pagado por tus RNT |
| `inmueble_coste_compra` | Lo pagado por cada inmueble (una fila por inmueble) |
| `inmueble_valor_nominal` | Sus tokens × 100 en la moneda de su proyecto |
| `rendimientos_integros` | Rendimientos del ejercicio, íntegros |
| `retenciones` | Retenciones del ejercicio |
| `recompensas_defi` | Recompensas DeFi del ejercicio |
| `ganancias_ventas` | Ganancias de las ventas del ejercicio |
| `perdidas_ventas` | Pérdidas de las ventas del ejercicio (en negativo) |
| `ganancias_base_general` | La parte de las ventas que va a la base general |

Los seis del ejercicio, en la fecha del año en curso, son lo que va de año.
`coste_compra` es el subtotal del informe: puede diferir en un céntimo por
inmueble de la suma de sus filas (cada una redondeada). `valor_nominal` es
la suma exacta de sus filas.

## Cuándo va `no`

- Una compra externa sin tu precio (coste supuesto, 100 por token) o, en
  un proyecto en $, un coste en $ incompleto (el «*» del informe): la fila
  de ese inmueble y los totales de coste y valor nominal de esa fecha.
- Tokens sin compras (no se sabe la moneda del proyecto): su valor nominal,
  vacío.
- Algo «A revisar» hasta esa fecha, o un aviso «A revisar» del ejercicio
  (los que 🧾 dice que pueden cambiar sus cifras: una descarga a medias, el
  cuadre con la blockchain…): **todas** las filas de esa fecha (no se sabe
  a qué total afecta).
- Sin tipo del BCE en 4 días: las cifras que pasan de $ a €, vacías.
- Sin precio del RNT ese día: `rnt_valor` vacío. La sincronización pide el
  de cada 31/12 y el del día; el plan gratuito de CoinGecko solo da el
  último año, así que un 31/12 más viejo se queda vacío. El del día no
  existe hasta que empieza en UTC (la 01:00 o las 02:00 en España): si
  sincronizas antes, sale vacío hasta la siguiente sincronización.
- USDT en el vault sin su coste: `saldo_wallet`.
- Un saldo del vault negativo: `saldo_vault`.

## País

Opcional: lo apuntas en 🚀 Puesta en marcha → «🌍 País de cada inmueble»
(dos letras, ES, US…), también para los ya vendidos. La app no lo deduce ni
lo usa en ningún cálculo: solo sale como dato, en la columna `pais` y junto
al nombre del inmueble en 🧾, el informe y el Excel («Casa (US)»). Va en tu
archivo y en la copia.

## Ejemplo

```csv
fecha_corte,concepto,inmueble,pais,importe_eur,importe_usd,completo
2025-12-31,coste_compra,,,800.00,,si
2025-12-31,valor_nominal,,,716.67,,si
2025-12-31,saldo_vault,,,,,no
2025-12-31,saldo_wallet,,,12.50,15.00,si
2025-12-31,rnt_valor,,,8.33,10.00,si
2025-12-31,rnt_coste_compra,,,9.00,,si
2025-12-31,inmueble_coste_compra,"Calle Mayor, 1",ES,300.00,,si
2025-12-31,inmueble_valor_nominal,"Calle Mayor, 1",ES,300.00,,si
2025-12-31,inmueble_coste_compra,Casa,US,500.00,600.00,si
2025-12-31,inmueble_valor_nominal,Casa,US,416.67,500.00,si
2025-12-31,rendimientos_integros,,,40.00,,si
2025-12-31,retenciones,,,0.00,,si
2025-12-31,recompensas_defi,,,0.00,,si
2025-12-31,ganancias_ventas,,,10.00,,si
2025-12-31,perdidas_ventas,,,0.00,,si
2025-12-31,ganancias_base_general,,,0.00,,si
```
