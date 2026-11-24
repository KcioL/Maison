// ==========================================
// RAPPELS SUR LE TÉLÉPHONE
// Un site ne peut pas programmer seul une notification pour plus tard
// (il faudrait un serveur payant). On passe donc par l'agenda du téléphone :
// l'appli crée un évènement avec une alerte à l'heure voulue, qui sonne
// même quand le site est fermé.
//   - « Agenda du téléphone » : un fichier .ics (iPhone : Calendrier,
//     Android : Google Agenda ou l'agenda du téléphone, ordinateur : Outlook…)
//   - « Google Agenda » : la page d'ajout d'évènement de Google Agenda
//   L'évènement contient une alerte à l'heure choisie : le téléphone affiche
//   une notification à ce moment-là, sans avoir à ouvrir l'agenda.
//
//   ficheRappel({ titre, description, quandChoisi: (date) => … })
// ==========================================
import { esc, ouvrirFeuille, toast } from "./ui.js";

const deux = (n) => String(n).padStart(2, "0");
const local = (d) => `${d.getFullYear()}${deux(d.getMonth() + 1)}${deux(d.getDate())}T${deux(d.getHours())}${deux(d.getMinutes())}00`;
const utc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const echapper = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// lignes de 75 octets au plus (règle du format), sans couper un caractère en deux
const plier = (l) => {
    const enc = new TextEncoder(), out = [];
    let ligne = "", taille = 0;
    for (const c of l) {
        const n = enc.encode(c).length;
        if (taille + n > 73) { out.push(ligne); ligne = " "; taille = 1; }
        ligne += c; taille += n;
    }
    out.push(ligne);
    return out.join("\r\n");
};

export function fichierIcs({ titre, description = "", debut, dureeMin = 30 }) {
    const fin = new Date(debut.getTime() + dureeMin * 60000);
    return [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Maison//Rappels//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@maison`,
        `DTSTAMP:${utc(new Date())}`,
        `DTSTART:${local(debut)}`,       // heure locale du téléphone
        `DTEND:${local(fin)}`,
        plier(`SUMMARY:${echapper(titre)}`),
        plier(`DESCRIPTION:${echapper(description)}`),
        "BEGIN:VALARM", "ACTION:DISPLAY", plier(`DESCRIPTION:${echapper(titre)}`), "TRIGGER;VALUE=DURATION:PT0S", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR", ""
    ].join("\r\n");
}

export function lienGoogleAgenda({ titre, description = "", debut, dureeMin = 30 }) {
    const fin = new Date(debut.getTime() + dureeMin * 60000);
    const p = new URLSearchParams({ action: "TEMPLATE", text: titre, details: description, dates: `${local(debut)}/${local(fin)}` });
    return `https://calendar.google.com/calendar/render?${p}`;
}

const estIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Ouvre le fichier .ics : l'iPhone propose « Ajouter au calendrier », Android ouvre l'agenda
// Adresse de TON service de rappels sur Cloudflare (voir cloudflare/rappel-worker.js).
// Tant qu'elle est vide, on utilise le service public ics.agical.io.
//   ex. "https://rappel-maison.mon-compte.workers.dev"
export const SERVICE_RAPPELS = "https://rappel-maison.gardien64.workers.dev";

// iPhone : Apple refuse les fichiers d'agenda fabriqués par la page elle-même
// (rien ne s'affiche). Il faut une vraie adresse internet qui renvoie l'évènement :
// on utilise le service gratuit ics.agical.io, qui fabrique le fichier à partir des
// informations passées dans l'adresse (titre, date, description, alerte).
// L'iPhone affiche alors l'évènement avec « Ajouter au calendrier ».
export function lienIcsEnLigne({ titre, description = "", debut, dureeMin = 30 }) {
    if (SERVICE_RAPPELS) {
        const q = new URLSearchParams({ titre, description, debut: debut.toISOString(), duree: String(dureeMin) });
        return `${SERVICE_RAPPELS.replace(/\/+$/, "")}/?${q}`;
    }
    const p = new URLSearchParams({
        subject: titre, description, dtstart: debut.toISOString().replace(/\.\d{3}Z$/, "Z"),
        duration: `${dureeMin}M`, reminder: "0"
    });
    return `https://ics.agical.io/?${p}`;
}

