# Glosario — una palabra para cada cosa

> **Manda sobre cualquier texto nuevo** del proyecto: pantallas, informes,
> mensajes, documentos y nombres internos. Los tests
> `test_textos_paso_rend2.js`, `test_notas_paso_rend3d.js`,
> `test_nombres_paso_rend4.js` y `test_documentos_paso_rend5.py` lo vigilan.

## 1. Las palabras

La columna «Fuera» son las que ya no se usan.

| Cosa | Palabra | Fuera |
|---|---|---|
| Lo que paga un inmueble cada mes | **Rendimiento** | dividendo, renta |
| Sus tres tipos | **Rendimiento reinvertido / reclamado / pendiente** | «Dividendo reinvertido…», «Distribuido, sin reclamar ni reinvertir», «vault / wallet» |
| El `reental_cache.json`, dicho al usuario (en la app y en sus avisos; dentro del código y los documentos técnicos sigue siendo «la cache») | **Tu archivo**. Vive en el navegador: en pantalla es «tu archivo» («N transacciones en tu archivo») o «lo guardado en este navegador» (el pie del menú: «Datos solo en este navegador»); lo que se descarga, **copia** (`reental_cache_AAAA-MM-DD_HHMM.json`) | «cache», «cache de trabajo», «tarjeta 2», «Sin guardar en tu disco» |
| Lo descargado de la blockchain (cada entrada de Etherscan) / cada fila del libro de 📒 y 📊 | **Transacciones** / **Movimientos** (dos cifras distintas, dos palabras) | «movimientos» para lo descargado, «tx» |
| Un rendimiento con parte reinvertida y parte reclamada | **Rendimiento mixto (a revisar)** | «Reparto mixto» |
| Un rendimiento reclamado o reinvertido solo en parte (el resto sigue pendiente) | **Parcial** (estado en 💰 Rendimientos) | «a medias» |
| La moneda de los importes en stablecoin | **USD** (USDT y USDC, 1 a 1) | «USDT» como moneda (sí como nombre del token) |
| El hecho de que Reental lo ponga a tu disposición | **Reparto**; «fecha del reparto» | distribución, devengo, fecha fiscal |
| El archivo que se descarga de Reental | **Archivo de rendimientos de Reental** (`reental_rendimientos.csv`) | CSV de dividendos, CSV de distribuciones |
| Importe antes de quitar nada | **Íntegro** | bruto |
| Lo que Reental ingresa en Hacienda | **Retención** | impuesto retenido, retención IRPF |
| Íntegro menos retención | **Neto** | recibido, lo que llegó |
| Lo que dan los contratos DeFi | **Recompensa DeFi** | reward |
| Tokens comprados cuyo pago la app no encuentra (banco, exchange, otra wallet, o pagados antes y enviados después) | **Compra externa**; su apartado, «💶 Coste de las compras externas» | compra bancaria, compra por banco, compra por transferencia (bancaria) |
| Lo que se compra en Reental | **Inmueble** (su parte, «token del inmueble») | propiedad |
| Año de la declaración | **Ejercicio** | año fiscal |
| Mes al que corresponde un rendimiento | **Periodo** (sin tilde) | período |
| Lo pagado por los tokens que tienes (📊) / esos tokens a 100 € o 100 $ cada uno, según el proyecto (el «Invertido» de la web de Reental) | **Dinero invertido** («coste real» en su detalle) / **Valor nominal** | — |
| Lo que costó algo | **Coste de compra**; en las tablas de ventas, «valor de adquisición», que es la palabra de Renta Web | coste FIFO, coste base |
| Resultado de una venta | **Ganancia o pérdida** («G/P» solo como título de columna) | plusvalía (queda en el glosario del informe, como palabra de Reental) |
| Lo que se paga a la red | **Comisiones de red (gas)** | comisión, gas a secas |
| Dónde se declara algo | **A declarar en: …** | casilla |
| Vender tokens de un inmueble | **Venta** | — |
| Pagar con una moneda virtual o cambiarla por otra | **Permuta** | — |
| Palabra fiscal que cubre ventas y permutas | **Transmisión**, solo en «valor de transmisión» | — |
| Algo que el programa no sabe clasificar | **A revisar** | pendiente de revisión, REVISAR |
| Un cobro sin enlazar con su venta | **Por vincular** | cobro pendiente |

«**Pendiente**», a secas, queda solo para el rendimiento que ni se ha
reclamado ni se ha reinvertido.

**No se tocan:** las columnas del archivo de Reental (`dividend`,
`distributed`, `claimed`…), que son suyas; «vault» y «wallet» cuando
nombran el sitio (no el tipo de rendimiento); y el CHANGELOG, que cuenta
cada versión con las palabras de entonces (§4).

## 2. Cómo se llama cada cosa por dentro

| Qué | Nombre |
|---|---|
| Categoría de un rendimiento | `RENDIMIENTO` |
| Sus tipos (subcategoría) | `RCM_REINVERTIDO`, `RCM_RECLAMADO`, `RCM_PENDIENTE`, `RCM_MIXTO` |
| Concepto fiscal | `RCM_RENDIMIENTO` |
| Venta de tokens de un inmueble | subcategoría `GPP_INMUEBLE` |
| Campos de un registro | `inmueble`, `integro_usdt`, `retencion_usdt`, `fecha_cobro` |
| Fila del archivo de Reental, ya leída | `inmueble`, `periodo_fiscal`, `fecha_reparto` |
| Resumen de cada ejercicio (`resumenFiscalAnual`, `js/21`) | `base_rendimientos_eur` y sus dos hermanas |
| El archivo de Reental | `reental_rendimientos.csv` |
| Funciones | con «rendimiento» e «inmueble»: `cargarCsvRendimientos`… |
| Recompensa DeFi | `REWARD`, `RCM_STAKING`, `base_rewards_eur` (se quedan) |

## 3. Nombres de antes que se siguen entendiendo

Nada de esto se escribe en código o textos nuevos; solo se **lee**.

| Qué | Dónde | Por qué |
|---|---|---|
| Todo lo de dentro de `reental_cache.json`: `catalogo_propiedades`, el campo `propiedad` de cada vínculo de `pagos_diferidos`, la clave `RCM_DIVIDENDO` de `leyenda_casillas` y los textos guardados al aprender un contrato | La cache | La cache no cambia de nombres, para que los archivos de antes sigan sirviendo y lo hecho a mano no corra riesgo. La app traduce al leer |
| `DIVIDENDO`, `RCM_DIVIDENDO`, `RCM_VAULT`, `RCM_WALLET`, `GPP_PROPIEDAD` y los campos `propiedad` y `bruto_usdt` en un ajuste hecho a mano | Tablas `CODIGOS_ANTIGUOS` y `CAMPOS_ANTIGUOS` (`js/02`) | Un ajuste hecho a mano puede llevarlos; valen igual que los nuevos |
| `reental_dividendos.csv` | `rutaRendimientos` (`tests/navegador/linea_base.js`) | Nombre antiguo del archivo de Reental: si no está `reental_rendimientos.csv`, las pruebas leen ese sin quejarse |
| Las columnas del archivo de Reental (`dividend`, `distributed`, `claimed`…) | [`archivo-rendimientos-reental.md`](archivo-rendimientos-reental.md) | Son de Reental |

## 4. Dónde quedan las palabras de antes

No se reescriben: `docs/CHANGELOG.md` (cuenta cada versión con las
palabras de entonces) y los tests, en las listas de palabras que no deben
salir.
