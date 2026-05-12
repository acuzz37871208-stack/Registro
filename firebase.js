import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDkLaAKEVR2GW9ZsUkYUKvcjIU1VNtMb6Q",
  authDomain: "reprocann-fd0bb.firebaseapp.com",
  databaseURL: "https://reprocann-fd0bb-default-rtdb.firebaseio.com",
  projectId: "reprocann-fd0bb",
  storageBucket: "reprocann-fd0bb.firebasestorage.app",
  messagingSenderId: "737068984517",
  appId: "1:737068984517:web:1ec536dd8dce64fa6028ac"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, push, onValue };
