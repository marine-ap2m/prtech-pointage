// =====================================================================
// PR.TECH · Edge Function "prtech-notif"
//
//   POST ?jeton=…  {action:"abonner", abonnement, appareil}  -> le téléphone s'inscrit
//   POST ?jeton=…  {action:"desabonner", endpoint}
//   POST ?jeton=…  {action:"essai"}                         -> une notification tout de suite
//   POST  en-tête x-cron-secret  {action:"rappel"}          -> le rappel de 20 h
//
// pg_cron l'appelle à 18 h et 19 h UTC : seule l'heure qui tombe à 20 h
// à Paris envoie, ce qui suit tout seul l'heure d'été et l'heure d'hiver.
// Le rappel ne part que les jours ouvrés, et seulement si la journée
// n'est pas encore notée.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { envoyer, type Abonnement, type Reglages } from "./webpush.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const estUuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// ---- dates à l'heure de Paris -----------------------------------------
function paris(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour) };
}
const D = (s: string) => new Date(s + "T12:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ajoute = (s: string, n: number) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function paques(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}
function feries(y: number) {
  const p = paques(y);
  return new Set([`${y}-01-01`, ajoute(p, 1), `${y}-05-01`, `${y}-05-08`, ajoute(p, 39), ajoute(p, 50),
    `${y}-07-14`, `${y}-08-15`, `${y}-11-01`, `${y}-11-11`, `${y}-12-25`]);
}
const ouvre = (s: string) => { const w = D(s).getUTCDay(); return w >= 1 && w <= 5 && !feries(+s.slice(0, 4)).has(s); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non gérée" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let corps: Record<string, unknown> = {};
  try { corps = await req.json(); } catch { /* pas de corps */ }
  const action = String(corps.action ?? "");

  const { data: regl } = await sb.from("prtech_reglages").select("cle, valeur")
    .in("cle", ["VAPID_PUBLIQUE", "VAPID_PRIVEE", "VAPID_SUJET", "MISE_EN_SERVICE"]);
  const R = new Map((regl ?? []).map((r: { cle: string; valeur: string }) => [r.cle, (r.valeur ?? "").trim()]));
  const vapid: Reglages | null = R.get("VAPID_PUBLIQUE") && R.get("VAPID_PRIVEE")
    ? { publique: R.get("VAPID_PUBLIQUE")!, privee: R.get("VAPID_PRIVEE")!, sujet: R.get("VAPID_SUJET") || "mailto:contact@ap2m.fr" }
    : null;

  async function diffuser(membreIds: string[], titre: string, texte: string) {
    if (!vapid) return { abonnes: 0, recus: 0 };
    const { data: abonnes } = await sb.from("prtech_push").select("id, endpoint, p256dh, auth")
      .in("membre_id", membreIds).eq("actif", true);
    let recus = 0;
    for (const ab of abonnes ?? []) {
      const res = await envoyer(vapid, ab as unknown as Abonnement, JSON.stringify({ titre, texte, vers: "./" }));
      if (res.ok) {
        recus++;
        await sb.from("prtech_push").update({ dernier_envoi: new Date().toISOString(), dernier_echec: null }).eq("id", ab.id);
      } else if (res.perime) {
        await sb.from("prtech_push").delete().eq("id", ab.id);
      } else {
        await sb.from("prtech_push").update({ dernier_echec: `${res.statut} ${res.detail}` }).eq("id", ab.id);
      }
    }
    return { abonnes: abonnes?.length ?? 0, recus };
  }

  // ---- rappel de 20 h (pg_cron) -----------------------------------------
  if (action === "rappel") {
    const secret = req.headers.get("x-cron-secret") ?? "";
    const { data: ok } = await sb.rpc("prtech_cron_ok", { p_secret: secret });
    if (!ok) return json({ error: "refusé" }, 403);
    const { jour, heure } = paris();
    if (heure !== 20 && !corps.force) return json({ ok: true, rien: `il est ${heure} h à Paris` });
    if (!ouvre(jour) && !corps.force) return json({ ok: true, rien: "jour non ouvré" });

    const depuis = [ajoute(jour, -14), R.get("MISE_EN_SERVICE") || jour].sort().pop()!;
    const { data: notes } = await sb.from("prtech_journees").select("jour").gte("jour", depuis).lte("jour", jour);
    const faits = new Set((notes ?? []).map((n: { jour: string }) => n.jour));
    const manquent: string[] = [];
    for (let d = depuis; d <= jour; d = ajoute(d, 1)) if (ouvre(d) && !faits.has(d)) manquent.push(d);
    if (!manquent.length) return json({ ok: true, rien: "tout est noté" });

    const { data: artisans } = await sb.from("prtech_membres").select("id").eq("role", "artisan").eq("actif", true);
    const aujourdhui = manquent.includes(jour);
    const autres = manquent.length - (aujourdhui ? 1 : 0);
    const titre = aujourdhui ? "Ta journée n'est pas notée" : `${autres} jour${autres > 1 ? "s" : ""} à noter`;
    const texte = (aujourdhui ? "Chantier et heures d'aujourd'hui, ça prend 10 secondes." : "") +
      (aujourdhui && autres ? ` Et ${autres} autre${autres > 1 ? "s" : ""} jour${autres > 1 ? "s" : ""} en attente.` : "") +
      (!aujourdhui ? "Ouvre l'appli, les jours avec un ? t'attendent." : "");
    const r = await diffuser((artisans ?? []).map((a: { id: string }) => a.id), titre, texte);
    return json({ ok: true, manquent, ...r });
  }

  // ---- actions du téléphone (lien personnel) -----------------------------
  const jeton = new URL(req.url).searchParams.get("jeton");
  if (!estUuid(jeton)) return json({ error: "lien invalide" }, 400);
  const { data: m } = await sb.from("prtech_membres").select("id, nom, actif").eq("jeton", jeton).maybeSingle();
  if (!m || !m.actif) return json({ error: "lien invalide" }, 404);

  if (action === "abonner") {
    const a = corps.abonnement as Record<string, unknown> | undefined;
    const endpoint = String(a?.endpoint ?? "");
    const keys = (a?.keys ?? {}) as Record<string, string>;
    if (!endpoint.startsWith("https://") || !keys.p256dh || !keys.auth) return json({ error: "abonnement incomplet" }, 400);
    const { error } = await sb.from("prtech_push").upsert({
      membre_id: m.id, endpoint, p256dh: keys.p256dh, auth: keys.auth,
      appareil: typeof corps.appareil === "string" ? corps.appareil.slice(0, 120) : null,
      actif: true, dernier_echec: null,
    }, { onConflict: "endpoint" });
    if (error) return json({ error: "enregistrement impossible" }, 500);
    return json({ ok: true });
  }
  if (action === "desabonner") {
    const endpoint = String(corps.endpoint ?? "");
    if (endpoint) await sb.from("prtech_push").delete().eq("endpoint", endpoint).eq("membre_id", m.id);
    return json({ ok: true });
  }
  if (action === "essai") {
    if (!vapid) return json({ error: "notifications pas configurées" }, 503);
    const r = await diffuser([m.id], "PR.TECH", `Les notifications arrivent bien, ${m.nom}.`);
    return json({ ok: true, ...r });
  }
  return json({ error: "action inconnue" }, 400);
});
