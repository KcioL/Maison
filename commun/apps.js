// ==========================================
// LISTE DES APPLIS DU SITE
// Pour ajouter une appli :
//   1. crée son dossier avec une page principale (ex. budget/index.html)
//   2. dans cette page : <script src="../commun/theme.js"></script> dans le <head>,
//      <body data-app="budget">
//      et <script type="module" src="../commun/nav.js"></script>
//   3. ajoute un bloc ci-dessous avec href: "budget/"
//      (short = nom court affiché dans la barre d'onglets du téléphone,
//       logo = image ronde, chemin depuis la racine ; sinon l'emoji icon est utilisé)
// Elle apparaîtra dans le menu et dans la barre du haut.
// Les liens (href) sont relatifs à la racine du site.
// ==========================================
export const APPS = [
    {
        id: "dashboard",
        name: "Dashboard",
        short: "Dashboard",
        icon: "🏠",
        logo: "commun/logos/courses-192.png",
        desc: "Horloge, météo, roue du destin et liste de courses.",
        href: "dashboard/",
        color: "#e07a5f"
    },
    {
        id: "stock",
        name: "Gestion des stocks",
        short: "Stock",
        icon: "📦",
        logo: "commun/logos/stock-192.png",
        desc: "Frigo, placards, congélateur : ce qu'il reste et ce qu'il faut racheter.",
        href: "stock/",
        color: "#81a88d"
    },
    {
        id: "recettes",
        name: "Recettes",
        short: "Recettes",
        icon: "📖",
        logo: "recettes/icons/icon-192.png",
        desc: "Le carnet de recettes de Jenigger, avec les photos et les liens d'inspiration.",
        href: "recettes/",
        color: "#9c88d8"
    }
];
