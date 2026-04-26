document.getElementById("guardar").onclick = () => {
  const persona = document.getElementById("persona").value.trim();
  const genetica = document.getElementById("genetica").value.trim();
  const gramos = parseFloat(document.getElementById("gramos").value);

  if (!persona || !genetica || isNaN(gramos)) {
    alert("Completar datos");
    return;
  }

  push(ref(db,"entregas"),{
    persona,
    genetica,
    gramos,
    fecha:new Date().toISOString()
  });

  document.getElementById("persona").value="";
  document.getElementById("genetica").value="";
  document.getElementById("gramos").value="";
};
