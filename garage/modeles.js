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
export const CAPACITES = {
    moto: ["Huile moteur", "Liquide de refroidissement", "Liquide de frein", "Huile de fourche (par tube)", "Chaîne (référence)", "Pneus (dimensions)", "Bougies (référence)", "Batterie", "Réservoir d'essence"],
    voiture: ["Huile moteur", "Liquide de refroidissement", "Liquide de frein", "Lave-glace", "Boîte de vitesses", "Pneus (dimensions)", "Batterie", "Réservoir de carburant"],
    scooter: ["Huile moteur", "Huile de transmission", "Liquide de frein", "Courroie (référence)", "Pneus (dimensions)", "Bougie (référence)", "Batterie"],
    velo: ["Pneus (dimensions)", "Chaîne (référence)", "Cassette", "Plaquettes de frein", "Liquide de frein (huile minérale / DOT)"],
    autre: ["Huile", "Pneus (dimensions)", "Batterie"]
};
