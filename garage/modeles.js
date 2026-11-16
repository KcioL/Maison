// ==========================================
// GARAGE : modèles d'entretiens et de fiche technique par type de véhicule
// Ce sont des valeurs indicatives : adapte-les au carnet de ton modèle.
//   km    intervalle en kilomètres (null = pas d'alerte au kilométrage)
//   mois  intervalle en mois (null = pas d'alerte au temps)
//   valeur  rappel affiché sur l'entretien (pression, produit, quantité…)
// ==========================================

export const TYPES = [
    { id: "moto", nom: "Moto", emoji: "🏍️" },
    { id: "voiture", nom: "Voiture", emoji: "🚗" },
    { id: "scooter", nom: "Scooter", emoji: "🛵" },
    { id: "velo", nom: "Vélo", emoji: "🚲" },
    { id: "autre", nom: "Autre", emoji: "🔧" }
];
export const typeDe = (id) => TYPES.find(t => t.id === id) || TYPES[TYPES.length - 1];

const t = (nom, km, mois, valeur = null) => ({ nom, km, mois, valeur });

export const ENTRETIENS = {
    moto: [
        t("Pression des pneus", 500, 1, "AV 2,25 bar · AR 2,5 bar"),
        t("Graissage de la chaîne", 500, null, "Après chaque sortie sous la pluie"),
        t("Tension de la chaîne", 1000, null, "Mou : 25 à 35 mm"),
        t("Vidange huile moteur + filtre", 6000, 12, "10W40"),
        t("Purge liquide de frein", null, 24, "DOT 4"),
        t("Liquide de refroidissement", 24000, 24),
        t("Filtre à air", 12000, null),
        t("Bougies", 12000, null),
        t("Kit chaîne (chaîne, pignon, couronne)", 20000, null),
        t("Révision générale", 12000, 12)
    ],
    voiture: [
        t("Pression des pneus", 1500, 1, "Voir l'étiquette dans la portière"),
        t("Vidange huile moteur + filtre", 15000, 12, "5W30"),
        t("Filtre à air", 30000, 24),
        t("Filtre d'habitacle", 15000, 12),
        t("Filtre à carburant", 60000, null),
        t("Purge liquide de frein", null, 24, "DOT 4"),
        t("Liquide de refroidissement", 60000, 48),
        t("Contrôle des plaquettes de frein", 20000, null),
        t("Permutation des pneus", 10000, null),
        t("Courroie de distribution", 120000, 72),
        t("Contrôle technique", null, 24)
    ],
    scooter: [
        t("Pression des pneus", 500, 1, "AV 1,75 bar · AR 2,25 bar"),
        t("Vidange huile moteur", 3000, 12),
        t("Huile de transmission", 6000, 24),
        t("Courroie de variateur", 12000, null),
        t("Galets de variateur", 12000, null),
        t("Filtre à air", 6000, 12),
        t("Bougie", 6000, null),
        t("Purge liquide de frein", null, 24, "DOT 4"),
        t("Révision générale", 6000, 12)
    ],
    velo: [
        t("Pression des pneus", 150, null, "Voir le flanc du pneu"),
        t("Nettoyage et graissage de la chaîne", 200, null),
        t("Contrôle de l'usure de la chaîne", 1000, null),
        t("Réglage des freins", 1000, 6),
        t("Purge des freins hydrauliques", null, 12),
        t("Révision complète", null, 12)
    ],
    autre: [
        t("Révision générale", null, 12)
    ]
};

// Capacités et références proposées sur la fiche technique
export const SOURCE_GENERIQUE = "Valeur indicative (modèle générique) · à vérifier";
export const CAPACITES = {
    moto: ["Huile moteur", "Liquide de refroidissement", "Liquide de frein", "Huile de fourche (par tube)", "Chaîne (référence)", "Pneus (dimensions)", "Bougies (référence)", "Batterie", "Réservoir d'essence"],
    voiture: ["Huile moteur", "Liquide de refroidissement", "Liquide de frein", "Lave-glace", "Boîte de vitesses", "Pneus (dimensions)", "Batterie", "Réservoir de carburant"],
    scooter: ["Huile moteur", "Huile de transmission", "Liquide de frein", "Courroie (référence)", "Pneus (dimensions)", "Bougie (référence)", "Batterie"],
    velo: ["Pneus (dimensions)", "Chaîne (référence)", "Cassette", "Plaquettes de frein", "Liquide de frein (huile minérale / DOT)"],
    autre: ["Huile", "Pneus (dimensions)", "Batterie"]
};

// ==========================================
// PLANS PAR MODÈLE
// Valeurs recherchées pour un modèle précis, avec leurs sources.
// « verifier: true » = pas trouvé dans un document du constructeur
// (source secondaire ou valeur habituelle) : l'appli affiche « à vérifier ».
// Pour ajouter un modèle : copier un bloc, garder des noms d'entretien
// identiques aux modèles génériques quand c'est la même chose.
// ==========================================
const p = (nom, km, mois, valeur = null, verifier = false) => ({ nom, km, mois, valeur, verifier });

