import { db, ref, push, onValue, update } from "./firebase.js";

const ADMIN_PIN = "1010";
const adminAcceso = document.getElementById("adminAcceso");
const adminPanel = document.getElementById("adminPanel");
const adminPinInput = document.getElementById("adminPinInput");
const adminPinBtn = document.getElementById("adminPinBtn");
const adminPinMensaje = document.getElementById("adminPinMensaje");
const pacientes = document.getElementById("pacientes");
const pedidos = document.getElementById("pedidos");
const geneticas = document.getElementById("geneticas");
const pacienteGenetica = document.getElementById("pacienteGenetica");

let pacientesRaw = {};

const desbloquearAdmin = () => {
  if (adminPinInput.value.trim() !== ADMIN_PIN) {
    adminPinMensaje.textContent = "Clave incorrecta.";
    return;
  }

  adminAcceso.classList.add("hidden");
  adminPanel.classList.remove("hidden");
};

adminPinBtn.onclick = desbloquearAdmin;
adminPinInput.onkeydown = (event) => {
  if (event.key === "Enter") desbloquearAdmin();
};

const gramos = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatoGramos = (value) => `${Number(value.toFixed(1))}g`;

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const pacienteItems = () =>
  Object.entries(pacientesRaw)
    .map(([pin, paciente]) => ({
      pin,
      nombre: paciente.nombre || "",
      cupo: gramos(paciente.cupo || 20),
      activo: paciente.activo !== false,
    }))
    .filter((paciente) => paciente.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

const normalizarGenetica = (id, value) => {
  if (typeof value === "string") {
    return {
      id,
      nombre: value,
      paciente: "Matias",
      pacientePin: "",
      gramos: 20,
      activa: true,
    };
  }

  return {
    id,
    nombre: value.nombre || value.genetica || "",
    paciente: value.paciente || "Matias",
    pacientePin: value.pacientePin || "",
    gramos: gramos(value.gramos || value.cupo || 0),
    activa: value.activa !== false,
  };
};

document.getElementById("agregarPaciente").onclick = async () => {
  const nombre = document.getElementById("nuevoPaciente").value.trim();
  const pin = document.getElementById("nuevoPin").value.trim();
  const cupo = gramos(document.getElementById("nuevoCupo").value);

  if (!nombre || !/^\d{4}$/.test(pin) || cupo <= 0) {
    alert("Completar nombre, PIN de 4 digitos y cupo");
    return;
  }

  try {
    await update(ref(db, `pacientes/${pin}`), {
      nombre,
      cupo,
      activo: true,
      fecha: new Date().toISOString(),
    });
    document.getElementById("nuevoPaciente").value = "";
    document.getElementById("nuevoPin").value = "";
  } catch (error) {
    console.error("Error al agregar paciente:", error);
    alert("No se pudo agregar el paciente.");
  }
};

document.getElementById("agregarGenetica").onclick = async () => {
  const pin = pacienteGenetica.value;
  const paciente = pacientesRaw[pin];
  const nombre = document.getElementById("nuevaGenetica").value.trim();
  const cantidad = gramos(document.getElementById("gramosGenetica").value);

  if (!pin || !paciente || !nombre || cantidad <= 0) {
    alert("Completar paciente, genetica y gramos");
    return;
  }

  try {
    await push(ref(db, "geneticas"), {
      pacientePin: pin,
      paciente: paciente.nombre,
      nombre,
      gramos: cantidad,
      activa: true,
      fecha: new Date().toISOString(),
    });
    document.getElementById("nuevaGenetica").value = "";
  } catch (error) {
    console.error("Error al agregar genetica:", error);
    alert("No se pudo agregar la genetica.");
  }
};

const confirmarPedido = async (id, pedido) => {
  try {
    await push(ref(db, "entregas"), {
      pacientePin: pedido.pacientePin || "",
      persona: pedido.persona,
      genetica: pedido.genetica,
      gramos: gramos(pedido.gramos),
      fecha: new Date().toISOString(),
      pedidoId: id,
    });

    await update(ref(db, `pedidos/${id}`), {
      estado: "confirmado",
      confirmadoEn: new Date().toISOString(),
    });

    alert("Pedido confirmado como entrega");
  } catch (error) {
    console.error("Error al confirmar pedido:", error);
    alert("No se pudo confirmar el pedido.");
  }
};

onValue(ref(db, "pacientes"), (snap) => {
  pacientesRaw = snap.val() || {};
  const items = pacienteItems();

  pacientes.innerHTML = items.length
    ? items.map((paciente) => `
        <div class="genetica-row">
          <strong>${escapeHtml(paciente.nombre)}</strong>
          <span>PIN ${escapeHtml(paciente.pin)} · ${formatoGramos(paciente.cupo)}</span>
        </div>
      `).join("")
    : `<div class="empty">Todavia no hay pacientes cargados.</div>`;

  pacienteGenetica.innerHTML = items.length
    ? items.map((paciente) => `<option value="${escapeHtml(paciente.pin)}">${escapeHtml(paciente.nombre)} · ${escapeHtml(paciente.pin)}</option>`).join("")
    : `<option value="">Cargar paciente primero</option>`;
});

onValue(ref(db, "pedidos"), (snap) => {
  const data = snap.val() || {};
  const pendientes = Object.entries(data)
    .map(([id, pedido]) => ({
      id,
      ...pedido,
      gramos: gramos(pedido.gramos),
      fechaDate: new Date(pedido.fecha),
    }))
    .filter((pedido) => pedido.estado === "pendiente")
    .sort((a, b) => b.fechaDate - a.fechaDate);

  pedidos.innerHTML = pendientes.length
    ? pendientes.map((pedido) => {
        const fecha = Number.isNaN(pedido.fechaDate.getTime())
          ? "sin fecha"
          : pedido.fechaDate.toLocaleString("es-AR");
        return `
          <article class="pedido-admin">
            <div>
              <strong>${escapeHtml(pedido.persona)}</strong>
              <span>${escapeHtml(pedido.genetica)} · ${formatoGramos(pedido.gramos)}</span>
              <small>${fecha}</small>
            </div>
            <button data-pedido-id="${pedido.id}">Confirmar</button>
          </article>
        `;
      }).join("")
    : `<div class="empty">No hay pedidos pendientes.</div>`;

  pendientes.forEach((pedido) => {
    const boton = document.querySelector(`[data-pedido-id="${pedido.id}"]`);
    if (boton) {
      boton.onclick = () => confirmarPedido(pedido.id, pedido);
    }
  });
});

onValue(ref(db, "geneticas"), (snap) => {
  const data = snap.val() || {};
  const items = Object.entries(data)
    .map(([id, value]) => normalizarGenetica(id, value))
    .filter((genetica) => genetica.nombre)
    .sort((a, b) => a.paciente.localeCompare(b.paciente) || a.nombre.localeCompare(b.nombre));

  geneticas.innerHTML = items.length
    ? items.map((genetica) => `
        <div class="genetica-row">
          <div>
            <strong>${escapeHtml(genetica.nombre)}</strong>
            <span>${escapeHtml(genetica.paciente)} · ${formatoGramos(genetica.gramos)}</span>
          </div>
        </div>
      `).join("")
    : `<div class="empty">Todavia no hay geneticas habilitadas.</div>`;
});
