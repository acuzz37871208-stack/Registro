const crypto = require("crypto");

const DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL || "https://reprocann-fd0bb-default-rtdb.firebaseio.com";
const ADMIN_PIN = process.env.REPROCANN_ADMIN_PIN || "1010";

let cachedToken = null;

const json = (res, status, body) => res.status(status).json(body);

const b64url = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const serviceAccount = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (error) {
      const configError = new Error("FIREBASE_SERVICE_ACCOUNT_JSON no es un JSON valido");
      configError.statusCode = 500;
      throw configError;
    }
  }

  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  return null;
};

const getAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const account = serviceAccount();
  if (!account?.client_email || !account?.private_key) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: account.client_email,
      sub: account.client_email,
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(account.private_key);
  const assertion = `${unsigned}.${b64url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const error = new Error(`Firebase auth failed: ${response.status}`);
    error.statusCode = 500;
    throw error;
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
};

const dbRequest = async (path, options = {}) => {
  const token = await getAccessToken();
  const legacyAuth = process.env.FIREBASE_DATABASE_AUTH;

  const authParam = token
    ? `access_token=${encodeURIComponent(token)}`
    : legacyAuth
      ? `auth=${encodeURIComponent(legacyAuth)}`
      : "";
  const url = `${DATABASE_URL.replace(/\/$/, "")}/${path}.json${authParam ? `?${authParam}` : ""}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Firebase ${options.method || "GET"} ${path} failed: ${response.status} ${text}`);
    error.statusCode = response.status === 401 || response.status === 403 ? 403 : 500;
    throw error;
  }

  return response.json();
};

const gramos = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const normalizar = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const mesActual = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const esDelMesActual = (fecha) => {
  const date = new Date(fecha);
  const now = new Date();
  return (
    !Number.isNaN(date.getTime()) &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
};

const validarPin = (pin) => /^\d{4}$/.test(String(pin || ""));

const requireAdmin = (pin) => {
  if (String(pin || "").trim() !== ADMIN_PIN) {
    const error = new Error("Admin PIN invalido");
    error.statusCode = 401;
    throw error;
  }
};

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
    nombre: value?.nombre || value?.genetica || "",
    paciente: value?.paciente || "Matias",
    pacientePin: value?.pacientePin || "",
    gramos: gramos(value?.gramos || value?.cupo || 0),
    activa: value?.activa !== false,
  };
};

const perteneceAPaciente = (registro, paciente) => {
  if (registro?.pacientePin) return registro.pacientePin === paciente.pin;
  return normalizar(registro?.persona) === normalizar(paciente.nombre);
};

const loadSnapshot = async () => {
  const [pacientes, entregas, pedidos, geneticas] = await Promise.all([
    dbRequest("pacientes"),
    dbRequest("entregas"),
    dbRequest("pedidos"),
    dbRequest("geneticas"),
  ]);

  return {
    pacientes: pacientes || {},
    entregas: entregas || {},
    pedidos: pedidos || {},
    geneticas: geneticas || {},
  };
};

const patientPayload = async (pin) => {
  if (!validarPin(pin)) {
    const error = new Error("PIN invalido");
    error.statusCode = 400;
    throw error;
  }

  const snapshot = await loadSnapshot();
  const pacienteData = snapshot.pacientes[pin];
  if (!pacienteData || pacienteData.activo === false) {
    const error = new Error("Clave incorrecta");
    error.statusCode = 401;
    throw error;
  }

  const paciente = {
    pin,
    nombre: pacienteData.nombre || "Matias",
    cupo: gramos(pacienteData.cupo || 20) || 20,
  };

  const entregas = Object.fromEntries(
    Object.entries(snapshot.entregas).filter(([, entrega]) => perteneceAPaciente(entrega, paciente))
  );
  const pedidos = Object.fromEntries(
    Object.entries(snapshot.pedidos).filter(([, pedido]) => perteneceAPaciente(pedido, paciente))
  );
  const geneticas = Object.fromEntries(
    Object.entries(snapshot.geneticas).filter(([, value]) => {
      const genetica = normalizarGenetica("", value);
      if (!genetica.activa) return false;
      if (genetica.pacientePin) return genetica.pacientePin === pin;
      return normalizar(genetica.paciente) === normalizar(paciente.nombre);
    })
  );

  return { paciente, entregas, pedidos, geneticas };
};

const assertOrderAvailable = async ({ pin, genetica, cantidad }) => {
  const payload = await patientPayload(pin);
  const mes = mesActual();
  const cupo = payload.paciente.cupo;
  const nombreGenetica = normalizar(genetica);

  const entregasDelMes = Object.values(payload.entregas).filter((entrega) => esDelMesActual(entrega.fecha));
  const pedidosPendientesDelMes = Object.values(payload.pedidos).filter(
    (pedido) => pedido.estado === "pendiente" && pedido.mes === mes
  );
  const entregadoTotal = entregasDelMes.reduce((sum, entrega) => sum + gramos(entrega.gramos), 0);
  const pendienteTotal = pedidosPendientesDelMes.reduce((sum, pedido) => sum + gramos(pedido.gramos), 0);
  const entregadoGenetica = entregasDelMes
    .filter((entrega) => normalizar(entrega.genetica) === nombreGenetica)
    .reduce((sum, entrega) => sum + gramos(entrega.gramos), 0);
  const pendienteGenetica = pedidosPendientesDelMes
    .filter((pedido) => normalizar(pedido.genetica) === nombreGenetica)
    .reduce((sum, pedido) => sum + gramos(pedido.gramos), 0);
  const geneticas = Object.values(payload.geneticas).map((value) => normalizarGenetica("", value));
  const geneticaActiva = geneticas.length
    ? geneticas.find((item) => normalizar(item.nombre) === nombreGenetica && item.activa !== false)
    : { nombre: genetica, gramos: cupo, activa: true };
  const limiteGenetica = geneticaActiva ? geneticaActiva.gramos : cupo;
  const disponibleTotal = cupo - entregadoTotal - pendienteTotal;
  const disponibleGenetica = limiteGenetica - entregadoGenetica - pendienteGenetica;
  const disponible = Math.max(0, Math.min(disponibleTotal, disponibleGenetica));

  if (!geneticaActiva || cantidad <= 0 || cantidad > disponible) {
    const error = new Error("Pedido fuera del cupo disponible");
    error.statusCode = 400;
    throw error;
  }

  return payload;
};

const formatGramos = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${Number(number.toFixed(1))}g` : "0g";
};

