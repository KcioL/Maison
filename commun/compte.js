// ==========================================
// COMPTE (une seule connexion pour tout le site)
//
// Comptes e-mail Firebase Auth (les mêmes que sur ton autre site).
// L'annuaire (collection « annuaire », clé = e-mail) permet de retrouver
// quelqu'un par son e-mail pour lui partager un stock, une liste ou un carnet.
// On ne peut s'y inscrire qu'avec un e-mail vérifié.
//
// Utilisation dans une appli :  outils.compte.uid, outils.compte.email,
//   outils.compte.nom, nomDe(uid, email), chercherParEmail(email)…
// ==========================================
import { app, db } from "./firebase.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, sendPasswordResetEmail, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const auth = getAuth(app);
const INDICE = "maison-connecte";   // retenu dans le navigateur : « déjà connecté »

export const emailCle = (e) => String(e || "").trim().toLowerCase();

// Ce qu'on sait du compte connecté (null tant que personne n'est connecté)
export const compte = {
    uid: null, email: "", nom: "", verifie: false, user: null
};

// Le navigateur se souvient-il d'une connexion ? (permet d'afficher le site tout de suite)
export function probablementConnecte() {
    try { return localStorage.getItem(INDICE) === "1"; } catch { return false; }
}

// Résolu dès que Firebase sait si quelqu'un est connecté (avec l'utilisateur ou null)
let resoudrePret;
export const pret = new Promise(r => { resoudrePret = r; });

const ecouteurs = new Set();
export function surChangement(fn) { ecouteurs.add(fn); return () => ecouteurs.delete(fn); }

onAuthStateChanged(auth, async (u) => {
    if (u) {
        compte.uid = u.uid; compte.email = emailCle(u.email); compte.user = u;
        compte.verifie = !!u.emailVerified;
        compte.nom = (u.email || "").split("@")[0];
        try { localStorage.setItem(INDICE, "1"); } catch { }
        inscrireAnnuaire();
    } else {
        Object.assign(compte, { uid: null, email: "", nom: "", verifie: false, user: null });
        try { localStorage.removeItem(INDICE); } catch { }
    }
    resoudrePret(u || null);
    ecouteurs.forEach(fn => fn(u || null));
});

// ---------- Connexion ----------
export const ERREURS = {
    "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
    "auth/invalid-login-credentials": "E-mail ou mot de passe incorrect.",
    "auth/wrong-password": "E-mail ou mot de passe incorrect.",
    "auth/user-not-found": "Aucun compte avec cet e-mail.",
    "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail : connecte-toi.",
    "auth/weak-password": "Le mot de passe doit faire au moins 6 caractères.",
    "auth/invalid-email": "Cette adresse e-mail n'est pas valide.",
    "auth/too-many-requests": "Trop d'essais. Attends quelques minutes avant de réessayer.",
    "auth/network-request-failed": "Pas de connexion internet."
};
export const messageErreur = (e, defaut = "Connexion impossible. Réessaie.") => ERREURS[e?.code] || defaut;

export const seConnecter = (email, mdp) => signInWithEmailAndPassword(auth, email, mdp);
export async function creerCompte(email, mdp) {
    const cred = await createUserWithEmailAndPassword(auth, email, mdp);
    try { await sendEmailVerification(cred.user); } catch { }
    return cred;
}
export const motDePasseOublie = (email) => sendPasswordResetEmail(auth, email);
export async function deconnecter() {
    try { localStorage.removeItem(INDICE); } catch { }
    await signOut(auth);
    location.reload();   // on repart d'une page propre
}

// ---------- Vérification de l'e-mail ----------
export const envoyerVerification = () => sendEmailVerification(auth.currentUser);
export async function actualiserVerification() {
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    compte.verifie = !!auth.currentUser.emailVerified;
    if (compte.verifie) await inscrireAnnuaire();
    ecouteurs.forEach(fn => fn(auth.currentUser));
    return compte.verifie;
}

// ---------- Annuaire (e-mail -> compte, prénom) ----------
const noms = new Map();   // uid -> prénom

async function inscrireAnnuaire() {
    if (!compte.uid || !compte.email) return;
    try {
        const ref = doc(db, "annuaire", compte.email);
        const snap = await getDoc(ref);
        if (snap.exists() && snap.data().uid === compte.uid) {
            compte.nom = snap.data().name || compte.nom;
        } else if (compte.verifie) {
            await setDoc(ref, { uid: compte.uid, name: compte.nom.slice(0, 40) });
        }
        noms.set(compte.uid, compte.nom);
        ecouteurs.forEach(fn => fn(compte.user));
    } catch (e) { console.warn("Annuaire :", e); }
}

export async function changerNom(nom) {
    nom = String(nom).trim().slice(0, 40);
    if (!nom || !compte.verifie) return false;
    await setDoc(doc(db, "annuaire", compte.email), { uid: compte.uid, name: nom });
    compte.nom = nom; noms.set(compte.uid, nom);
    ecouteurs.forEach(fn => fn(compte.user));
    return true;
}

// Trouve un compte par son e-mail : { uid, name } ou null
export async function chercherParEmail(email) {
    const snap = await getDoc(doc(db, "annuaire", emailCle(email)));
    if (!snap.exists()) return null;
    const d = snap.data();
    noms.set(d.uid, d.name);
    return { uid: d.uid, name: d.name || emailCle(email).split("@")[0], email: emailCle(email) };
}

// Prénom d'un membre (avec son e-mail en secours). Synchrone : renvoie ce qu'on sait,
// et va chercher le vrai prénom en arrière-plan (appelle quandConnu ensuite).
export function nomDe(uid, email, quandConnu) {
    if (!uid) return "";
    if (uid === compte.uid) return compte.nom || "toi";
    if (noms.has(uid)) return noms.get(uid);
    const secours = email ? email.split("@")[0] : "un ancien membre";
    if (email) {
        noms.set(uid, secours);
        getDoc(doc(db, "annuaire", emailCle(email))).then(s => {
            if (s.exists() && s.data().uid === uid && s.data().name) {
                noms.set(uid, s.data().name);
                quandConnu?.();
            }
        }).catch(() => { });
    }
    return secours;
}
