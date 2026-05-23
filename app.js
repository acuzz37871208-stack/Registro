import { db, ref, push, onValue } from "./firebase.js";

const DEFAULT_USER = "Matias";
const LIMITE_MENSUAL = 20;
const DEFAULT_GENETICAS = ["Craig"];

const acceso = document.getElementById("acceso");
const panel = document.getElementById("panel");
const pinInput = document.getElementById("pinInput");
const pinBtn = document.getElementById("pinBtn");
const pinMensaje = document.getElementById("pinMensaje");
const lista = document.getElementById("lista");
const resumen = document.getElementById("resumen");
const pedido = document.getElementById("pedido");
const entregasResumen = document.getElementById("entregasResumen");
const usuario = document.getElementById("usuario");
const fill = document.getElementById("fill");

let pacienteActual = null;
let pacientesRaw = {};
let entregasRaw = {};
let pedidosRaw = {};
let geneticasRaw = {};
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

const normalizarGenetica = (value) => {
  if (typeof value === "string") {
    return {
      nombre: value,
      paciente: DEFAULT_USER,
      pacientePin: "",
      gramos: LIMITE_MENSUAL,
      activa: true,
    };
  }

  return {
    nombre: value.nombre || value.genetica || "",
    paciente: value.paciente || DEFAULT_USER,
    pacientePin: value.pacientePin || "",
    gramos: gramos(value.gramos || value.cupo || LIMITE_MENSUAL),
    activa: value.activa !== false,
  };
};

const perteneceAPaciente = (registro) => {
  if (!pacienteActual) return false;
  if (registro.pacientePin) return registro.pacientePin === pacienteActual.pin;
  return normalizar(registro.persona) === normalizar(pacienteActual.nombre);
};

const esDelMes = (registro, mes, anio) =>
  registro.fechaDate.getMonth() === mes && registro.fechaDate.getFullYear() === anio;

const notificarPedido = async (pedido) => {
  try {
    await fetch("/api/notificar-pedido", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
    });
  } catch (error) {
    console.warn("No se pudo enviar la notificacion:", error);
  }
};

const desbloquear = (pin) => {
  const paciente = pacientesRaw[pin];

  if (!/^\d{4}$/.test(pin)) {
    pinMensaje.textContent = "Ingresá una clave de 4 dígitos.";
    return;
  }

  if (!paciente || paciente.activo === false) {
    pinMensaje.textContent = "Clave incorrecta.";
    return;
  }

  pacienteActual = {
    pin,
    nombre: paciente.nombre || DEFAULT_USER,
    cupo: gramos(paciente.cupo || LIMITE_MENSUAL) || LIMITE_MENSUAL,
  };
  usuario.textContent = pacienteActual.nombre;
  acceso.classList.add("hidden");
  panel.classList.remove("hidden");
  render();
};

pinBtn.onclick = () => desbloquear(pinInput.value.trim());
pinInput.onkeydown = (event) => {
  if (event.key === "Enter") desbloquear(pinInput.value.trim());
};

