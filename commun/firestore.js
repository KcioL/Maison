// ==========================================
// FIRESTORE pour les applis
// Exactement la bibliothèque Firestore, sauf que chaque ajout ou modification
// dans le contenu d'un élément partagé (listes/{id}/articles/…, vehicules/{id}/entretiens/…)
// le signale, pour allumer le petit rond « nouveau » chez les autres membres
// (voir commun/nouveautes.js). Les suppressions ne comptent pas.
//
//   import { doc, addDoc, … } from "../commun/firestore.js";
// ==========================================
import * as F from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signalerChemin } from "./nouveautes.js";
export * from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const addDoc = (ref, ...a) => { signalerChemin(ref?.path); return F.addDoc(ref, ...a); };
export const setDoc = (ref, ...a) => { signalerChemin(ref?.path); return F.setDoc(ref, ...a); };
export const updateDoc = (ref, ...a) => { signalerChemin(ref?.path); return F.updateDoc(ref, ...a); };

export function writeBatch(base) {
    const lot = F.writeBatch(base), chemins = [];
    const enveloppe = {
        set(ref, ...a) { chemins.push(ref?.path); lot.set(ref, ...a); return enveloppe; },
        update(ref, ...a) { chemins.push(ref?.path); lot.update(ref, ...a); return enveloppe; },
        delete(ref) { lot.delete(ref); return enveloppe; },
        commit() { const r = lot.commit(); chemins.forEach(signalerChemin); return r; }
    };
    return enveloppe;
}