export const PLANS = [
    {
        id: "yamaha-yzf-r6-2017",
        type: "moto", marque: "Yamaha", modele: "YZF-R6", annee: 2020,
        titre: "Yamaha YZF-R6 (2017-2020)",
        sources: [
            { nom: "Programme d'entretien du manuel du propriétaire Yamaha (version Europe), repris par MaintenanceSchedule.com", url: "https://maintenanceschedule.com/yamaha-r6-4th-gen-maintenance/" }
        ],
        remarque: "Pression des pneus et mou de chaîne : non trouvés dans les sources, à lire dans le manuel.",
        entretiens: [
            p("Pression des pneus", null, 1, "À froid : voir le manuel", true),
            p("Graissage de la chaîne", 800, null, "Et après chaque lavage ou sortie sous la pluie"),
            p("Tension de la chaîne", 1000, null, "Mou : voir le manuel", true),
            p("Vidange huile moteur", 10000, 12, "Yamalube 10W-40 ou 10W-50"),
            p("Filtre à huile", 20000, null),
            p("Bougies", 20000, null, "NGK CR10EK · écartement 0,6 à 0,7 mm"),
            p("Filtre à air", 40000, null),
            p("Jeu aux soupapes", 40000, null),
            p("Purge liquide de frein", null, 24, "DOT 4"),
            p("Durites de frein", null, 48),
            p("Liquide de refroidissement", null, 36),
            p("Graissage roulements de bras oscillant", 50000, null)
        ],
        capacites: [
            { nom: "Bougies (référence)", valeur: "NGK CR10EK · 0,6 à 0,7 mm" },
            { nom: "Huile moteur", valeur: "10W-40 ou 10W-50 · quantité : voir le manuel" },
            { nom: "Liquide de frein", valeur: "DOT 4" }
        ]
    },
    {
        id: "peugeot-206-14-hdi",
        type: "voiture", marque: "Peugeot", modele: "206 1.4 HDi", annee: 2007,
        titre: "Peugeot 206 1.4 HDi (diesel)",
        sources: [
            { nom: "AD : courroie de distribution de la 206 1.4 HDi", url: "https://www.ad.fr/guides/guide-conseil/distribution/courroie-de-distribution-206-quand-la-changer-et-a-quel-prix" },
            { nom: "auto-abc.eu : huile 5W-30, 3,75 L", url: "https://www.auto-abc.eu/peugeot-206/v8453-2005" },
            { nom: "idgarages : carnet d'entretien 206 (version 1.9 D, la plus proche publiée)", url: "https://www.idgarages.com/fr-fr/entretien/peugeot/carnet-entretien-peugeot-206" }
        ],
        remarque: "Aucun carnet constructeur du 1.4 HDi trouvé en ligne : les intervalles de filtres et de liquides viennent du diesel 1.9 D, à confirmer avec ton carnet.",
        entretiens: [
            p("Pression des pneus", null, 1, "Voir l'étiquette sur la portière conducteur"),
            p("Vidange huile moteur + filtre", 20000, 24, "5W-30 · 3,75 L", true),
            p("Filtre d'habitacle", 20000, 24, null, true),
            p("Filtre à air", 60000, null, null, true),
            p("Filtre à gazole", 60000, null, null, true),
            p("Purge liquide de frein", 60000, 24, "DOT 4", true),
            p("Liquide de refroidissement", 120000, 120, null, true),
            p("Courroie de distribution", 240000, 120, "Kit complet avec galets"),
            p("Contrôle technique", null, 24)
        ],
        capacites: [
            { nom: "Huile moteur", valeur: "5W-30 · 3,75 L avec filtre" }
        ]
    },
    {
        id: "renault-captur-15-dci",
        type: "voiture", marque: "Renault", modele: "Captur 1.5 dCi", annee: 2018,
        titre: "Renault Captur 1.5 dCi (2013-2019)",
        sources: [
            { nom: "idgarages : révision du Captur diesel (2 ans ou 30 000 km)", url: "https://www.idgarages.com/fr-fr/vehicules/renault/renault-captur-revision-generale-diesel" },
            { nom: "AD : courroie de distribution du Captur 1.5 dCi 90", url: "https://www.ad.fr/guides/guide-conseil/distribution/renault-captur-courroie-de-distribution" },
            { nom: "auto-abc.eu : huile, liquide de refroidissement, bougies de préchauffage (dCi 110)", url: "https://www.auto-abc.eu/Renault-Captur/v20211-2017/service" }
        ],
        remarque: "Les sources ne s'accordent pas toutes : le témoin d'entretien du tableau de bord peut demander la vidange plus tôt (trajets courts, ville). Suis-le en priorité.",
        entretiens: [
            p("Pression des pneus", null, 1, "Voir l'étiquette sur la portière conducteur"),
            p("Vidange huile moteur + filtre", 30000, 24, "5W-30 · environ 4,5 L"),
            p("Filtre d'habitacle", 30000, 24, null, true),
            p("Filtre à air", 60000, null, null, true),
            p("Filtre à gazole", 60000, null, null, true),
            p("Purge liquide de frein", null, 24, "DOT 4", true),
            p("Liquide de refroidissement", 90000, 60),
            p("Courroie de distribution", 160000, 72, "Valeur du dCi 90 : vérifie pour le dCi 110"),
            p("Bougies de préchauffage", 120000, null),
            p("Contrôle technique", null, 24)
        ],
        capacites: [
            { nom: "Huile moteur", valeur: "5W-30 · environ 4,5 L à la vidange (4,9 L au total)" },
            { nom: "Liquide de refroidissement", valeur: "5 L" }
        ]
    },
    {
        id: "peugeot-e-3008",
        type: "voiture", marque: "Peugeot", modele: "e-3008", annee: 2026,
        titre: "Peugeot e-3008 électrique (depuis 2024)",
        sources: [],
        remarque: "Aucun plan d'entretien Peugeot publié pour le e-3008 trouvé en ligne. Ces intervalles sont ceux habituels des Peugeot électriques : à confirmer dans le carnet ou l'appli MyPeugeot.",
        entretiens: [
            p("Pression des pneus", null, 1, "Voir l'étiquette sur la portière conducteur"),
            p("Révision (batterie, freins, trains roulants)", 25000, 24, null, true),
            p("Filtre d'habitacle", 25000, 24, null, true),
            p("Purge liquide de frein", null, 24, "DOT 4", true),
            p("Contrôle batterie 12 V", null, 24, null, true),
            p("Contrôle technique", null, 24, "Le premier à 4 ans, puis tous les 2 ans")
        ],
        capacites: []
    }
];
export const plansPour = (type) => PLANS.filter(x => x.type === type);
export const planDe = (id) => PLANS.find(x => x.id === id);

