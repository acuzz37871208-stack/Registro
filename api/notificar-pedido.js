const TELEGRAM_API = "https://api.telegram.org";

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(200).json({ ok: true, notification: "disabled" });
  }

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildMessage(req.body || {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Telegram error:", detail);
      return res.status(502).json({ ok: false, error: "Telegram request failed" });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Notification error:", error);
    return res.status(500).json({ ok: false, error: "Notification failed" });
  }
};
