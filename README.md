# ReenTrack

> **App no oficial, sin relación con Reental.** No es asesoramiento fiscal:
> facilita los datos para la declaración; confírmalos con un asesor.

ReenTrack lee tus transacciones de Reental en Polygon y el
archivo de rendimientos que te da Reental, y los ordena: lo que has invertido,
lo que has cobrado y lo que va en la Renta (IRPF, España).

- **Sin servidor ni cuentas.** Es una página web: todo se guarda solo en tu navegador.
- **Solo Reental.** Lleva tus movimientos de Reental. Otros pools, stakings o
  DeFi ajenos quedan fuera.
- **Para ordenador** (Chrome, Edge o Firefox), no para móvil.

## Cómo se usa

**Abrir la app:** <https://zinc-lab.github.io/ReenTrack/>

**O descargarla** en un solo archivo para abrirla con doble clic, sin internet para
abrirla (sí para actualizar): [ReenTrack.zip](https://zinc-lab.github.io/ReenTrack/ReenTrack.zip).
Cada versión nueva hay que descargarla otra vez.

1. **🚀 Puesta en marcha:** pon tu wallet y tu API key de Etherscan (es gratis);
   la descarga empieza sola.
2. Añade el archivo de rendimientos de Reental (el CSV que descargas de su web).
3. **🔍 Revisión:** resuelve lo que quede por decidir hasta que no haya nada.
4. Ya puedes mirar **📊 Dashboard** y **🧾 Fiscal**.

Para tenerla al día, pulsa «🔄 Actualizar» (transacciones nuevas, tipos de cambio y
precios) y añade el último archivo de rendimientos de Reental.

| Pestaña | Qué tiene |
|---|---|
| 📊 Dashboard | Tu cartera de un vistazo: lo invertido, lo cobrado y los gráficos |
| 📒 Transacciones | Todos tus movimientos, con filtros y notas |
| 💰 Rendimientos | Cada reparto de Reental: lo cobrado, lo retenido y lo pendiente |
| 🧾 Fiscal | Lo que va en tu declaración de la Renta, por ejercicio |
| 📤 Exportar | El Excel con todos tus años, el informe fiscal en PDF e imprimir |
| 🚀 Puesta en marcha | Tus datos, el archivo de Reental y tus copias |
| 🔍 Revisión | Lo que la app no puede decidir sola |

**Tus datos.** Todo se guarda solo en tu navegador. De vez en cuando, pulsa
«🗂️ Guardar copia» en 🚀: si el navegador se borra o cambias de ordenador, la
abres con «📂 Abrir copia». A internet solo salen tus direcciones y tu API key (a
Etherscan) y las consultas de tipos de cambio (al BCE) y de precios (a CoinGecko).

---

## Para desarrolladores y LLM

> **Si eres un LLM o asistente:** lee este archivo entero antes de tocar nada y
> después [`docs/ROADMAP.md`](docs/ROADMAP.md) (estado y siguiente paso). Las
> palabras de la app, los nombres y los documentos siguen el
> [glosario](docs/especificaciones/glosario.md).

### Tecnologías

- **App:** HTML + CSS + JavaScript sin compilación ni más dependencias que
  [driver.js](https://driverjs.com) (MIT), copiado dentro para el ejemplo;
  IndexedDB para guardar los datos de cada uno; gráficos SVG hechos a mano.
- **Pruebas:** Node (la app en una VM), puppeteer-core + Chrome (navegador) y
  Python con `pytest` (documentos; openpyxl y PyMuPDF para leer el Excel y el PDF).

### Carpetas

```
ReenTrack/
├── README.md               ← estás aquí
├── LICENSE                 ← MIT
├── CLAUDE.md               ← para Claude Code: «lee el README»
├── Reental-SPA/            ← la app
│   ├── index.html              estructura y estilos
│   └── js/                     módulos 00–29, cargados en orden (ver abajo)
├── tests/                  ← pruebas
│   ├── test_*.js / *.py        pruebas puras
│   ├── paridad_*.js            comparan las cifras de la app con las aprobadas
│   ├── cifras_referencia/      casos y cifras aprobadas (datos inventados)
│   └── navegador/              arneses de navegador y la regresión
├── docs/
│   ├── ROADMAP.md              estado y siguiente paso
│   ├── CHANGELOG.md            lo que cambia en cada versión
│   └── especificaciones/       glosario, archivo de Reental, forma del informe
├── .claude/skills/         ← /auditar-paso, /orden, /simplificar-textos (Claude Code)
├── .claude/launch.json     ← servidor local en el puerto 8765
├── .githooks/pre-commit    ← la prueba de orden antes de cada commit
├── .github/                ← publica la web y el archivo único con cada cambio en main
└── privado/                🔒 fuera de Git: tus datos de prueba, planes y notas
```

Módulos 00–29 de `js/`: 00 driver.js (copiado tal cual), 01–13 base (constantes, utilidades, configuración, cache,
Etherscan, BCE, CoinGecko, sincronización, archivo de Reental, panel, carga,
inicio), 14 clasificación, 15 🔍 Revisión, 16 📊 Dashboard, 17 💰 Rendimientos,
18 📒 Transacciones, 19 🚀 Puesta en marcha, 20 coste de las compras, 21 motor
fiscal, 22 informe para la Renta, 23 🧾 Fiscal, 24 📤 Exportar, 25 escritor de
.xlsx, 26 hojas del Excel, 27 informe imprimible, 28 cuadre con la blockchain,
29 el ejemplo (recorrido con datos inventados).

### Ejecutar y probar

- **App:** doble clic en `Reental-SPA/index.html`, o un servidor estático en
  esa carpeta (el de `.claude/launch.json` usa el puerto 8765).
- **Pruebas** (desde la raíz):

| Qué | Comando |
|---|---|
| Una prueba pura | `node tests/test_<nombre>.js` |
| Una paridad | `node tests/paridad_<nombre>.js` |
| Ver qué cifras cambian y regrabarlas | `node tests/regrabar_cifras.js [nombre]` (después, con `--grabar`) |
| Documentos | `python -m pytest tests -q` |
| Regresión corta (sin Chrome) | `node tests/navegador/regresion.js corta` |
| Regresión completa | `node tests/navegador/regresion.js` (ver [`tests/navegador/README.md`](tests/navegador/README.md)) |

**Tus propios datos en las pruebas:** las `*_real.js` y parte de las paridades
usan, si existen, `privado/datos_reales/` (`config.json`, `reental_cache.json`,
`reental_cache_prueba.json`, `reental_rendimientos.csv` y sus
`cifras_referencia/`). Sin ellos, esas pruebas salen como «omitidas», no como fallo.

### Cómo se trabaja

1. **Paso a paso:** un paso = un módulo + su prueba. Sin la prueba en verde no se
   avanza. No tocar otros módulos de `js/` sin confirmarlo antes.
2. **Cada cambio:** su prueba y sus arneses; si toca la clasificación, el motor
   fiscal o un módulo que usan otras pestañas, también la regresión corta.
3. **Al cerrar un paso:** `/simplify`, `/auditar-paso`, la regresión completa,
   la fila del CHANGELOG y el ROADMAP al día, y commit.
4. **Cifras de referencia:** las paridades comparan la app con lo que dio la
   última vez que se aprobó. Si un cambio las altera a propósito, se enseña qué
   cambia (`node tests/regrabar_cifras.js <nombre>`) y solo con un sí se regraba.
5. **Nunca datos reales en Git:** wallet, NIF, nombre, importes o hashes propios
   van en `privado/`. La prueba de orden lo vigila antes de cada commit; se
   activa una vez por copia del repo con `git config core.hooksPath .githooks`.

### Reglas que no se tocan

- **No es una guía fiscal.** Rendimientos de inmuebles: capital mobiliario, base
  del ahorro. Ventas de tokens: «otros elementos patrimoniales». Sin consejos por
  país ni por tipo de rendimiento; solo un «confírmalo con un asesor» genérico.
  Única excepción: el aviso de los tokens de inmuebles en 🧾 y en el informe
  (`NOTA_TOKENS_INMUEBLE`), porque no hay criterio claro.
- **Solo Reental.** Lo DeFi ajeno (otros pools o stakings) no se trata.
- **Ventas y cobros:** el destino y la cercanía en el tiempo nunca deciden solos
  que hay una venta; solo un vínculo que confirma quien usa la app. No se marca
  la dirección receptora de Reental, no se fusionan transacciones, no se crean
  hashes artificiales ni se reparte solo entre inmuebles distintos.
- **No tocar `serieSaldoVault`.**
- **La clasificación no valora en euros;** eso lo hace el motor fiscal (`js/21`).
- **Un depósito en stablecoin** cuesta al tipo del BCE del día en que llega.
- **Importes escritos:** el punto solo separa miles («1.250» = 1250, «1.250,75»);
  en otro sitio («1250.75», «1.5») no vale y pide la coma (`ccLeerImporte`, en 🔍
  y en el coste de las compras).
- **Los registros guardados** conservan sus nombres en `snake_case`
  (`importe_usdt`, `fecha_reparto`…). Renombrar o quitar un dato exige leer
  también el formato viejo (los archivos de antes deben dar las mismas cifras).
- **Textos de la app:** cortos, solo datos, sin botones repetidos, sin nombrar el
  sistema operativo. Para acortarlos: `/simplificar-textos`.
- **Para ordenador:** sin ajustes ni pruebas para móvil.

### Dónde va cada cosa

| Si creas… | Va en… |
|---|---|
| Código de la app | `Reental-SPA/` (`index.html` o `js/NN-nombre.js`) |
| Prueba pura o paridad | `tests/test_<tema>_paso_<paso>.js` / `tests/paridad_<tema>_paso_<paso>.js` |
| Arnés de navegador | `tests/navegador/verify<paso>.js` (`_real.js` si usa tus datos) |
| Estado y siguiente paso | `docs/ROADMAP.md` (solo ahí) |
| Lo hecho | `docs/CHANGELOG.md` |
| Especificación de un formato | `docs/especificaciones/` |
| Planes, notas, capturas o evidencias tuyas | `privado/` |

Nada nuevo en la raíz; sin copias «por si acaso» (Git guarda cada versión);
nombres nuevos en `minusculas-con-guiones`.

---

Licencia [MIT](LICENSE): puedes usarlo, cambiarlo y redistribuirlo manteniendo el aviso.
