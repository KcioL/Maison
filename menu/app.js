// ==========================================
// MENU : une tuile par appli (la liste vient de commun/apps.js)
// ==========================================
import { APPS } from "../commun/apps.js";

let racine;

function majDate() {
    const d = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    racine.querySelector("#menu-date").textContent = d.charAt(0).toUpperCase() + d.slice(1);
}

export function demarrer(conteneur) {
    racine = conteneur;
    const grille = racine.querySelector("#app-grid");
    APPS.forEach(a => {
        const tuile = document.createElement("a");
        tuile.className = "app-tile";
        tuile.href = `#/${a.id}`;
        tuile.style.setProperty("--tile-color", a.color);
        tuile.innerHTML = `<span class="app-tile-icon"></span><span class="app-tile-name"></span><span class="app-tile-desc"></span><span class="app-tile-go">Ouvrir →</span>`;
        const ico = tuile.querySelector(".app-tile-icon");
        if (a.logo) {
            ico.classList.add("avec-logo");
            const img = document.createElement("img");
            img.src = a.logo; img.alt = ""; img.width = 128; img.height = 128;
            ico.appendChild(img);
        } else ico.textContent = a.icon;
        tuile.querySelector(".app-tile-name").textContent = a.name;
        tuile.querySelector(".app-tile-desc").textContent = a.desc;
        grille.appendChild(tuile);
    });
    majDate();
}

// la date est remise à jour à chaque retour sur le menu
export function afficher() { majDate(); }