const buildTelegramMessage = (pedido) => {
  const fecha = pedido.fecha ? new Date(pedido.fecha).toLocaleString("es-AR") : "sin fecha";

  return [
    "Nuevo pedido Reprocann",
    `Persona: ${pedido.persona || "Sin persona"}`,
    `Genetica: ${pedido.genetica || "Sin genetica"}`,
    `Gramos: ${formatGramos(pedido.gramos)}`,
    `Fecha: ${fecha}`,
  ].join("\n");
};

const notifyOrder = async (pedido) => {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return;

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      chat_id: chatId,
      text: buildTelegramMessage(pedido),
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram notification failed: ${response.status}`);
  }
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const action = body.action;

    if (action === "patient-data") {
      return json(res, 200, { ok: true, data: await patientPayload(String(body.pin || "").trim()) });
    }

    if (action === "create-order") {
      const pin = String(body.pin || "").trim();
      const genetica = String(body.genetica || "").trim();
      const cantidad = gramos(body.gramos);
      const payload = await assertOrderAvailable({ pin, genetica, cantidad });
      const nuevoPedido = {
        pacientePin: pin,
        persona: payload.paciente.nombre,
        genetica,
        gramos: cantidad,
        estado: "pendiente",
        fecha: new Date().toISOString(),
        mes: mesActual(),
        avisoAdmin: "pendiente",
      };

      await dbRequest("pedidos", {
        method: "POST",
        body: JSON.stringify(nuevoPedido),
      });
      await notifyOrder(nuevoPedido).catch((error) => {
        console.warn(error.message);
      });

      return json(res, 200, { ok: true, pedido: nuevoPedido, data: await patientPayload(pin) });
    }

    if (action === "admin-data") {
      requireAdmin(body.adminPin);
      return json(res, 200, { ok: true, data: await loadSnapshot() });
    }

    if (action === "add-patient") {
      requireAdmin(body.adminPin);
      const nombre = String(body.nombre || "").trim();
      const pin = String(body.pin || "").trim();
      const cupo = gramos(body.cupo);
      if (!nombre || !validarPin(pin) || cupo <= 0) {
        return json(res, 400, { ok: false, error: "Datos de paciente invalidos" });
      }
      await dbRequest(`pacientes/${pin}`, {
        method: "PATCH",
        body: JSON.stringify({ nombre, cupo, activo: true, fecha: new Date().toISOString() }),
      });
      return json(res, 200, { ok: true, data: await loadSnapshot() });
    }

    if (action === "add-genetica") {
      requireAdmin(body.adminPin);
      const pin = String(body.pin || "").trim();
      const nombre = String(body.nombre || "").trim();
      const cantidad = gramos(body.gramos);
      const paciente = await dbRequest(`pacientes/${pin}`);
      if (!paciente || paciente.activo === false || !nombre || cantidad <= 0) {
        return json(res, 400, { ok: false, error: "Datos de genetica invalidos" });
      }
      await dbRequest("geneticas", {
        method: "POST",
        body: JSON.stringify({
          pacientePin: pin,
          paciente: paciente.nombre,
          nombre,
          gramos: cantidad,
          activa: true,
          fecha: new Date().toISOString(),
        }),
      });
      return json(res, 200, { ok: true, data: await loadSnapshot() });
    }

    if (action === "confirm-order") {
      requireAdmin(body.adminPin);
      const id = String(body.id || "").trim();
      const pedido = await dbRequest(`pedidos/${id}`);
      if (!id || !pedido || pedido.estado !== "pendiente") {
        return json(res, 400, { ok: false, error: "Pedido invalido" });
      }

      await dbRequest("entregas", {
        method: "POST",
        body: JSON.stringify({
          pacientePin: pedido.pacientePin || "",
          persona: pedido.persona,
          genetica: pedido.genetica,
          gramos: gramos(pedido.gramos),
          fecha: new Date().toISOString(),
          pedidoId: id,
        }),
      });

      await dbRequest(`pedidos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "confirmado", confirmadoEn: new Date().toISOString() }),
      });

      return json(res, 200, { ok: true, data: await loadSnapshot() });
    }

    return json(res, 400, { ok: false, error: "Accion invalida" });
  } catch (error) {
    console.error("Reprocann API error:", error.message);
    if (error.statusCode === 403) {
      return json(res, 403, {
        ok: false,
        error: "Firebase no autorizo la lectura/escritura. Carga FIREBASE_SERVICE_ACCOUNT_JSON en Vercel o revisa las reglas.",
      });
    }

    return json(res, error.statusCode || 500, {
      ok: false,
      error: error.statusCode ? error.message : "Error interno",
    });
  }
};