// Texte « source » enregistré sur chaque entretien ajouté depuis un plan
export const sourcePlan = (plan, e) => `${plan.titre}${e.verifier ? " · à vérifier" : ""}`.slice(0, 120);

// ==========================================
// RECONNAÎTRE LES ENTRETIENS DANS UNE INTERVENTION
// « Révision : vidange, filtre à huile, bougies » -> Vidange…, Filtre à huile, Bougies
// Chaque règle : [motif dans le NOM de l'entretien, motif dans le TEXTE de l'intervention].
// La première règle dont le motif de nom correspond s'applique (les plus précises d'abord).
// ==========================================
export const normaliser = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, " ");
const REGLES = [
    [/prechauffage/, /prechauffage/],
    [/bougie/, /\bbougies?\b(?! de prechauffage)/],
    [/filtre a huile/, /filtre (a |d )?huile|vidange[^.;]*filtre|filtre[^.;]*vidange/],
    [/vidange|huile moteur/, /vidange|changement (de l |d )?huile|huile moteur/],
    [/filtre a air/, /filtre (a )?air/],
    [/habitacle/, /habitacle|pollen/],
    [/gazole|carburant/, /gazole|gasoil|filtre (a )?carburant/],
    [/liquide de frein|purge/, /liquide de frein|purge|dot ?[345]/],
    [/durite/, /durite/],
    [/plaquette/, /plaquette/],
    [/refroidissement/, /refroidissement|antigel|liquide de refroid/],
    [/pression/, /pression|gonfl/],
    [/kit chaine/, /kit chaine|pignon|couronne/],
    [/roulement|bras oscillant/, /roulement|bras oscillant/],
    [/tension/, /tension|mou (de )?(la )?chaine|retendu|tendu/],
    [/chaine/, /grais|lubrif/],
    [/soupape/, /soupape/],
    [/distribution/, /distribution/],
    [/courroie/, /courroie/],
    [/galet/, /galet/],
    [/transmission/, /transmission/],
    [/batterie/, /batterie/],
    [/permutation/, /permut/],
    [/controle technique/, /controle technique|\bct\b/],
    [/revision/, /revision/]
];
const MOTS_VIDES = new Set(["de", "la", "le", "les", "du", "des", "et", "a", "au", "aux", "d", "l", "un", "une", "tous", "pour"]);
// Renvoie les ids des entretiens reconnus dans le texte
export function entretiensReconnus(texte, entretiens) {
    const t = normaliser(texte);
    if (!t.trim()) return new Set();
    const ids = new Set();
    for (const e of entretiens) {
        const nom = normaliser(e.nom);
        const regle = REGLES.find(([n]) => n.test(nom));
        let ok;
        if (regle) ok = regle[1].test(t);
        else {
            // entretien perso : tous ses mots importants présents dans le texte
            const mots = nom.split(/[^a-z0-9]+/).filter(m => m.length > 2 && !MOTS_VIDES.has(m));
            ok = mots.length > 0 && mots.every(m => t.includes(m));
        }
        if (ok) ids.add(e.id);
    }
    return ids;
}
