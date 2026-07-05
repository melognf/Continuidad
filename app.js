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
    { nombre: "0.591 L", envasesHora: 19200 },
    { nombre: "0.6 L", envasesHora: 19200 },
    { nombre: "0.991 L", envasesHora: 13980 },
    { nombre: "1.5 L", envasesHora: 10800 },
    { nombre: "2.25 L", envasesHora: 9000 }
  ]},
  "LÍNEA 7": { umbral: 60, formatos: [
    { nombre: "1.5 L", envasesHora: 13800 },
    { nombre: "2.25 L", envasesHora: 9000 }
  ]}
};

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

  return { horas, minutos, botellasHechas, cajasHechas, efic, eficLlenadora };
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
    return;
  }

  const r = calcular(s);

  if (r.efic === null || r.minutos < MIN_MINUTOS) {
    box.dataset.estado = "espera";
    icono.textContent = "⏱";
    texto.textContent = "Muy poco tiempo de turno";
    detalle.textContent = "Esperá unos minutos y volvé a cargar";
    return;
  }

  const ok = r.efic >= s.umbral;
  box.dataset.estado = ok ? "ok" : "mal";
  icono.textContent = ok ? "✔" : "✖";
  texto.textContent = ok ? "Línea corriendo con continuidad" : "Línea con necesidades";
  detalle.textContent =
    `Eficiencia ${r.efic}% · umbral ${s.umbral}% · ${r.minutos} min` +
    ` · llenadora ${r.eficLlenadora}% · ${r.cajasHechas.toLocaleString("es-AR")} cajas`;
}

/* ================= Acciones ================= */

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
    ultima: null
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

$("btnCompartir").addEventListener("click", () => {
  const s = cargarEstado();
  if (!s || !s.ultima) return;
  const r = calcular(s);

  let estado;
  if (r.efic === null || r.minutos < MIN_MINUTOS) estado = "Muy poco tiempo de turno";
  else estado = r.efic >= s.umbral ? "LÍNEA CORRIENDO CON CONTINUIDAD ✅" : "LÍNEA CON NECESIDADES ❌";

  const msg = [
    `${s.linea} - ${s.formatoNombre} - ${fmtHora(Date.now())}`,
    estado,
    `Eficiencia: ${r.efic === null ? "-" : r.efic + "%"} (umbral ${s.umbral}%)`,
    `Llenadora: ${r.eficLlenadora === null ? "-" : r.eficLlenadora + "%"}`,
    `Cajas del turno: ${r.cajasHechas}`,
    `Tiempo de turno: ${r.minutos} min`
  ].join("\n");

  window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
});

/* ================= Init ================= */

poblarLineas();
render();
