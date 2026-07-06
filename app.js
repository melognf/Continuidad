// app.js — Continuidad de línea de envasado.
// Compara la salida real de la paletizadora (cajas × envases/caja) contra la
// producción teórica a velocidad nominal (envasesHora de FACTORES) en el tiempo
// exacto transcurrido desde el inicio del turno. El veredicto es binario
// (verde/rojo) usando los umbrales de eficiencia por línea de INFORME LOCAL.

// Catálogo importado desde la app FACTORES (formatosPorLinea → envasesHora).
// Umbrales de eficiencia por línea importados desde INFORME LOCAL
// (UMBRAL_EFICIENCIA_POR_LINEA — líneas 5 y 6 excluidas a propósito).
const CATALOGO = {
  "LÍNEA 1": { umbral: 47, formatos: [
    { nombre: "0.3 L", envasesHora: 25200 },
    { nombre: "0.5 L", envasesHora: 25200 },
    { nombre: "0.995 L", envasesHora: 18000 },
    { nombre: "1 L", envasesHora: 18000 },
    { nombre: "1.5 L", envasesHora: 12000 }
  ]},
  "LÍNEA 2": { umbral: 60, formatos: [
    { nombre: "0.220 L", envasesHora: 57000 },
    { nombre: "0.354 L", envasesHora: 57000 },
    { nombre: "0.473 L", envasesHora: 45000 }
  ]},
  "LÍNEA 3": { umbral: 63, formatos: [
    { nombre: "0.3 L", envasesHora: 16980 },
    { nombre: "0.5 L", envasesHora: 19200 },
    { nombre: "0.591 L", envasesHora: 18600 },
    { nombre: "0.6 L", envasesHora: 18600 },
    { nombre: "0.991 L", envasesHora: 13980 },
    { nombre: "1.5 L", envasesHora: 10800 },
    { nombre: "2.25 L", envasesHora: 9000 }
  ]},
  "LÍNEA 7": { umbral: 60, formatos: [
    { nombre: "1.5 L", envasesHora: 13800 },
    { nombre: "2.25 L", envasesHora: 9000 }
  ]}
};

const APP_VERSION = "1.5.2"; // subir en cada cambio funcional
const STORAGE_KEY = "continuidad_turno_v1";
const MIN_MINUTOS = 5; // con menos tiempo de turno el % no es representativo

const $ = id => document.getElementById(id);

/* ================= Estado ================= */

function cargarEstado() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
  catch { return null; }
}

