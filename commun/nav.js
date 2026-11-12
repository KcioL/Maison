// ==========================================
// BARRE DE NAVIGATION ENTRE LES APPLIS
// Ajoutée automatiquement en haut de chaque page qui charge ce script.
//   <body data-app="...">         l'appli courante (mise en évidence)
//   <body data-nav="bandeau">     version bandeau pleine largeur
//                                  (pour les applis qui ont leur propre style)
// Les liens marchent depuis n'importe quel dossier d'appli.
// Le bouton clair / sombre vient de commun/theme.js (à charger dans le <head>).
// ==========================================
import { APPS } from "./apps.js";

// racine du site = dossier parent de commun/
const racine = new URL("../", import.meta.url);
const current = document.body.dataset.app;
const bandeau = document.body.dataset.nav === "bandeau";

// Une appli installée sur l'écran d'accueil (mode « appli ») n'affiche pas la barre
const installee = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
if (!(bandeau && installee)) {
    const style = document.createElement("style");
    style.textContent = `
.app-nav {
    display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap;
    max-width: 1200px; margin: -0.5rem auto 2rem; padding: 0.5rem;
    background: var(--glass, rgba(255, 255, 255, 0.85)); backdrop-filter: blur(6px);
    border-radius: 999px; box-shadow: var(--card-shadow, 0 12px 35px rgba(138, 121, 104, 0.08));
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.3;
}
.app-nav a, .app-nav .app-nav-theme {
    text-decoration: none; color: var(--text-main, #4a443c); font-weight: 500;
    padding: 0.5rem 1rem; border-radius: 999px; white-space: nowrap;
    transition: background 0.2s, color 0.2s;
}
.app-nav a:hover, .app-nav .app-nav-theme:hover { background: var(--hover-bg, #f4eee8); }
.app-nav a:focus-visible, .app-nav .app-nav-theme:focus-visible { outline: 2px solid var(--accent, #e07a5f); outline-offset: 2px; }
.app-nav .app-nav-home { background: var(--strong-bg, #4a443c); color: var(--strong-text, #fff); font-weight: 700; }
.app-nav .app-nav-home:hover { background: var(--strong-hover, #2d2924); }
.app-nav-links { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.app-nav-links a.active { background: var(--accent, #e07a5f); color: var(--on-accent, #fff); }
.app-nav .app-nav-theme {
    margin-left: auto; border: none; background: none; cursor: pointer;
    font: inherit; padding: 0.5rem 1rem; border-radius: 999px; white-space: nowrap;
}
.app-nav.bandeau {
    max-width: none; margin: 0; border-radius: 0; box-shadow: none;
    border-bottom: 1px solid var(--hover-bg, rgba(0, 0, 0, 0.06)); background: var(--card-bg, #fff);
    padding: calc(0.4rem + env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) 0.4rem max(12px, env(safe-area-inset-left, 0px));
    font-size: 14px;
}
.app-nav.bandeau a, .app-nav.bandeau .app-nav-theme { padding: 0.35rem 0.8rem; }
@media (max-width: 600px) {
    .app-nav { border-radius: 20px; }
    .app-nav.bandeau { border-radius: 0; }
}`;
    document.head.appendChild(style);

    const nav = document.createElement("nav");
    nav.className = "app-nav" + (bandeau ? " bandeau" : "");
    nav.setAttribute("aria-label", "Applis");

    const home = document.createElement("a");
    home.href = new URL("index.html", racine).href;
    home.className = "app-nav-home";
    home.textContent = "☰ Menu";
    nav.appendChild(home);

    const links = document.createElement("div");
    links.className = "app-nav-links";
    APPS.forEach(a => {
        const link = document.createElement("a");
        link.href = new URL(a.href, racine).href;
        link.textContent = `${a.icon} ${a.name}`;
        if (a.id === current) {
            link.className = "active";
            link.setAttribute("aria-current", "page");
        }
        links.appendChild(link);
    });
    nav.appendChild(links);

    // bouton clair / sombre (commun/theme.js)
    if (window.Theme) nav.appendChild(window.Theme.bouton("app-nav-theme"));

    document.body.prepend(nav);
}
