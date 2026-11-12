// ==========================================
// LISTE DES APPLIS DU SITE
// Pour ajouter une appli :
//   1. crée son dossier avec une page principale (ex. budget/index.html)
//   2. dans cette page : <body data-app="budget">
//      et <script type="module" src="../commun/nav.js"></script>
//   3. ajoute un bloc ci-dessous avec href: "budget/"
// Elle apparaîtra dans le menu et dans la barre du haut.
// Les liens (href) sont relatifs à la racine du site.
// ==========================================
export const APPS = [
    {
        id: "dashboard",
        name: "Dashboard",
        icon: "🏠",
        desc: "Horloge, météo, roue du destin et liste de courses.",
        href: "dashboard/",
        color: "#e07a5f"
    },
    {
        id: "stock",
        name: "Gestion des stocks",
        icon: "📦",
        desc: "Frigo, placards, congélateur : ce qu'il reste et ce qu'il faut racheter.",
        href: "stock/",
        color: "#81a88d"
    },
    {
        id: "recettes",
        name: "Recettes",
        icon: "📖",
        desc: "Le carnet de recettes de Jenigger, avec les photos et les liens d'inspiration.",
        href: "recettes/",
        color: "#9c88d8"
    }
];
