// =====================================================================
// AP2M · L'envoi d'une notification poussée, à la main.
// Repris tel quel de la fonction depot-notif (outil ETU), déjà en service.
//
//   RFC 8188 — le format du contenu chiffré (aes128gcm) ;
//   RFC 8291 — comment on en tire la clé à partir de l'abonnement.
// =====================================================================

const enc = new TextEncoder();

export function b64urlVersOctets(s: string): Uint8Array {
  const base = s.replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  const out = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) out[i] = brut.charCodeAt(i);
  return out;
}

export function octetsVersB64url(o: Uint8Array): string {
  let s = "";
  for (const b of o) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function coller(...morceaux: Uint8Array[]): Uint8Array {
  const total = morceaux.reduce((n, m) => n + m.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const m of morceaux) { out.set(m, i); i += m.length; }
  return out;
}

/** Les 32 octets de X et les 32 de Y d'un point P-256 non compressé. */
function pointXY(brut: Uint8Array) {
  if (brut.length !== 65 || brut[0] !== 4) throw new Error("clé publique P-256 attendue");
  return { x: brut.slice(1, 33), y: brut.slice(33, 65) };
}

async function importerPublique(brut: Uint8Array) {
  const { x, y } = pointXY(brut);
  return crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256",
    x: octetsVersB64url(x), y: octetsVersB64url(y),
  }, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function importerPrivee(publique: Uint8Array, d: Uint8Array, usage: "ECDH" | "ECDSA") {
  const { x, y } = pointXY(publique);
  return crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256",
    x: octetsVersB64url(x), y: octetsVersB64url(y), d: octetsVersB64url(d),
  }, { name: usage, namedCurve: "P-256" }, false,
     usage === "ECDH" ? ["deriveBits"] : ["sign"]);
}

async function hkdf(sel: Uint8Array, ikm: Uint8Array, info: Uint8Array, taille: number) {
  const cle = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: sel, info }, cle, taille * 8);
  return new Uint8Array(bits);
}

export type Abonnement = {
  endpoint: string;
  /** La clé publique du téléphone, en base64url. */
  p256dh: string;
  /** Le secret d'authentification du téléphone, en base64url. */
  auth: string;
};

export async function chiffrer(
  abonnement: Abonnement, message: string,
  fixe?: { sel: Uint8Array; serveurPublique: Uint8Array; serveurPrivee: Uint8Array },
): Promise<Uint8Array> {
  const uaPub = b64urlVersOctets(abonnement.p256dh);
  const authSecret = b64urlVersOctets(abonnement.auth);

  let asPub: Uint8Array, asPriv: CryptoKey;
  if (fixe) {
    asPub = fixe.serveurPublique;
    asPriv = await importerPrivee(fixe.serveurPublique, fixe.serveurPrivee, "ECDH");
  } else {
    const paire = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
    asPub = new Uint8Array(await crypto.subtle.exportKey("raw", paire.publicKey));
    asPriv = paire.privateKey;
  }
  const sel = fixe ? fixe.sel : crypto.getRandomValues(new Uint8Array(16));

  const partage = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: await importerPublique(uaPub) }, asPriv, 256));

  const infoCle = coller(enc.encode("WebPush: info"), new Uint8Array([0]), uaPub, asPub);
  const ikm = await hkdf(authSecret, partage, infoCle, 32);

  const cek = await hkdf(sel, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sel, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const cleAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const clair = coller(enc.encode(message), new Uint8Array([2]));
  const chiffre = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce }, cleAes, clair));

  const taille = new Uint8Array(4);
  new DataView(taille.buffer).setUint32(0, 4096);
  return coller(sel, taille, new Uint8Array([asPub.length]), asPub, chiffre);
}

export async function jetonVapid(
  endpoint: string, sujet: string,
  publique: Uint8Array, privee: Uint8Array, expire?: number,
): Promise<string> {
  const origine = new URL(endpoint).origin;
  const entete = octetsVersB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corps = octetsVersB64url(enc.encode(JSON.stringify({
    aud: origine,
    exp: expire ?? Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: sujet,
  })));
  const cle = await importerPrivee(publique, privee, "ECDSA");
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, cle, enc.encode(`${entete}.${corps}`)));
  return `${entete}.${corps}.${octetsVersB64url(signature)}`;
}

export type Reglages = {
  publique: string;    // base64url
  privee: string;      // base64url
  sujet: string;       // mailto:…
  fetch?: typeof fetch;
};

export type Resultat =
  | { ok: true; statut: number }
  | { ok: false; statut: number; perime: boolean; detail: string };

export async function envoyer(
  r: Reglages, abonnement: Abonnement, message: string,
): Promise<Resultat> {
  const f = r.fetch ?? fetch;
  const corps = await chiffrer(abonnement, message);
  const jeton = await jetonVapid(
    abonnement.endpoint, r.sujet,
    b64urlVersOctets(r.publique), b64urlVersOctets(r.privee));

  const rep = await f(abonnement.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jeton}, k=${r.publique}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body: corps,
  });

  if (rep.ok) return { ok: true, statut: rep.status };
  const detail = await rep.text().catch(() => "");
  return {
    ok: false, statut: rep.status,
    perime: rep.status === 404 || rep.status === 410,
    detail: detail.slice(0, 200),
  };
}
