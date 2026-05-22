import { db, ref, push, onValue, update } from "./firebase.js";

const pedidos = document.getElementById("pedidos");
const geneticas = document.getElementById("geneticas");

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

document.getElementById("guardar").onclick = async () => {
  const persona = document.getElementById("persona").value.trim();
  const genetica = document.getElementById("genetica").value.trim();
  const cantidad = parseFloat(document.getElementById("gramos").value);

  if (!persona || !genetica || isNaN(cantidad)) {
    alert("Completar datos");
    return;
  }

  try {
    await push(ref(db, "entregas"), {
      persona,
      genetica,
      gramos: cantidad,
      fecha: new Date().toISOString(),
    });

    document.getElementById("persona").value = "";
    document.getElementById("genetica").value = "";
    document.getElementById("gramos").value = "";

    alert("Guardado correctamente");
  } catch (error) {
    console.error("Error al guardar:", error);
    alert("No se pudo guardar. Revisa la consola.");
  }
};

document.getElementById("agregarGenetica").onclick = async () => {
  const nombre = document.getElementById("nuevaGenetica").value.trim();

  if (!nombre) {
    alert("Ingresar genetica");
    return;
  }

  try {
    await push(ref(db, "geneticas"), nombre);
    document.getElementById("nuevaGenetica").value = "";
  } catch (error) {
    console.error("Error al agregar genetica:", error);
    alert("No se pudo agregar la genetica.");
  }
};

const confirmarPedido = async (id, pedido) => {
  try {
    await push(ref(db, "entregas"), {
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
  const items = Object.values(data).sort((a, b) => String(a).localeCompare(String(b)));

  geneticas.innerHTML = items.length
    ? items.map((genetica) => `<div class="tag">${escapeHtml(genetica)}</div>`).join("")
    : `<div class="empty">Todavia no hay geneticas cargadas. Se usa Craig por defecto.</div>`;
});