function guardarEstado(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function borrarEstado() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ================= Selects ================= */

function poblarLineas() {
  const sel = $("linea");
  Object.keys(CATALOGO).forEach(nombre => {
    const o = document.createElement("option");
    o.value = nombre;
    o.textContent = nombre;
    sel.appendChild(o);
  });
}

function poblarFormatos() {
  const sel = $("formato");
  sel.innerHTML = '<option value="" selected disabled>Seleccionar formato</option>';
  const linea = CATALOGO[$("linea").value];
  if (!linea) return;
  linea.formatos.forEach((f, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = f.nombre;
    sel.appendChild(o);
  });
  actualizarInfoFormato();
}

function actualizarInfoFormato() {
  const linea = CATALOGO[$("linea").value];
  const f = linea?.formatos[$("formato").value];
  $("info-formato").textContent = f
    ? `Nominal: ${f.envasesHora.toLocaleString("es-AR")} env/h · Umbral eficiencia: ${linea.umbral}%`
    : "La lista cambia según la línea seleccionada.";
}

/* ================= Cálculo ================= */

function numero(valor) {
  const n = parseFloat(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function fmtHora(ts) {
  return new Date(ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function calcular(s) {
  const horas = (s.ultima.ts - s.horaInicio) / 3600000;
  const minutos = Math.round(horas * 60);
  const teorico = s.envasesHora * horas;
  const botellasHechas = Math.max(0, s.ultima.botellas - s.contadorInicialBotellas);
  const cajasHechas = Math.max(0, s.ultima.cajas - s.contadorInicialCajas);
  const envasesSalida = cajasHechas * s.envPorCaja;

  const efic = teorico > 0 ? Math.max(0, Math.round((envasesSalida / teorico) * 100)) : null;
  const eficLlenadora = teorico > 0 ? Math.max(0, Math.round((botellasHechas / teorico) * 100)) : null;

  // Tramo desde la consulta anterior: refleja lo que pasó AHORA, sin que
  // las horas buenas del principio del turno diluyan una parada reciente.
  // Se busca la última lectura previa con al menos MIN_MINUTOS de distancia.
  let tramo = null;
  const previas = (s.lecturas || []).filter(l => s.ultima.ts - l.ts >= MIN_MINUTOS * 60000);
  if (previas.length > 0) {
    const ant = previas[previas.length - 1];
    const tHoras = (s.ultima.ts - ant.ts) / 3600000;
    const tTeorico = s.envasesHora * tHoras;
    const tCajas = Math.max(0, s.ultima.cajas - ant.cajas);
    const tBotellas = Math.max(0, s.ultima.botellas - ant.botellas);
    tramo = {
      minutos: Math.round(tHoras * 60),
      cajas: tCajas,
      efic: tTeorico > 0 ? Math.max(0, Math.round((tCajas * s.envPorCaja / tTeorico) * 100)) : null,
      eficLlenadora: tTeorico > 0 ? Math.max(0, Math.round((tBotellas / tTeorico) * 100)) : null
    };
  }

  return { horas, minutos, botellasHechas, cajasHechas, efic, eficLlenadora, tramo };
}

// El veredicto usa el tramo reciente si existe; si es la primera consulta
// del turno, usa el acumulado.
function eficVeredicto(r) {
  if (r.tramo && r.tramo.efic !== null) return r.tramo.efic;
  return r.efic;
}

// Valores vigentes de salida y llenadora (tramo si existe, sino acumulado).
function eficVigentes(r) {
  if (r.tramo && r.tramo.efic !== null) {
    return { salida: r.tramo.efic, llenadora: r.tramo.eficLlenadora };
  }
  return { salida: r.efic, llenadora: r.eficLlenadora };
}

/* ================= Render ================= */

function render() {
  const s = cargarEstado();
  $("vista-setup").hidden = !!s;
  $("vista-estado").hidden = !s;
  if (!s) return;

  $("turnoLineaFormato").textContent = `${s.linea} · ${s.formatoNombre}`;
  $("turnoInicio").textContent = `Inicio ${fmtHora(s.horaInicio)}`;

  const box = $("veredicto");
  const icono = $("veredictoIcono");
  const texto = $("veredictoTexto");
  const detalle = $("veredictoDetalle");

  if (!s.ultima) {
    box.dataset.estado = "espera";
    icono.textContent = "⏱";
    texto.textContent = "Esperando lectura";
    detalle.textContent = "Cargá los contadores para ver el estado";
    $("campoProblema").hidden = true;
    $("chips").hidden = true;
    return;
  }

  const r = calcular(s);

  if (r.efic === null || r.minutos < MIN_MINUTOS) {
    box.dataset.estado = "espera";
    icono.textContent = "⏱";
    texto.textContent = "Muy poco tiempo de turno";
    detalle.textContent = "Esperá unos minutos y volvé a cargar";
    $("campoProblema").hidden = true;
    $("chips").hidden = true;
    return;
  }

  const eficBase = eficVeredicto(r);
  const ok = eficBase >= s.umbral;
  box.dataset.estado = ok ? "ok" : "mal";
  $("campoProblema").hidden = ok;
  $("problema").value = s.nota || "";
  icono.textContent = ok ? "✔" : "✖";
  texto.textContent = ok ? "Línea corriendo con continuidad" : "Línea con necesidades";

  const v = eficVigentes(r);
  $("chips").hidden = false;
  setChip($("chipLlenadora"), "Llenadora", v.llenadora, s.umbral);
  setChip($("chipSalida"), "Salida", v.salida, s.umbral);

  if (r.tramo && r.tramo.efic !== null) {
    detalle.textContent =
      `Salida últimos ${r.tramo.minutos} min: ${r.tramo.efic}% · umbral ${s.umbral}%` +
      ` · salida turno ${r.efic}% · llenadora ${r.tramo.eficLlenadora}%`;
  } else {
    detalle.textContent =
      `Salida de paletizadora: ${r.efic}% · umbral ${s.umbral}% · ${r.minutos} min` +
      ` · llenadora ${r.eficLlenadora}% · ${r.cajasHechas.toLocaleString("es-AR")} cajas`;
  }
}

/* ================= Acciones ================= */

function setChip(el, label, valor, umbral) {
  el.textContent = `${label} ${valor}%`;
  el.classList.toggle("ok", valor >= umbral);
  el.classList.toggle("mal", valor < umbral);
}

function marcarInvalido(input, esInvalido) {
  input.classList.toggle("invalido", esInvalido);
}

$("linea").addEventListener("change", poblarFormatos);
$("formato").addEventListener("change", actualizarInfoFormato);

$("btnIniciar").addEventListener("click", () => {
  const lineaKey = $("linea").value;
  const formatoIdx = $("formato").value;
  const epc = numero($("envCaja").value);
  const contB = numero($("contBotellas").value);
  const contC = numero($("contCajas").value);

  let falta = false;
  if (!lineaKey || formatoIdx === "") falta = true;
  marcarInvalido($("envCaja"), isNaN(epc) || epc <= 0);
  marcarInvalido($("contBotellas"), isNaN(contB));
  marcarInvalido($("contCajas"), isNaN(contC));
  if (falta || isNaN(epc) || epc <= 0 || isNaN(contB) || isNaN(contC)) return;

  const f = CATALOGO[lineaKey].formatos[formatoIdx];
  guardarEstado({
    linea: lineaKey,
    formatoNombre: f.nombre,
    envasesHora: f.envasesHora,
    umbral: CATALOGO[lineaKey].umbral,
    envPorCaja: epc,
    contadorInicialBotellas: contB,
    contadorInicialCajas: contC,
    horaInicio: Date.now(),
    ultima: null,
    lecturas: []
  });
  render();
});

$("btnCalcular").addEventListener("click", () => {
  const s = cargarEstado();
  if (!s) return;
  const b = numero($("lecturaBotellas").value);
  const c = numero($("lecturaCajas").value);
  marcarInvalido($("lecturaBotellas"), isNaN(b));
  marcarInvalido($("lecturaCajas"), isNaN(c));
  if (isNaN(b) || isNaN(c)) return;

  if (s.ultima) {
    s.lecturas = s.lecturas || [];
    s.lecturas.push(s.ultima);
  }
  s.ultima = { botellas: b, cajas: c, ts: Date.now() };
  guardarEstado(s);
  render();
});

$("btnNuevoTurno").addEventListener("click", () => {
  if (!confirm("¿Cerrar el turno actual y empezar uno nuevo?")) return;
  borrarEstado();
  ["envCaja", "contBotellas", "contCajas", "lecturaBotellas", "lecturaCajas"].forEach(id => {
    $(id).value = "";
  });
  render();
});

$("problema").addEventListener("input", () => {
  const s = cargarEstado();
  if (!s) return;
  s.nota = $("problema").value;
  guardarEstado(s);
});

/* ================= Imagen para compartir ================= */

function partirLineas(ctx, texto, anchoMax) {
  const palabras = texto.split(/\s+/);
  const lineas = [];
  let actual = "";
  palabras.forEach(p => {
    const prueba = actual ? actual + " " + p : p;
    if (ctx.measureText(prueba).width <= anchoMax || !actual) actual = prueba;
    else { lineas.push(actual); actual = p; }
  });
  if (actual) lineas.push(actual);
  return lineas;
}

function generarImagen(s, r, ok, nota) {
  const W = 1080, H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = ok ? "#16a34a" : "#e10600";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.fillRect(0, 0, W, 130);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.font = "700 42px system-ui, Arial";
  ctx.fillText(`${s.linea} · ${s.formatoNombre}`, 48, 82);
  ctx.textAlign = "right";
  ctx.font = "600 36px system-ui, Arial";
  ctx.fillText(`Inicio ${fmtHora(s.horaInicio)} → ${fmtHora(s.ultima.ts)}`, W - 48, 82);

  ctx.textAlign = "center";
  ctx.font = "900 150px system-ui, Arial";
  ctx.fillText(ok ? "✓" : "✕", W / 2, 310);

  ctx.font = "900 78px system-ui, Arial";
  const titulo = ok ? "LÍNEA CORRIENDO CON CONTINUIDAD" : "LÍNEA CON NECESIDADES";
  const lineasTitulo = partirLineas(ctx, titulo, W - 140);
  let y = 430;
  lineasTitulo.forEach(l => { ctx.fillText(l, W / 2, y); y += 92; });

  const v = eficVigentes(r);
  ctx.font = "800 44px system-ui, Arial";
  const chips = [
    { t: `LLENADORA ${v.llenadora}%`, ok: v.llenadora >= s.umbral },
    { t: `SALIDA ${v.salida}%`, ok: v.salida >= s.umbral }
  ];
  const anchos = chips.map(c => ctx.measureText(c.t).width + 70);
  const gapChips = 24;
  let cx = (W - (anchos[0] + anchos[1] + gapChips)) / 2;
  y += 4;
  chips.forEach((c, i) => {
    const wc = anchos[i], hc = 84;
    ctx.fillStyle = "#ffffff";
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(cx, y, wc, hc, 42);
      ctx.fill();
    } else {
      ctx.fillRect(cx, y, wc, hc);
    }
    ctx.fillStyle = c.ok ? "#15803d" : "#b80000";
    ctx.fillText(c.t, cx + wc / 2, y + 58);
    cx += wc + gapChips;
  });
  y += 84 + 50;

  ctx.font = "600 46px system-ui, Arial";
  ctx.font = "600 46px system-ui, Arial";
  ctx.fillStyle = "rgba(255,255,255,.92)";
  const detalles = (r.tramo && r.tramo.efic !== null)
    ? [
        `Salida últimos ${r.tramo.minutos} min: ${r.tramo.efic}% · umbral ${s.umbral}%`,
        `Salida turno completo: ${r.efic}% · ${r.cajasHechas.toLocaleString("es-AR")} cajas`,
        `Llenadora ${r.tramo.eficLlenadora}% · ${r.minutos} min de turno`
      ]
    : [
        `Salida de paletizadora: ${r.efic}% · umbral ${s.umbral}%`,
        `Llenadora ${r.eficLlenadora}% · ${r.cajasHechas.toLocaleString("es-AR")} cajas`,
        `Tiempo de turno: ${r.minutos} min`
      ];
  detalles.forEach(d => { ctx.fillText(d, W / 2, y); y += 62; });

  if (!ok && nota) {
    ctx.font = "600 42px system-ui, Arial";
    const lineasNota = partirLineas(ctx, nota, W - 220);
    const altoCaja = 90 + lineasNota.length * 54;
    const yCaja = Math.min(y + 20, H - altoCaja - 60);

    ctx.fillStyle = "rgba(255,255,255,.96)";
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(70, yCaja, W - 140, altoCaja, 24);
      ctx.fill();
    } else {
      ctx.fillRect(70, yCaja, W - 140, altoCaja);
    }

    ctx.fillStyle = "#991b1b";
    ctx.font = "800 36px system-ui, Arial";
    ctx.fillText("PROBLEMAS", W / 2, yCaja + 56);
    ctx.fillStyle = "#1f2937";
    ctx.font = "600 42px system-ui, Arial";
    let yNota = yCaja + 116;
    lineasNota.forEach(l => { ctx.fillText(l, W / 2, yNota); yNota += 54; });
  }

  return canvas;
}

function mensajeTexto(s, r, ok, nota) {
  const lineas = [
    `${s.linea} - ${s.formatoNombre} - ${fmtHora(Date.now())}`,
    ok ? "LÍNEA CORRIENDO CON CONTINUIDAD ✅" : "LÍNEA CON NECESIDADES ❌"
  ];
  if (r.tramo && r.tramo.efic !== null) {
    lineas.push(`Salida últimos ${r.tramo.minutos} min: ${r.tramo.efic}% (umbral ${s.umbral}%)`);
    lineas.push(`Salida turno completo: ${r.efic}%`);
    lineas.push(`Llenadora últimos ${r.tramo.minutos} min: ${r.tramo.eficLlenadora}%`);
  } else {
    lineas.push(`Salida de paletizadora: ${r.efic}% (umbral ${s.umbral}%)`);
    lineas.push(`Llenadora: ${r.eficLlenadora}%`);
  }
  lineas.push(`Cajas del turno: ${r.cajasHechas}`);
  lineas.push(`Tiempo de turno: ${r.minutos} min`);
  if (!ok && nota) lineas.push(`Problemas: ${nota}`);
  return lineas.join("\n");
}

$("btnCompartir").addEventListener("click", () => {
  const s = cargarEstado();
  if (!s || !s.ultima) return;
  const r = calcular(s);
  if (r.efic === null || r.minutos < MIN_MINUTOS) return;

  const ok = eficVeredicto(r) >= s.umbral;
  const nota = ($("problema").value || "").trim();
  const canvas = generarImagen(s, r, ok, nota);

  canvas.toBlob(async blob => {
    const file = new File([blob], "continuidad.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    // Sin soporte para compartir imagen (ej: PC): texto por WhatsApp Web.
    window.open("https://wa.me/?text=" + encodeURIComponent(mensajeTexto(s, r, ok, nota)), "_blank");
  }, "image/png");
});

/* ================= Init ================= */

const versionEl = document.getElementById("appVersion");
if (versionEl) versionEl.textContent = "Continuidad v" + APP_VERSION;
poblarLineas();
render();