export function ouvrirIcs(ics, nom = "rappel.ics", evenement = null) {
    if (estIOS() && evenement) { location.href = lienIcsEnLigne(evenement); return; }
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- Les moments proposés ----------
function a(d, h, m = 0) { const x = new Date(d); x.setHours(h, m, 0, 0); return x; }
function plusJours(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function momentsProposes(maintenant = new Date()) {
    const l = [];
    const ceSoir = a(maintenant, 18);
    if (maintenant < a(maintenant, 17, 30)) l.push({ id: "soir", nom: "Ce soir 18 h", date: ceSoir });
    l.push({ id: "demain", nom: "Demain 18 h", date: a(plusJours(maintenant, 1), 18) });
    // le prochain vendredi 18 h (pas aujourd'hui ni demain : déjà proposés)
    let v = plusJours(maintenant, 1);
    while (v.getDay() !== 5 || v <= a(plusJours(maintenant, 1), 23)) v = plusJours(v, 1);
    l.push({ id: "vendredi", nom: `Vendredi ${v.getDate()} à 18 h`, date: a(v, 18) });
    let s = plusJours(maintenant, 1);
    while (s.getDay() !== 6) s = plusJours(s, 1);
    l.push({ id: "samedi", nom: `Samedi ${s.getDate()} à 10 h`, date: a(s, 10) });
    l.push({ id: "semaine", nom: "Dans une semaine", date: a(plusJours(maintenant, 7), 18) });
    l.sort((x, y) => x.date - y.date);
    return l.filter((x, i) => !l.slice(0, i).some(y => +y.date === +x.date));
}
// Par défaut : le vendredi 18 h qui vient (s'il est dans les 4 jours), sinon demain 18 h
export function momentParDefaut(l, maintenant = new Date()) {
    const v = l.find(x => x.id === "vendredi");
    if (v && (v.date - maintenant) / 864e5 <= 4.5) return v.id;
    if (maintenant.getDay() === 4 || (maintenant.getDay() === 5 && maintenant < a(maintenant, 17, 30))) return l.find(x => x.id === (maintenant.getDay() === 5 ? "soir" : "demain"))?.id || l[0].id;
    return "demain";
}

const dateLongue = (d) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const isoJour = (d) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;

// La fenêtre « Me le rappeler »
export function ficheRappel({ titre, description = "", intro = "", nomFichier = "rappel.ics", quandChoisi = () => {} }) {
    const moments = momentsProposes();
    let choix = momentParDefaut(moments);
    const f = ouvrirFeuille({ titre: "🔔 Me le rappeler" });
    const dateChoisie = () => {
        if (choix !== "autre") return moments.find(m => m.id === choix).date;
        const cj = f.corps.querySelector("[name=jour]"), ch = f.corps.querySelector("[name=heure]");
        if (!cj) return dernier;      // le champ n'est pas encore affiché : on part du dernier moment choisi
        const j = cj.value, h = ch?.value || "18:00";
        if (!j) return null;
        const [an, mo, da] = j.split("-").map(Number), [hh, mi] = h.split(":").map(Number);
        return new Date(an, mo - 1, da, hh, mi);
    };
    let dernier = moments.find(m => m.id === choix)?.date || moments[0].date;
    const dessiner = () => {
        const d = dateChoisie();
        if (d) dernier = d;
        f.corps.innerHTML = `<div class="rappel-feuille">
            ${intro ? `<p>${intro}</p>` : ""}
            <p class="rappel-quoi"><b>${esc(titre)}</b>${description ? `<small>${esc(description).replace(/\n/g, "<br>")}</small>` : ""}</p>
            <div class="rappel-moments" role="group" aria-label="Quand">
                ${moments.map(m => `<button type="button" class="rappel-moment ${choix === m.id ? "actif" : ""}" data-moment="${m.id}" aria-pressed="${choix === m.id}">${esc(m.nom)}</button>`).join("")}
                <button type="button" class="rappel-moment ${choix === "autre" ? "actif" : ""}" data-moment="autre" aria-pressed="${choix === "autre"}">Autre…</button>
            </div>
            ${choix === "autre" ? `<div class="rappel-autre">
                <label class="champ"><span>Jour</span><input type="date" name="jour" min="${isoJour(new Date())}" value="${d ? isoJour(d) : isoJour(moments[0].date)}"></label>
                <label class="champ"><span>Heure</span><input type="time" name="heure" value="${d ? `${deux(d.getHours())}:${deux(d.getMinutes())}` : "18:00"}"></label>
            </div>` : ""}
            <p class="rappel-quand">${d ? `Rappel le <b>${dateLongue(d)}</b>` : "Choisis un jour."}</p>
            <button type="button" class="bouton principal large" data-ics>🔔 Ajouter le rappel au téléphone</button>
            <a class="bouton large" data-google target="_blank" rel="noopener" href="#">Ajouter à Google Agenda</a>
            <p class="muet petit">${estIOS()
                ? "L'iPhone propose « Ajouter au calendrier » : touche-le. Au moment choisi, une <b>notification</b> s'affiche sur l'écran, comme un rappel, même si tu n'ouvres jamais le calendrier. (Si rien ne s'affiche : Réglages › Notifications › Calendrier › Autoriser les notifications.)"
                : "Le rappel arrive dans ton agenda, avec une alerte à l'heure choisie : une notification s'affiche à ce moment-là, même si le site est fermé."}</p>
        </div>`;
        majGoogle();
    };
    const majGoogle = () => {
        const d = dateChoisie(), g = f.corps.querySelector("[data-google]");
        if (g) g.href = d ? lienGoogleAgenda({ titre, description, debut: d }) : "#";
    };
    f.corps.addEventListener("click", (e) => {
        const m = e.target.closest("[data-moment]");
        if (m) { choix = m.dataset.moment; dessiner(); return; }
        const d = dateChoisie();
        if (e.target.closest("[data-ics]")) {
            if (!d) { toast("Choisis un jour pour le rappel."); return; }
            ouvrirIcs(fichierIcs({ titre, description, debut: d }), nomFichier, { titre, description, debut: d });
            quandChoisi(d);
            setTimeout(() => f.fermer(), 300);
        } else if (e.target.closest("[data-google]")) {
            if (!d) { e.preventDefault(); toast("Choisis un jour pour le rappel."); return; }
            quandChoisi(d);
            setTimeout(() => f.fermer(), 300);
        }
    });
    f.corps.addEventListener("input", (e) => {
        if (e.target.matches("[name=jour], [name=heure]")) {
            const d = dateChoisie();
            f.corps.querySelector(".rappel-quand").innerHTML = d ? `Rappel le <b>${dateLongue(d)}</b>` : "Choisis un jour.";
            majGoogle();
        }
    });
    dessiner();
    return f;
}
