// ==========================================
// PETITS OUTILS D'INTERFACE COMMUNS
//   toast("…")              message en bas de l'écran
//   ouvrirFeuille({ titre }) panneau par-dessus la page (bas de l'écran sur téléphone,
//                           au centre sur ordinateur) ; renvoie { corps, fermer }
//   esc(texte)              texte sûr à insérer dans du HTML
// Styles dans coquille.css (.toast-site, .feuille…)
// ==========================================

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let zoneToast, minuteur;
export function toast(message) {
    if (!zoneToast) {
        zoneToast = document.createElement("div");
        zoneToast.className = "toast-site";
        zoneToast.setAttribute("role", "status");
        document.body.appendChild(zoneToast);
    }
    zoneToast.textContent = message;
    zoneToast.classList.add("visible");
    clearTimeout(minuteur);
    minuteur = setTimeout(() => zoneToast.classList.remove("visible"), 3500);
}

export function ouvrirFeuille({ titre, quandFerme } = {}) {
    const fond = document.createElement("div");
    fond.className = "feuille-fond";
    fond.innerHTML = `<section class="feuille" role="dialog" aria-modal="true">
        <div class="feuille-tete"><h2></h2><button type="button" class="feuille-fermer" aria-label="Fermer">✕</button></div>
        <div class="feuille-corps"></div></section>`;
    fond.querySelector("h2").textContent = titre || "";
    const feuille = fond.querySelector(".feuille");
    const corps = fond.querySelector(".feuille-corps");

    const fermer = () => {
        if (!fond.isConnected) return;
        document.removeEventListener("keydown", surTouche);
        fond.classList.add("sortie");
        setTimeout(() => fond.remove(), 180);
        quandFerme?.();
    };
    const surTouche = (e) => { if (e.key === "Escape") fermer(); };
    fond.addEventListener("click", (e) => { if (e.target === fond) fermer(); });
    fond.querySelector(".feuille-fermer").addEventListener("click", fermer);
    document.addEventListener("keydown", surTouche);
    document.body.appendChild(fond);
    return { fond, feuille, corps, fermer, titre: (t) => { fond.querySelector("h2").textContent = t; } };
}

// Bouton « en deux temps » : un premier appui arme, un second confirme (4 s)
export function boutonConfirmation(bouton, texteConfirmer, action) {
    const texte = bouton.textContent;
    let arme = false, t;
    bouton.addEventListener("click", () => {
        if (!arme) {
            arme = true; bouton.classList.add("arme"); bouton.textContent = texteConfirmer;
            t = setTimeout(() => { arme = false; bouton.classList.remove("arme"); bouton.textContent = texte; }, 4000);
            return;
        }
        clearTimeout(t); arme = false; bouton.classList.remove("arme"); bouton.textContent = texte;
        action();
    });
}
