import { db, ref, onValue } from "./firebase.js";

const DEFAULT_USER = "Matias";
const LIMITE_MENSUAL = 20;

const params = new URLSearchParams(window.location.search);
const USER = params.get("persona") || DEFAULT_USER;

const lista = document.getElementById("lista");
const resumen = document.getElementById("resumen");
const metricas = document.getElementById("metricas");
const entregasResumen = document.getElementById("entregasResumen");
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

const sparkline = (values) => {
  const width = 220;
  const height = 54;
  const max = Math.max(LIMITE_MENSUAL, ...values, 1);
  const points = values.length > 1 ? values : [0, values[0] || 0];
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((value, index) => {
    const x = Number((index * step).toFixed(2));
    const y = Number((height - (value / max) * height).toFixed(2));
    return `${x},${y}`;
  });
  const area = `0,${height} ${coords.join(" ")} ${width},${height}`;

  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolucion mensual acumulada">
      <polygon points="${area}"></polygon>
      <polyline points="${coords.join(" ")}"></polyline>
    </svg>
  `;
};

usuario.textContent = USER;

onValue(ref(db, "entregas"), (snap) => {
  const data = snap.val() || {};
  const now = new Date();
  const mes = now.getMonth();
  const anio = now.getFullYear();

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
  const ultima = entregas[0];
  const delMesAsc = [...delMes].sort((a, b) => a.fechaDate - b.fechaDate);
  let acumulado = 0;
  const tendencia = [0, ...delMesAsc.map((entrega) => {
    acumulado += entrega.gramos;
    return acumulado;
  })];

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

  metricas.innerHTML = `
    <div class="market-header">
      <div>
        <span>Indice mensual</span>
        <strong>${formatoGramos(total)}</strong>
      </div>
      <small>${delMes.length} ${delMes.length === 1 ? "registro" : "registros"}</small>
    </div>
    ${sparkline(tendencia)}
    <div class="market-grid">
      <div>
        <span>Promedio</span>
        <strong>${formatoGramos(promedioEntrega)}</strong>
      </div>
      <div>
        <span>Ultima</span>
        <strong>${ultima ? formatoGramos(ultima.gramos) : "0g"}</strong>
        <small>${ultima ? ultima.fechaDate.toLocaleDateString("es-AR") : "sin registros"}</small>
      </div>
    </div>
  `;

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
});