const renderPedido = ({ restantePedido, pendientesDelMes, entregasDelMes }) => {
  const geneticasBase = Object.values(geneticasRaw).length
    ? Object.values(geneticasRaw).map(normalizarGenetica)
    : DEFAULT_GENETICAS.map((nombre) => ({
        nombre,
        paciente: pacienteActual.nombre,
        pacientePin: pacienteActual.pin,
        gramos: pacienteActual.cupo,
        activa: true,
      }));

  const geneticas = geneticasBase
    .filter((genetica) => {
      if (!genetica.activa) return false;
      if (genetica.pacientePin) return genetica.pacientePin === pacienteActual.pin;
      return normalizar(genetica.paciente) === normalizar(pacienteActual.nombre);
    })
    .map((genetica) => {
      const entregado = entregasDelMes
        .filter((entrega) => normalizar(entrega.genetica) === normalizar(genetica.nombre))
        .reduce((sum, entrega) => sum + entrega.gramos, 0);
      const pendiente = pendientesDelMes
        .filter((pedido) => normalizar(pedido.genetica) === normalizar(genetica.nombre))
        .reduce((sum, pedido) => sum + pedido.gramos, 0);
      const usado = entregado + pendiente;
      const disponible = Math.max(0, Math.min(restantePedido, genetica.gramos - usado));

      return {
        ...genetica,
        disponible,
      };
    })
    .filter((genetica) => genetica.disponible > 0);

  const opcionesGenetica = geneticas.map(
    (genetica) => `<option value="${escapeHtml(genetica.nombre)}" data-max="${genetica.disponible}">${escapeHtml(genetica.nombre)} · ${formatoGramos(genetica.disponible)}</option>`
  ).join("");
  const max = Math.max(0, Number((geneticas[0]?.disponible || 0).toFixed(1)));
  const disabled = max <= 0 || pedidoEnCurso ? "disabled" : "";

  pedido.innerHTML = `
    <div class="pedido-header">
      <div>
        <span class="label">Pedido mensual</span>
        <strong>${max > 0 ? `Disponible: ${formatoGramos(restantePedido)}` : "Sin cupo habilitado"}</strong>
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

  const select = document.getElementById("pedidoGenetica");
  const input = document.getElementById("pedidoGramos");
  const boton = document.getElementById("pedidoBtn");
  if (!boton || disabled) return;

  select.onchange = () => {
    const selectedMax = gramos(select.selectedOptions[0]?.dataset.max);
    input.max = selectedMax;
    input.value = Math.min(gramos(input.value), selectedMax) || Math.min(5, selectedMax);
  };

  boton.onclick = async () => {
    const genetica = document.getElementById("pedidoGenetica").value;
    const cantidad = gramos(document.getElementById("pedidoGramos").value);
    const selectedMax = gramos(document.getElementById("pedidoGenetica").selectedOptions[0]?.dataset.max);
    const mensaje = document.getElementById("pedidoMensaje");

    if (!genetica || cantidad <= 0 || cantidad > selectedMax) {
      mensajePedido = `Elegi una cantidad entre 1g y ${formatoGramos(selectedMax)}.`;
      mensaje.textContent = mensajePedido;
      return;
    }

    pedidoEnCurso = true;
    mensajePedido = "";
    render();

    try {
      const nuevoPedido = {
        pacientePin: pacienteActual.pin,
        persona: pacienteActual.nombre,
        genetica,
        gramos: cantidad,
        estado: "pendiente",
        fecha: new Date().toISOString(),
        mes: mesActual(),
        avisoAdmin: "pendiente",
      };

      await push(ref(db, "pedidos"), nuevoPedido);
      await notificarPedido(nuevoPedido);

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
  if (!pacienteActual) return;

  const now = new Date();
  const mes = now.getMonth();
  const anio = now.getFullYear();
  const mesKey = mesActual();
  const limiteMensual = pacienteActual.cupo || LIMITE_MENSUAL;

  const entregas = Object.values(entregasRaw)
    .filter(perteneceAPaciente)
    .map(normalizarEntrega)
    .filter((entrega) => !Number.isNaN(entrega.fechaDate.getTime()))
    .sort((a, b) => b.fechaDate - a.fechaDate);

  const pedidos = Object.values(pedidosRaw)
    .filter(perteneceAPaciente)
    .map(normalizarEntrega)
    .filter((registro) => !Number.isNaN(registro.fechaDate.getTime()));

  const delMes = entregas.filter((entrega) => esDelMes(entrega, mes, anio));
  const pendientesDelMes = pedidos.filter(
    (registro) => registro.estado === "pendiente" && registro.mes === mesKey
  );

  const total = delMes.reduce((sum, entrega) => sum + entrega.gramos, 0);
  const pendiente = pendientesDelMes.reduce((sum, registro) => sum + registro.gramos, 0);
  const comprometido = total + pendiente;
  const restante = Math.max(0, limiteMensual - comprometido);
  const porcentaje = Math.min(100, (comprometido / limiteMensual) * 100);

  let estado = "OK";
  let estadoClass = "ok";
  if (comprometido === limiteMensual) {
    estado = "LIMITE";
    estadoClass = "limite";
  }
  if (comprometido > limiteMensual) {
    estado = "EXCEDIDO";
    estadoClass = "excedido";
  }

  resumen.innerHTML = `
    <div>
      <span class="label">Este mes</span>
      <div class="big">${formatoGramos(comprometido)} / ${limiteMensual}g</div>
      <p>Restante: ${formatoGramos(restante)}</p>
      ${pendiente ? `<p class="muted">Pendiente: ${formatoGramos(pendiente)}</p>` : ""}
    </div>
    <strong class="estado ${estadoClass}">${estado}</strong>
  `;

  renderPedido({ restantePedido: restante, pendientesDelMes, entregasDelMes: delMes });

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
    : `<div class="empty">Todavia no hay entregas para ${escapeHtml(pacienteActual.nombre)}.</div>`;

  fill.style.width = `${porcentaje}%`;
  fill.style.background = comprometido > limiteMensual ? "#ff5c7a" : "#00ffc6";
};

onValue(ref(db, "pacientes"), (snap) => {
  pacientesRaw = snap.val() || {};
});

onValue(ref(db, "entregas"), (snap) => {
  entregasRaw = snap.val() || {};
  render();
});

onValue(ref(db, "pedidos"), (snap) => {
  pedidosRaw = snap.val() || {};
  render();
});

onValue(ref(db, "geneticas"), (snap) => {
  geneticasRaw = snap.val() || {};
  render();
});
