import { db, ref, onValue } from "./firebase.js";

const DEFAULT_USER = "Matias";
const LIMITE_MENSUAL = 20;

const params = new URLSearchParams(window.location.search);
const USER = params.get("persona") || DEFAULT_USER;

const lista = document.getElementById("lista");
const resumen = document.getElementById("resumen");
const metricas = document.getElementById("metricas");
const usuario = document.getElementById("usuario");
const fill = document.getElementById("fill");

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

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const tarjeta = (label, value, detail = "") => `
  <article class="metric-card">
    <span>${label}</span>
    <strong>${value}</strong>
    ${detail ? `<small>${detail}</small>` : ""}
  </article>
`;

usuario.textContent = USER;

onValue(ref(db, "entregas"), (snap) => {
  const data = snap.val() || {};
  const now = new Date();
  const mes = now.getMonth();
  const anio = now.getFullYear();
  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  const diaActual = now.getDate();

  const entregas = Object.values(data)
    .filter((entrega) => normalizar(entrega.persona) === normalizar(USER))
    .map((entrega) => ({
      ...entrega,
      gramos: gramos(entrega.gramos),
      fechaDate: new Date(entrega.fecha),
    }))
    .filter((entrega) => !Number.isNaN(entrega.fechaDate.getTime()))
    .sort((a, b) => b.fechaDate - a.fechaDate);

  const delMes = entregas.filter((entrega) =>
    entrega.fechaDate.getMonth() === mes &&
    entrega.fechaDate.getFullYear() === anio
  );

  const total = delMes.reduce((sum, entrega) => sum + entrega.gramos, 0);
  const restante = Math.max(0, LIMITE_MENSUAL - total);
  const porcentaje = Math.min(100, (total / LIMITE_MENSUAL) * 100);
  const promedioEntrega = delMes.length ? total / delMes.length : 0;
  const proyeccion = diaActual ? (total / diaActual) * diasDelMes : total;
  const ultima = entregas[0];

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
    </div>
    <strong class="estado ${estadoClass}">${estado}</strong>
  `;

  metricas.innerHTML =
    tarjeta("Entregas del mes", delMes.length, "registros cargados") +
    tarjeta("Promedio", formatoGramos(promedioEntrega), "por entrega") +
    tarjeta("Proyeccion", formatoGramos(proyeccion), "al cierre del mes") +
    tarjeta(
      "Ultima entrega",
      ultima ? formatoGramos(ultima.gramos) : "0g",
      ultima ? ultima.fechaDate.toLocaleDateString("es-AR") : "sin registros"
    );

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
});
