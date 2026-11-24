// ==========================================
// SERVICE DE RAPPELS (Cloudflare Workers, offre gratuite)
// À coller tel quel dans un Worker Cloudflare (voir README.md).
//
// Le site ouvre une adresse du type :
//   https://rappel-maison.<ton-compte>.workers.dev/?titre=Vidange&description=5W30&debut=2026-11-27T17:00:00Z&duree=30
// et ce petit service renvoie un évènement d'agenda (.ics) avec une alerte à l'heure de l'évènement.
// L'iPhone affiche alors « Ajouter au calendrier », puis une notification à l'heure dite.
// Rien n'est enregistré : tout est dans l'adresse.
// ==========================================
const deux = (n) => String(n).padStart(2, "0");
const utc = (d) => `${d.getUTCFullYear()}${deux(d.getUTCMonth() + 1)}${deux(d.getUTCDate())}T${deux(d.getUTCHours())}${deux(d.getUTCMinutes())}${deux(d.getUTCSeconds())}Z`;
const echapper = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// lignes de 75 octets au plus (règle du format), sans couper un caractère
function plier(l) {
    const enc = new TextEncoder(), out = [];
    let ligne = "", taille = 0;
    for (const c of l) {
        const n = enc.encode(c).length;
        if (taille + n > 73) { out.push(ligne); ligne = " "; taille = 1; }
        ligne += c; taille += n;
    }
    out.push(ligne);
    return out.join("\r\n");
}

export default {
    async fetch(request) {
        const p = new URL(request.url).searchParams;
        const debut = new Date(p.get("debut") || "");
        if (isNaN(debut)) return new Response("Il manque la date du rappel (debut).", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        const titre = (p.get("titre") || "Rappel").slice(0, 200);
        const description = (p.get("description") || "").slice(0, 1500);
        const duree = Math.min(Math.max(parseInt(p.get("duree") || "30", 10) || 30, 5), 1440);
        const fin = new Date(debut.getTime() + duree * 60000);
        const ics = [
            "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Maison//Rappels//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            `UID:${crypto.randomUUID()}@maison`,
            `DTSTAMP:${utc(new Date())}`,
            `DTSTART:${utc(debut)}`,
            `DTEND:${utc(fin)}`,
            plier(`SUMMARY:${echapper(titre)}`),
            plier(`DESCRIPTION:${echapper(description)}`),
            "BEGIN:VALARM", "ACTION:DISPLAY", plier(`DESCRIPTION:${echapper(titre)}`), "TRIGGER;VALUE=DURATION:PT0S", "END:VALARM",
            "END:VEVENT", "END:VCALENDAR", ""
        ].join("\r\n");
        return new Response(ics, {
            headers: {
                "Content-Type": "text/calendar; charset=utf-8",
                "Content-Disposition": 'attachment; filename="rappel.ics"',
                "Cache-Control": "no-store"
            }
        });
    }
};
