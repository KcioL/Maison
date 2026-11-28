// ==========================================
// SUPPRIMER SON COMPTE (et tout ce qui y est lié)
//
//   - ce que je possède (listes, stocks, carnets, programmes, abonnements, foyers,
//     véhicules, menus, meubles) : supprimé avec tout son contenu, pour tout le monde ;
//   - ce qu'on m'a partagé : je le quitte (le propriétaire garde ses données) ;
//   - mes exercices Muscu perso, mes « vus », ma fiche dans l'annuaire ;
//   - enfin le compte de connexion lui-même.
// Firebase demande de retaper le mot de passe juste avant (sécurité).
// ==========================================
import { db } from "./firebase.js";
import { compte, auth } from "./compte.js";
import { esc, ouvrirFeuille, toast } from "./ui.js";
import {
    collection, doc, getDoc, getDocs, query, where, updateDoc, deleteDoc, deleteField, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { EmailAuthProvider, reauthenticateWithCredential, deleteUser } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Ce que contient chaque élément partagé : sous-collections (et leurs propres sous-collections)
const CONTENU = {
    listes: [["articles"]],
    stocks: [["storages"], ["items"]],
    carnets: [["recettes", [["photos"]]]],
    programmes: [["seances"]],
    abonnements: [["lignes"]],
    foyers: [["donnees"]],
    vehicules: [["donnees"], ["entretiens"], ["historique"]],
    menus: [["repas"]],
    meubles: [["articles", [["photos"]]]]
};
const NOMS = { listes: "liste", stocks: "stock", carnets: "carnet de recettes", programmes: "programme de muscu", abonnements: "liste d'abonnements", foyers: "foyer", vehicules: "véhicule", menus: "menus", meubles: "liste de meubles" };

// Supprime une collection entière (et ce qu'il y a sous chaque document)
async function viderCollection(ref, sous = []) {
    const snap = await getDocs(ref);
    for (const d of snap.docs) for (const [nom, sousSous] of sous) await viderCollection(collection(d.ref, nom), sousSous || []);
    for (let i = 0; i < snap.docs.length; i += 400) {
        const lot = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach(d => lot.delete(d.ref));
        await lot.commit();
    }
}

// Inventaire : ce qui sera supprimé (à moi) et ce que je quitterai (partagé avec moi)
async function inventaire() {
    const mien = [], partage = [];
    for (const col of Object.keys(CONTENU)) {
        const snap = await getDocs(query(collection(db, col), where("memberIds", "array-contains", compte.uid)));
        snap.forEach(d => {
            const e = { col, id: d.id, ref: d.ref, name: d.data().name, ownerId: d.data().ownerId, memberIds: d.data().memberIds || [] };
            (e.ownerId === compte.uid ? mien : partage).push(e);
        });
    }
    return { mien, partage };
}

async function toutSupprimer({ mien, partage }, progres) {
    let n = 0;
    const total = mien.length + partage.length + 3;
    // 1. ce qu'on m'a partagé : je quitte
    for (const e of partage) {
        progres(`Départ des éléments partagés… ${++n}/${total}`);
        await updateDoc(e.ref, { memberIds: e.memberIds.filter(x => x !== compte.uid), ["members." + compte.uid]: deleteField() });
    }
    // 2. ce qui est à moi : contenu puis document
    for (const e of mien) {
        progres(`Suppression de « ${e.name} »… ${++n}/${total}`);
        for (const [nom, sous] of CONTENU[e.col]) await viderCollection(collection(e.ref, nom), sous || []);
        await deleteDoc(e.ref);
    }
    // 3. mes exercices perso, mes « vus », ma fiche annuaire
    progres(`Derniers nettoyages… ${++n}/${total}`);
    const exos = await getDocs(query(collection(db, "exercicesPerso"), where("creePar", "==", compte.uid)));
    for (const d of exos.docs) await deleteDoc(d.ref);
    await deleteDoc(doc(db, "vus", compte.uid)).catch(() => {});
    progres(`Derniers nettoyages… ${++n}/${total}`);
    if (compte.email) {
        const fiche = await getDoc(doc(db, "annuaire", compte.email)).catch(() => null);
        if (fiche?.exists() && fiche.data().uid === compte.uid) await deleteDoc(fiche.ref);
    }
    // 4. le compte lui-même
    progres("Suppression du compte…");
    await deleteUser(auth.currentUser);
}

export async function ficheSupprimerCompte() {
    const f = ouvrirFeuille({ titre: "Supprimer mon compte" });
    f.corps.innerHTML = `<p class="muet">Je regarde ce qui est lié à ton compte…</p>`;
    let inv;
    try { inv = await inventaire(); }
    catch (e) { console.error(e); f.corps.innerHTML = `<p>Impossible de préparer la suppression (connexion ?). Réessaie dans un moment.</p>`; return; }
    const avecAutres = inv.mien.filter(e => e.memberIds.length > 1);
    const ligne = (e) => `<li>${esc(e.name)} <small>(${NOMS[e.col]}${e.memberIds.length > 1 ? `, partagé avec ${e.memberIds.length - 1} personne${e.memberIds.length > 2 ? "s" : ""}` : ""})</small></li>`;
    f.corps.innerHTML = `<form class="suppr-compte" autocomplete="off">
        <p><b>C'est définitif.</b> Seront supprimés :</p>
        <ul class="suppr-liste">
            ${inv.mien.map(ligne).join("") || "<li class=\"muet\">Aucun élément créé par toi</li>"}
            <li>tes exercices Muscu perso, ton prénom et tes réglages</li>
            <li>ton compte (${esc(compte.email)})</li>
        </ul>
        ${avecAutres.length ? `<p class="note">⚠️ ${avecAutres.length > 1 ? "Ces éléments sont partagés" : "Un de ces éléments est partagé"} : ${avecAutres.length > 1 ? "ils disparaîtront" : "il disparaîtra"} aussi pour les autres personnes. Si tu veux qu'ils les gardent, demande-leur d'en recopier le contenu avant.</p>` : ""}
        ${inv.partage.length ? `<p class="muet petit">Tu quitteras aussi ${inv.partage.length} élément${inv.partage.length > 1 ? "s" : ""} qu'on t'a partagé${inv.partage.length > 1 ? "s" : ""} : ${inv.partage.map(e => `« ${esc(e.name)} »`).join(", ")}. Leurs propriétaires les gardent, avec ce que tu y as ajouté.</p>` : ""}
        <label class="champ"><span>Ton mot de passe, pour confirmer</span><input type="password" name="mdp" required autocomplete="current-password"></label>
        <label class="suppr-case"><input type="checkbox" name="ok" required><span>Je comprends que c'est définitif</span></label>
        <p class="suppr-etat muet petit" aria-live="polite"></p>
        <button class="bouton danger plein large" type="submit">Supprimer définitivement mon compte</button>
    </form>`;
    const form = f.corps.querySelector("form"), etat = f.corps.querySelector(".suppr-etat");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!form.ok.checked || !form.mdp.value) return;
        const bouton = form.querySelector("button[type=submit]");
        bouton.disabled = true;
        // Firebase exige une connexion toute récente pour supprimer un compte
        try {
            etat.textContent = "Vérification du mot de passe…";
            await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, form.mdp.value));
        } catch (err) {
            console.error(err);
            etat.textContent = ["auth/wrong-password", "auth/invalid-credential", "auth/invalid-login-credentials"].includes(err.code) ? "Mot de passe incorrect."
                : err.code === "auth/too-many-requests" ? "Trop d'essais. Attends quelques minutes." : "Vérification impossible. Réessaie.";
            bouton.disabled = false;
            return;
        }
        try {
            await toutSupprimer(inv, (m) => { etat.textContent = m; });
            try { ["maison-connecte"].forEach(k => localStorage.removeItem(k)); } catch { }
            f.corps.innerHTML = `<p>✔ Ton compte et tes données ont été supprimés. À bientôt peut-être !</p>`;
            setTimeout(() => location.reload(), 2000);
        } catch (err) {
            console.error(err);
            etat.textContent = "La suppression s'est arrêtée en cours de route (connexion ?). Reconnecte-toi et relance-la : elle reprendra ce qui reste.";
            bouton.disabled = false;
        }
    });
}
