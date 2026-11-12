// ==========================================
// CONFIGURATION FIREBASE PARTAGÉE
// Toutes les applis du site (dashboard, stock, recettes…) importent
// app et db depuis ce fichier (../commun/firebase.js) : une seule base pour tout le site.
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const firebaseConfig = {
    apiKey: "AIzaSyDmOiHUetoxS2Yzyou-rzehbPTIHmPrU6Q",
    authDomain: "dash-board-maison.firebaseapp.com",
    projectId: "dash-board-maison",
    storageBucket: "dash-board-maison.firebasestorage.app",
    messagingSenderId: "284538658677",
    appId: "1:284538658677:web:d044a7435d12467bbfbd3c"
};

export const app = initializeApp(firebaseConfig);

// Cache local : ce qui a déjà été ouvert reste consultable avec une connexion faible
// (les recettes en cuisine, la liste de courses au magasin…).
let base;
try {
    base = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
} catch (e) {
    console.warn("Cache local indisponible, connexion directe :", e);
    base = getFirestore(app);
}
export const db = base;
