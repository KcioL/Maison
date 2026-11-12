// ==========================================
// PARTAGE (stocks, listes, carnets de recettes)
//
// Tout ce qui se partage a la même forme dans la base :
//   { name, ownerId, memberIds: [uid…], members: { uid: e-mail }, createdAt, …champs propres }
// Le propriétaire choisit qui y a accès (par e-mail), chaque membre peut le quitter,
// seul le propriétaire peut le renommer ou le supprimer.
//
//   ecouterMesPartages("listes", (liste) => …)    ce que je possède ou qu'on m'a partagé
//   creerPartage("listes", { name, type })          crée, avec moi comme propriétaire
//   ouvrirAcces({ collection, id, quoi, supprimerContenu })   panneau « Qui a accès »
// ==========================================
import { db } from "./firebase.js";
import { compte, chercherParEmail, nomDe, emailCle, envoyerVerification, actualiserVerification } from "./compte.js";
import { esc, toast, ouvrirFeuille, boutonConfirmation } from "./ui.js";
import {
    collection, doc, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COULEURS = ["#e07a5f", "#5b8fb9", "#6a9a76", "#c08552", "#9b84b8", "#a5576b", "#3d8a8a"];
export function avatar(nom, uid) {
    let h = 0; for (const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return `<span class="avatar" style="background:${COULEURS[h % COULEURS.length]}">${esc((nom || "?").charAt(0).toUpperCase())}</span>`;
}

// Écoute en direct ce que je possède ou qu'on m'a partagé dans une collection.
// Renvoie la fonction pour arrêter d'écouter.
export function ecouterMesPartages(nomCollection, rappel, quandErreur) {
    const q = query(collection(db, nomCollection), where("memberIds", "array-contains", compte.uid));
    return onSnapshot(q, snap => {
        const liste = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        rappel(liste, snap);
    }, err => { console.error(nomCollection, err); quandErreur?.(err); });
}

export async function creerPartage(nomCollection, champs) {
    const ref = await addDoc(collection(db, nomCollection), {
        ...champs,
        ownerId: compte.uid,
        memberIds: [compte.uid],
        members: { [compte.uid]: compte.email },
        createdAt: Date.now()
    });
    return ref.id;
}

const estProprietaire = (d) => d && d.ownerId === compte.uid;

// Panneau « Qui a accès »
//   collection : "stocks" | "listes" | "carnets"
//   quoi       : "ce stock" | "cette liste" | "ce carnet" (pour les phrases)
//   supprimerContenu : async (id) => supprime ce qu'il y a dedans (avant le document lui-même)
export function ouvrirAcces({ collection: nomCollection, id, quoi = "ceci", supprimerContenu }) {
    const ref = doc(db, nomCollection, id);
    let donnees = null;
    const feuille = ouvrirFeuille({ titre: "Qui a accès", quandFerme: () => arreter() });
    const corps = feuille.corps;

    const dessiner = () => {
        if (!donnees) { corps.innerHTML = `<p class="muet">Chargement…</p>`; return; }
        const proprio = estProprietaire(donnees);
        feuille.titre(`Qui a accès à « ${donnees.name} »`);
        const membres = Object.entries(donnees.members || {})
            .sort(([a], [b]) => (a === donnees.ownerId ? -1 : b === donnees.ownerId ? 1 : 0));
        corps.innerHTML = `
            <div class="personnes">${membres.map(([uid, email]) => {
                const nom = uid === compte.uid ? `${compte.nom} (toi)` : nomDe(uid, email, dessiner);
                return `<div class="personne">${avatar(nom, uid)}
                    <div class="personne-txt"><b>${esc(nom)}</b><small>${esc(email)}</small></div>
                    <span class="etiquette ${uid === donnees.ownerId ? "ok" : ""}">${uid === donnees.ownerId ? "Propriétaire" : "Membre"}</span>
                    ${proprio && uid !== compte.uid ? `<button type="button" class="lien-bouton" data-retirer="${esc(uid)}">Retirer</button>` : ""}
                </div>`;
            }).join("")}</div>
            ${proprio ? `
            <form class="ligne-form" data-form="ajouter" autocomplete="off">
                <label class="champ"><span>Donner l'accès à</span><input type="email" name="email" required placeholder="E-mail de son compte"></label>
                <button class="bouton principal" type="submit">Ajouter</button>
            </form>
            <p class="muet petit">La personne doit avoir un compte sur le site et avoir vérifié son e-mail. Elle pourra tout voir et modifier.</p>`
            : `<p class="muet petit">Seul le propriétaire peut donner ou retirer l'accès.</p>`}
            ${compte.verifie ? "" : `<div class="note">
                <span><b>Vérifie ton adresse e-mail</b> pour que les autres puissent te partager leurs listes, stocks et carnets.</span>
                <span class="boutons"><button type="button" class="bouton petit" data-action="envoyer">Envoyer l'e-mail</button>
                <button type="button" class="bouton petit" data-action="verifie">J'ai cliqué sur le lien</button></span></div>`}
            <hr class="separation">
            ${proprio ? `
            <form class="ligne-form" data-form="renommer" autocomplete="off">
                <label class="champ"><span>Nom</span><input name="nom" maxlength="60" required value="${esc(donnees.name)}"></label>
                <button class="bouton" type="submit">Renommer</button>
            </form>
            <div><button type="button" class="bouton danger petit" data-action="supprimer">Supprimer ${esc(quoi)}</button></div>`
            : `<div><button type="button" class="bouton danger petit" data-action="quitter">Quitter ${esc(quoi)}</button></div>`}`;

        // actions
        corps.querySelectorAll("[data-retirer]").forEach(b => boutonConfirmation(b, "Confirmer", async () => {
            const uid = b.dataset.retirer;
            try {
                await updateDoc(ref, { memberIds: donnees.memberIds.filter(x => x !== uid), ["members." + uid]: deleteField() });
                toast("Accès retiré.");
            } catch (e) { erreur(e); }
        }));
        corps.querySelector('[data-form="ajouter"]')?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = emailCle(e.target.email.value);
            if (Object.values(donnees.members || {}).includes(email)) { toast("Cette personne a déjà accès."); return; }
            try {
                const trouve = await chercherParEmail(email);
                if (!trouve) { toast("Aucun compte trouvé : la personne doit se connecter une fois sur le site et vérifier son e-mail."); return; }
                await updateDoc(ref, { memberIds: [...donnees.memberIds, trouve.uid], ["members." + trouve.uid]: email });
                toast(`${trouve.name} a maintenant accès à « ${donnees.name} ».`);
            } catch (err) { erreur(err); }
        });
        corps.querySelector('[data-form="renommer"]')?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const nom = e.target.nom.value.trim(); if (!nom) return;
            try { await updateDoc(ref, { name: nom }); toast("Renommé."); } catch (err) { erreur(err); }
        });
        const bSuppr = corps.querySelector('[data-action="supprimer"]');
        if (bSuppr) boutonConfirmation(bSuppr, "Supprimer définitivement, avec tout son contenu ?", async () => {
            feuille.fermer();
            try { await supprimerContenu?.(id); await deleteDoc(ref); toast("Supprimé."); } catch (err) { erreur(err); }
        });
        const bQuitter = corps.querySelector('[data-action="quitter"]');
        if (bQuitter) boutonConfirmation(bQuitter, `Confirmer : quitter ${quoi}`, async () => {
            feuille.fermer();
            try {
                await updateDoc(ref, { memberIds: donnees.memberIds.filter(x => x !== compte.uid), ["members." + compte.uid]: deleteField() });
                toast(`Tu as quitté ${quoi}.`);
            } catch (err) { erreur(err); }
        });
        corps.querySelector('[data-action="envoyer"]')?.addEventListener("click", () =>
            envoyerVerification().then(() => toast(`E-mail envoyé à ${compte.email} (regarde aussi les spams).`))
                .catch(e => toast(e.code === "auth/too-many-requests" ? "Déjà envoyé il y a peu : attends quelques minutes." : "Envoi impossible pour le moment.")));
        corps.querySelector('[data-action="verifie"]')?.addEventListener("click", async () => {
            toast(await actualiserVerification() ? "E-mail vérifié ✔" : "Pas encore vérifié : clique sur le lien reçu par e-mail, puis réessaie.");
            dessiner();
        });
    };

    const erreur = (e) => {
        console.error(e);
        toast(e?.code === "permission-denied" ? "Action refusée : tu n'as peut-être plus accès." : "Modification impossible. Réessaie.");
    };

    dessiner();
    const arreter = onSnapshot(ref, s => {
        if (!s.exists()) { feuille.fermer(); return; }
        donnees = { id: s.id, ...s.data() };
        // on ne redessine pas pendant qu'on tape
        if (!corps.contains(document.activeElement) || document.activeElement.tagName !== "INPUT") dessiner();
    }, () => feuille.fermer());
    return feuille;
}
