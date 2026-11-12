// ==========================================
// CONFIGURATION FIREBASE PARTAGÉE
// Toutes les applis du site importent app et db depuis ce fichier.
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const firebaseConfig = {
    apiKey: "AIzaSyDmOiHUetoxS2Yzyou-rzehbPTIHmPrU6Q",
    authDomain: "dash-board-maison.firebaseapp.com",
    projectId: "dash-board-maison",
    storageBucket: "dash-board-maison.firebasestorage.app",
    messagingSenderId: "284538658677",
    appId: "1:284538658677:web:d044a7435d12467bbfbd3c"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
