import { db, ref, onValue } from "./firebase.js";
const USER = "Matias";

const lista = document.getElementById("lista");
const resumen = document.getElementById("resumen");
const fill = document.getElementById("fill");

onValue(ref(db,"entregas"), snap=>{
  const data = snap.val()||{};
  let arr = Object.values(data);

  arr = arr.filter(e=> e.persona && e.persona
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  ===
USER
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase());

  arr.sort((a,b)=> new Date(b.fecha)-new Date(a.fecha));

  lista.innerHTML = arr.map(e=>{
    const f = new Date(e.fecha).toLocaleDateString("es-AR");
    return `<div class="item">${f} · ${e.genetica} · ${e.gramos}g</div>`;
  }).join("");

  const now = new Date();
  const mes = now.getMonth();

  const delMes = arr.filter(e=>{
    const d = new Date(e.fecha);
    return d.getMonth()===mes;
  });

  const total = delMes.reduce((a,b)=>a+b.gramos,0);
  const limite = 20;
  const restante = limite-total;

  let estado="OK";
  if(total===limite) estado="LIMITE";
  if(total>limite) estado="EXCEDIDO";

  resumen.innerHTML = `
    <div class="big">${total}g / ${limite}g</div>
    <div>Restante: ${restante>0?restante:0}g</div>
    <div>${estado}</div>
  `;

  const pct = Math.min(100,total/limite*100);
  fill.style.width = pct+"%";
  fill.style.background = total>limite?"red":"#00ffc6";
});
