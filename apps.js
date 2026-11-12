// ==========================================
// LISTE DES APPLIS DU SITE
// Pour ajouter une appli : crée sa page (ex. "budget.html"),
// mets <body data-app="budget"> et <script type="module" src="nav.js">,
// puis ajoute une ligne ici. Elle apparaîtra dans le menu et la barre du haut.
// ==========================================
export const APPS = [
    {
        id: "dashboard",
        name: "Dashboard",
        icon: "🏠",
        desc: "Horloge, météo, roue du destin et liste de courses.",
        href: "dashboard.html",
        color: "#e07a5f"
    },
    {
        id: "stock",
        name: "Gestion des stocks",
        icon: "📦",
        desc: "Frigo, placards, congélateur : ce qu'il reste et ce qu'il faut racheter.",
        href: "stock.html",
        color: "#81a88d"
    }
];
