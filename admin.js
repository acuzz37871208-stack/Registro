import { db, ref, push } from "./firebase.js";

document.getElementById("guardar").onclick = async () => {
  const persona = document.getElementById("persona").value.trim();
  const genetica = document.getElementById("genetica").value.trim();
  const gramos = parseFloat(document.getElementById("gramos").value);

  if (!persona || !genetica || isNaN(gramos)) {
    alert("Completar datos");
    return;
  }

  try {
    await push(ref(db, "entregas"), {
      persona,
      genetica,
      gramos,
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
