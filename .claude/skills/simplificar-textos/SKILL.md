---
name: simplificar-textos
description: Limpieza y simplificación de los textos de una pestaña de la app Reental (burbujas, textos siempre visibles, avisos, diálogos, placeholders). Úsalo cuando el usuario escriba /simplificar-textos, pida «simplificar», «acortar» o «limpiar» los textos de una pestaña, o al terminar un paso que cambie una pestaña.
---

# Simplificar los textos de una pestaña

Uso: `/simplificar-textos <pestaña>` (p. ej. `/simplificar-textos Revisión`).
Sin pestaña, pregunta cuál.

## Criterio

- **Cortos, neutros y de solo datos.** La burbuja dice el dato, no lo explica.
  Ser más concisos de lo que parece suficiente.
- **Sin explicaciones fiscales** en la app («lo que se declara», «no se resta»,
  «tiene ganancia o pérdida patrimonial», dónde va en la renta…): eso está en
  el glosario y en el informe fiscal.
- **La burbuja de un icono es su nombre** («Mandar a revisar»), sin frase
  detrás. Solo se añade un dato si aporta algo que no se ve (p. ej. «cobrada
  el 19/06/2025»).
- **Sin códigos técnicos** a la vista (GPP_INMUEBLE, NEUTRO…) ni texto que
  repita lo que ya dice la celda o el botón.
- **Sin controles repetidos** (dos botones o filtros que hacen lo mismo).
- **Ayudas solo donde algo no se entiende**, diciendo qué se ve, no qué hacer
  con ello.
- **Sin nombrar el sistema operativo** («en Windows»…).
- Las palabras, las del glosario (`docs/especificaciones/glosario.md`): las
  filas del libro son «movimientos»; números a la española.
- Ejemplos del tono buscado: «Importes en USD (USDT y USDC, 1 a 1) o en € en
  una compra externa. Entre paréntesis () si se aplicó
  retención.» · «Rendimiento íntegro: 10,000000 USD / Retención: 1,900000 USD /
  Neto: 8,100000 USD» · «💶 Compras externas de inmuebles: 100 € por
  token por defecto (se edita en 🔍 Revisión).» · «🔒 Datos solo en este navegador»

## Pasos

1. **Reunir todos los textos** de la pestaña en su módulo `js/NN-*.js` y en su
   sección de `Reental-SPA/index.html`: subtítulos, notas siempre visibles,
   recuentos, burbujas (ⓘ, iconos, cabeceras, `title`), placeholders, tablas
   vacías, diálogos, avisos (`toast`) y mensajes de error que vea el usuario.
   No los comentarios del código. Añadir la línea de esa pestaña en
   📖 Ayuda (`#view-ayuda` de `index.html`) y lo que la ayuda diga de sus
   botones: si ya no es cierto, va en la tabla.
2. **Traérselos al usuario sin tocar nada**, en tablas numeradas agrupadas
   (Siempre visibles · Burbujas · Diálogos y avisos) con tres columnas:
   *Dónde · Texto actual · Propuesta* («igual» si ya está bien, *(quitarlo)*
   si sobra). Al final, una o dos líneas de opinión sincera: cuáles se notan
   más. Esperar su respuesta (puede aprobar todo o cambiar números sueltos).
3. **Aplicar** lo aprobado. Solo en el módulo de esa pestaña (README, «Cómo
   se trabaja»: si hace falta tocar otro, pedir confirmación).
4. **Ajustar tests y arneses** que comprueben los textos viejos
   (`grep` por cada texto en `tests/` y `tests/navegador/`), sin cambiar lo
   que comprueban. Pasar los tests puros y los arneses de esa pestaña.
5. **Cerrar** como un paso más, con lo que pide el README («Cómo se
   trabaja») al cerrar un paso: regresión completa, entrada en
   `docs/CHANGELOG.md`, el ROADMAP al día, commit y push.

Las pestañas nuevas nacen ya con este criterio.
