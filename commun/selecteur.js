// ==========================================
// SÉLECTEUR DE PARTAGE
// La barre « liste déroulante + Partager + Renommer + Supprimer » des applis
// qui gèrent des éléments partagés (abonnements, foyers…), prête à l'emploi.
//
//   const sel = selecteurPartage({
//       collection: "abonnements", quoi: "ce budget", nomNouveau: "Nouveau budget",
//       etiquette: "Nom du budget", exemple: "Ex. Abonnements du foyer",
//       memo: "abonnements-courant", supprimerContenu: async (id) => …,
//       quandChange: (element, liste) => …   // élément ouvert (ou null), liste complète
//   });
//   zone.innerHTML = sel.barre() + …;  sel.brancher(zone);
//   sel.courant()  sel.liste()  sel.charge()  sel.creer(nom)
// ==========================================
import { compte } from "./compte.js";
import { ecouterMesPartages, creerPartage, ouvrirAcces, supprimerOuQuitter, renommerPartage } from "./partage.js";
import { esc, toast, demanderTexte } from "./ui.js";

const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { } };

export function selecteurPartage({ collection, quoi, nomNouveau, etiquette = "Nom", exemple = "", memo, supprimerContenu, quandChange, quandErreur }) {
    let liste = [], id = null, charge = false, voulu = null;
    const courant = () => liste.find(x => x.id === id) || null;

    ecouterMesPartages(collection, (nouvelle) => {
        liste = nouvelle; charge = true;
        let cible = id;
        if (voulu && liste.some(x => x.id === voulu)) { cible = voulu; voulu = null; }
        else if (!cible || !liste.some(x => x.id === cible)) {
            const m = lire(memo);
            cible = liste.some(x => x.id === m) ? m : (liste[0]?.id || null);
        }
        id = cible;
        if (id) ecrire(memo, id);
        quandChange(courant(), liste);
    }, (err) => { charge = true; quandErreur?.(err); });

    async function creer(nom) {
        try {
            const nouvel = await creerPartage(collection, { name: nom });
            ecrire(memo, nouvel);
            if (liste.some(x => x.id === nouvel)) { id = nouvel; quandChange(courant(), liste); }
            else voulu = nouvel;
            toast(`« ${nom} » créé.`);
            return nouvel;
        } catch (e) { console.error(e); toast("Création impossible. Réessaie."); return null; }
    }

    function barre() {
        const c = courant();
        if (!c) return "";
        const mien = c.ownerId === compte.uid;
        return `<div class="barre-partage">
            <select class="choix-partage" aria-label="Choisir">
                ${liste.map(x => `<option value="${esc(x.id)}" ${x.id === id ? "selected" : ""}>${esc(x.name)}${x.ownerId !== compte.uid ? " (partagé)" : ""}</option>`).join("")}
                <option value="__nouveau">+ ${esc(nomNouveau)}…</option>
            </select>
            <button type="button" class="bouton-partage" data-sel="partager" title="Partager"><span aria-hidden="true">👥</span><span class="lbl"> Partager</span></button>
            ${mien ? `<button type="button" class="bouton-partage icone" data-sel="renommer" title="Renommer" aria-label="Renommer">✏️</button>` : ""}
            <button type="button" class="bouton-partage icone" data-sel="supprimer" title="${mien ? "Supprimer" : "Quitter (partagé avec toi)"}" aria-label="${mien ? "Supprimer" : "Quitter"}">${mien ? "🗑️" : "🚪"}</button>
        </div>`;
    }

    function brancher(zone) {
        const choix = zone.querySelector(".choix-partage");
        choix?.addEventListener("change", async () => {
            if (choix.value === "__nouveau") {
                choix.value = id || "";
                const nom = await demanderTexte({ titre: nomNouveau, etiquette, exemple, bouton: "Créer" });
                if (nom) creer(nom);
                return;
            }
            id = choix.value; ecrire(memo, id);
            quandChange(courant(), liste);
        });
        zone.querySelectorAll("[data-sel]").forEach(b => b.addEventListener("click", () => {
            const c = courant(); if (!c) return;
            if (b.dataset.sel === "partager") ouvrirAcces({ collection, id: c.id, quoi, supprimerContenu });
            else if (b.dataset.sel === "renommer") renommerPartage({ collection, partage: c, quoi });
            else if (b.dataset.sel === "supprimer") supprimerOuQuitter({ collection, partage: c, quoi, supprimerContenu });
        }));
    }

    return { barre, brancher, creer, courant, liste: () => liste, charge: () => charge };
}

// Écoute en direct un document ou une requête ; si le serveur refuse l'accès
// (élément tout juste créé ou partagé), réessaie quelques fois.
//   ecouterAvecReessai(() => onSnapshot(ref, ok, ko), toujoursValable)
export function ecouterAvecReessai(abonner, toujoursValable, essai = 0) {
    let arret = null, fini = false;
    const lancer = (n) => {
        arret = abonner((err) => {
            if (fini) return;
            if (err?.code === "permission-denied" && n < 4 && toujoursValable()) {
                setTimeout(() => { if (!fini && toujoursValable()) lancer(n + 1); }, 800 * (n + 1));
            } else console.error(err);
        });
    };
    lancer(essai);
    return () => { fini = true; arret?.(); };
}
