import { db, ref, push, onValue } from "./firebase.js";

const DEFAULT_USER = "Matias";
const LIMITE_MENSUAL = 20;
const GENETICAS = ["Craig"];

const params = new URLSearchParams(window.location.search);
const USER = params.get("persona") || DEFAULT_USER;

const lista = document.getElementById("lista");
const resumen = document.getElementById("resumen");
const pedido = document.getElementById("pedido");
const entregasResumen = document.getElementById("entregasResumen");
const usuario = document.getElementById("usuario");
const fill = document.getElementById("fill");

let entregasRaw = {};
let pedidosRaw = {};
let pedidoEnCurso = false;
let mensajePedido = "";

const normalizar = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const gramos = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatoGramos = (value) => `${Number(value.toFixed(1))}g`;

const mesActual = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const normalizarEntrega = (entrega) => ({
  ...entrega,
  gramos: gramos(entrega.gramos),
  fechaDate: new Date(entrega.fecha),
});

const perteneceAUsuario = (registro) => normalizar(registro.persona) === normalizar(USER);

const esDelMes = (registro, mes, anio) =>
  registro.fechaDate.getMonth() === mes && registro.fechaDate.getFullYear() === anio;

const renderPedido = ({ restantePedido, pendientesDelMes }) => {
  const opcionesGenetica = GENETICAS.map(
    (genetica) => `<option value="${escapeHtml(genetica)}">${escapeHtml(genetica)}</option>`
  ).join("");
  const max = Math.max(0, Number(restantePedido.toFixed(1)));
  const disabled = max <= 0 || pedidoEnCurso ? "disabled" : "";

  pedido.innerHTML = `
    <div class="pedido-header">
      <div>
        <span class="label">Pedido mensual</span>
        <strong>${max > 0 ? `Disponible: ${formatoGramos(max)}` : "Cupo mensual agotado"}</strong>
      </div>
      <small>${pendientesDelMes.length ? `${pendientesDelMes.length} ${pendientesDelMes.length === 1 ? "pendiente" : "pendientes"}` : "sin pendientes"}</small>
    </div>
    <div class="pedido-grid">
      <label>
        Genetica
        <select id="pedidoGenetica" ${disabled}>${opcionesGenetica}</select>
      </label>
      <label>
        Gramos
        <input id="pedidoGramos" type="number" min="1" max="${max}" step="1" value="${max > 0 ? Math.min(5, max) : 0}" ${disabled}>
      </label>
    </div>
    <button id="pedidoBtn" ${disabled}>${pedidoEnCurso ? "Registrando..." : "Pedir"}</button>
    <p id="pedidoMensaje" class="pedido-msg" role="status">${escapeHtml(mensajePedido)}</p>
  `;

  const boton = document.getElementById("pedidoBtn");
  if (!boton || disabled) return;

  boton.onclick = async () => {
    const genetica = document.getElementById("pedidoGenetica").value;
    const cantidad = gramos(document.getElementById("pedidoGramos").value);
    const mensaje = document.getElementById("pedidoMensaje");

    if (!genetica || cantidad <= 0 || cantidad > max) {
      mensajePedido = `Elegi una cantidad entre 1g y ${formatoGramos(max)}.`;
      mensaje.textContent = mensajePedido;
      return;
    }

    pedidoEnCurso = true;
    mensajePedido = "";
    render();

    try {
      await push(ref(db, "pedidos"), {
        persona: USER,
        genetica,
        gramos: cantidad,
        estado: "pendiente",
        fecha: new Date().toISOString(),
        mes: mesActual(),
        avisoAdmin: "pendiente",
      });
      pedidoEnCurso = false;
      mensajePedido = "Pedido registrado. Te aviso cuando este coordinado.";
      render();
    } catch (error) {
      console.error("Error al pedir:", error);
      pedidoEnCurso = false;
      mensajePedido = "No se pudo registrar el pedido. Reintenta en un momento.";
      render();
    }
  };
};

const render = () => {
  const now = new Date();
  const mes = now.getMonth();
  const anio = now.getFullYear();
  const mesKey = mesActual();

  const entregas = Object.values(entregasRaw)
    .filter(perteneceAUsuario)
    .map(normalizarEntrega)
    .filter((entrega) => !Number.isNaN(entrega.fechaDate.getTime()))
    .sort((a, b) => b.fechaDate - a.fechaDate);

  const pedidos = Object.values(pedidosRaw)
    .filter(perteneceAUsuario)
    .map(normalizarEntrega)
    .filter((registro) => !Number.isNaN(registro.fechaDate.getTime()));

  const delMes = entregas.filter((entrega) => esDelMes(entrega, mes, anio));
  const pendientesDelMes = pedidos.filter(
    (registro) => registro.estado === "pendiente" && registro.mes === mesKey
  );

  const total = delMes.reduce((sum, entrega) => sum + entrega.gramos, 0);
  const pendiente = pendientesDelMes.reduce((sum, registro) => sum + registro.gramos, 0);
  const restante = Math.max(0, LIMITE_MENSUAL - total);
  const restantePedido = Math.max(0, LIMITE_MENSUAL - total - pendiente);
  const porcentaje = Math.min(100, (total / LIMITE_MENSUAL) * 100);

  let estado = "OK";
  let estadoClass = "ok";
  if (total === LIMITE_MENSUAL) {
    estado = "LIMITE";
    estadoClass = "limite";
  }
  if (total > LIMITE_MENSUAL) {
    estado = "EXCEDIDO";
    estadoClass = "excedido";
  }

  resumen.innerHTML = `
    <div>
      <span class="label">Este mes</span>
      <div class="big">${formatoGramos(total)} / ${LIMITE_MENSUAL}g</div>
      <p>Restante: ${formatoGramos(restante)}</p>
      ${pendiente ? `<p class="muted">Pendiente: ${formatoGramos(pendiente)}</p>` : ""}
    </div>
    <strong class="estado ${estadoClass}">${estado}</strong>
  `;

  renderPedido({ restantePedido, pendientesDelMes });

  entregasResumen.textContent = entregas.length
    ? `${entregas.length} ${entregas.length === 1 ? "registro" : "registros"}`
    : "sin registros";

  lista.innerHTML = entregas.length
    ? entregas.map((entrega) => {
        const fecha = entrega.fechaDate.toLocaleDateString("es-AR");
        return `
          <div class="item">
            <div>
              <strong>${escapeHtml(entrega.genetica || "Sin genetica")}</strong>
              <span>${fecha}</span>
            </div>
            <b>${formatoGramos(entrega.gramos)}</b>
          </div>
        `;
      }).join("")
    : `<div class="empty">Todavia no hay entregas para ${escapeHtml(USER)}.</div>`;

  fill.style.width = `${porcentaje}%`;
  fill.style.background = total > LIMITE_MENSUAL ? "#ff5c7a" : "#00ffc6";
};

usuario.textContent = USER;

onValue(ref(db, "entregas"), (snap) => {
  entregasRaw = snap.val() || {};
  render();
});

onValue(ref(db, "pedidos"), (snap) => {
  pedidosRaw = snap.val() || {};
  render();
});
