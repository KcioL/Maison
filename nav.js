// ==========================================
// BARRE DE NAVIGATION ENTRE LES APPLIS
// Ajoutée automatiquement en haut de chaque page qui charge ce script.
// La page courante est indiquée par <body data-app="...">.
// ==========================================
import { APPS } from "./apps.js";

const current = document.body.dataset.app;
const nav = document.createElement("nav");
nav.className = "app-nav";

const home = document.createElement("a");
home.href = "index.html";
home.className = "app-nav-home";
home.textContent = "☰ Menu";
nav.appendChild(home);

const links = document.createElement("div");
links.className = "app-nav-links";
APPS.forEach(a => {
    const link = document.createElement("a");
    link.href = a.href;
    link.textContent = `${a.icon} ${a.name}`;
    if (a.id === current) {
        link.className = "active";
        link.setAttribute("aria-current", "page");
    }
    links.appendChild(link);
});
nav.appendChild(links);

document.body.prepend(nav);
