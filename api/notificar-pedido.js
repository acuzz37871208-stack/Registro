const https = require("https");

const formatGramos = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${Number(number.toFixed(1))}g` : "0g";
};

const buildMessage = (pedido) => {
  const fecha = pedido.fecha ? new Date(pedido.fecha).toLocaleString("es-AR") : "sin fecha";

  return [
    "Nuevo pedido Reprocann",
    `Persona: ${pedido.persona || "Sin persona"}`,
    `Genetica: ${pedido.genetica || "Sin genetica"}`,
    `Gramos: ${formatGramos(pedido.gramos)}`,
    `Fecha: ${fecha}`,
  ].join("\n");
};

const sendTelegram = ({ token, chatId, text }) =>
  new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      chat_id: chatId,
      text,
    }).toString();

    const request = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/sendMessage`,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        let data = "";

        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(data);
            return;
          }

          reject(new Error(data || `Telegram status ${response.statusCode}`));
        });
      }
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token || !chatId) {
    return res.status(200).json({ ok: true, notification: "disabled" });
  }

  try {
    await sendTelegram({
      token,
      chatId,
      text: buildMessage(req.body || {}),
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Notification error:", error.message);
    return res.status(502).json({
      ok: false,
      error: "Telegram request failed",
      detail: error.message,
    });
  }
};
