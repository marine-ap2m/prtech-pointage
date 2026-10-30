/* =====================================================================
   PR.TECH · Pointage et marchés
   Une seule appli, deux vues : Patrice (téléphone) et Marine (ordinateur).
   Les données vivent dans Supabase (tables prtech_*) ; on y accède avec
   le lien personnel (jeton) ou le code PRT-XXXXXX tapé une fois.
   ===================================================================== */
"use strict";

var API = "https://zhgqqaedtmeowpjadtqr.supabase.co";
var CLE = "sb_publishable_a0Qkyol-vdG3EtWxGH4t5Q_JciGIacC";
var JH = 8;

/* ---------------- dates ---------------- */
function pad(n){return String(n).padStart(2,"0");}
function aujourdhui(){var d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
var TODAY=aujourdhui();
var MOIS=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
var JSEM=["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
function D(s){var a=s.split("-");return new Date(Date.UTC(+a[0],a[1]-1,+a[2]));}
function iso(d){return d.toISOString().slice(0,10);}
function add(s,n){var d=D(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);}
function dow(s){return (D(s).getUTCDay()+6)%7;}
function paques(y){var a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),j=((h+l-7*m+114)%31)+1;return y+"-"+pad(mo)+"-"+pad(j);}
var _fer={};
function ferie(s){var y=+s.slice(0,4);if(!_fer[y]){var p=paques(y);_fer[y]=new Set([y+"-01-01",add(p,1),y+"-05-01",y+"-05-08",add(p,39),add(p,50),y+"-07-14",y+"-08-15",y+"-11-01",y+"-11-11",y+"-12-25"]);}return _fer[y].has(s);}
function ouvre(s){return dow(s)<5&&!ferie(s);}
function finMois(s){var d=D(s);return iso(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)));}
function echeance(df){return df?finMois(add(df,45)):null;}   /* 45 jours fin de mois */
function fd(s){if(!s)return "—";var d=D(s);return pad(d.getUTCDate())+"/"+pad(d.getUTCMonth()+1);}
function fdy(s){return s?fd(s)+"/"+s.slice(0,4):"—";}
function fdl(s){var d=D(s);return JSEM[dow(s)]+" "+d.getUTCDate()+" "+MOIS[d.getUTCMonth()];}
function eur(v){return Math.round(v).toLocaleString("fr-FR")+" €";}
function hh(v){v=Math.round(v*10)/10;return v.toLocaleString("fr-FR",{maximumFractionDigits:1})+" h";}
function jj(v){v=Math.round(v*10)/10;return v.toLocaleString("fr-FR",{maximumFractionDigits:1})+" j";}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function uid(){if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==="x"?r:(r&3|8)).toString(16);});}
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}}

var PAL=["#1C9BE6","#2EA85F","#E0761B","#7B4B94","#B0473A","#9A6414","#C2578B"];
var PERSO="#F5A524";
function col(ch){if(ch&&ch.perso)return PERSO;return PAL[(ch.col||0)%PAL.length];}
function tint(c){return c+"2E";}
var STC={c:"#8A93A0",a:"#B45309",f:"#1C9BE6",r:"#B42318",p:"#1E7A4F",n:"#B42318"};
var STL={c:"en cours",a:"à facturer",f:"facturé",r:"en retard",p:"payé",n:"sans marché"};
function tarifTxt(mode,v){return eur(v)+(mode==="heure"?" / h":" / jour");}
function court(ch){var c=(ch.court||"").trim();if(c)return c;var w=(ch.nom||"").trim().split(/\s+/);return w[0]||"";}

/* ---------------- serveur ---------------- */
function rpc(fn,args){
  return fetch(API+"/rest/v1/rpc/"+fn,{method:"POST",headers:{"apikey":CLE,"Content-Type":"application/json"},body:JSON.stringify(args)})
    .then(function(r){return r.text().then(function(t){var j=null;try{j=t?JSON.parse(t):null;}catch(e){}
      if(!r.ok){var err=new Error((j&&(j.message||j.error))||("Erreur "+r.status));err.serveur=true;throw err;}return j;});});
}
var JETON=lsGet("prtech_jeton"), MOI=null, S=null, R=null;
var OUT=[];try{OUT=JSON.parse(lsGet("prtech_outbox"))||[];}catch(e){OUT=[];}
function sauverOut(){lsSet("prtech_outbox",JSON.stringify(OUT));majAttente();}
function pousser(fn,args){OUT.push({fn:fn,args:args});sauverOut();return vider();}
var VIDAGE=null;
function vider(){
  if(VIDAGE)return VIDAGE;
  function suite(){
    if(!OUT.length){majAttente();return Promise.resolve(true);}
    return rpc(OUT[0].fn,OUT[0].args).then(function(){OUT.shift();sauverOut();return suite();},
      function(e){if(e.serveur){OUT.shift();sauverOut();toast("Pas enregistré",e.message);return suite();}majAttente();return false;});
  }
  // L'envoi en cours est libéré quand il se termine, pour que la saisie suivante parte tout de suite.
  VIDAGE=suite().then(function(r){VIDAGE=null;return r;},function(){VIDAGE=null;majAttente();return false;});
  return VIDAGE;
}
// filet de sécurité : ce qui attend repart tout seul
setInterval(function(){if(OUT.length&&JETON)vider();},20000);
window.addEventListener("online",function(){vider().then(function(){recharger();});});
function majAttente(){var el=document.getElementById("pend");if(!el)return;el.hidden=!OUT.length;el.textContent=OUT.length+" modif"+(OUT.length>1?"s":"")+" en attente de réseau";}

function appliquer(d){
  MOI=d.moi;
  S={
    clients:(d.clients||[]).map(function(c){return {id:c.id,nom:c.nom,mode:c.mode,tarif:+c.tarif,tel:c.tel||"",dep:+c.deplacement||0,par:c.cree_par};}),
    chantiers:(d.chantiers||[]).filter(function(c){return !c.archive;}).map(function(c){return {id:c.id,client:c.client_id,nom:c.nom,court:c.court||"",ville:c.ville||"",adresse:c.adresse||"",col:c.couleur||0,debut:c.debut,ant:+c.jours_anterieurs||0,par:c.cree_par,perso:!!c.perso,fixe:!!c.fixe,fin:c.fin||"",jp:+c.jours_perso||0,note:c.note||""};}),
    lots:(d.contrats||[]).filter(function(l){return (d.chantiers||[]).some(function(c){return c.id===l.chantier_id&&!c.archive;});}).map(function(l){return {id:l.id,ch:l.chantier_id,type:l.type,num:l.num,jours:+l.jours,mode:l.mode,prix:+l.prix,montant:l.montant==null?null:+l.montant,st:l.statut,nf:l.num_facture||"",df:l.date_facture||"",dp:l.date_paiement||"",ref:l.ref_commande||"",doc:l.document||""};}),
    P:{}, reg:d.reglages||{}
  };
  S.V={};(d.previsions||[]).forEach(function(v){S.V[v.jour]={serie:v.serie,client:v.client_id,lib:v.libelle||"",h:+v.heures};});
  (d.journees||[]).forEach(function(j){S.P[j.jour]=j.absence?{abs:j.absence}:{it:(j.lignes||[]).map(function(x){return {ch:x.ch,h:+x.h,dep:!!x.dep,note:x.note||""};})};});
  // ce qui n'est pas encore parti (pas de réseau) reste visible
  OUT.forEach(function(o){if(o.fn==="prtech_journee_enregistrer"){var a=o.args;
    if(a.p_absence)S.P[a.p_jour]={abs:a.p_absence};else if(a.p_lignes&&a.p_lignes.length)S.P[a.p_jour]={it:a.p_lignes.map(function(x){return {ch:x.ch,h:+x.h,dep:!!x.dep,note:x.note||""};})};else delete S.P[a.p_jour];}});
  JH=+S.reg.JOURNEE_HEURES||8;
}
function charger(){return rpc("prtech_lire",{p_jeton:JETON}).then(function(d){lsSet("prtech_cache",JSON.stringify(d));appliquer(d);});}
function recharger(){var ae=document.activeElement;if(SH||OUT.length||(ae&&/^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)))return;TODAY=aujourdhui();charger().then(renderAll,function(){});}

function sJour(d){var p=S.P[d];return pousser("prtech_journee_enregistrer",{p_jeton:JETON,p_jour:d,p_absence:p&&p.abs||null,p_lignes:p&&p.it?p.it.map(function(x){var o={ch:x.ch,h:x.h};if(x.dep)o.dep=true;if(x.note)o.note=x.note;return o;}):[]});}
function sClient(c){return pousser("prtech_client_enregistrer",{p_jeton:JETON,p:{id:c.id,nom:c.nom,mode:c.mode,tarif:c.tarif,tel:c.tel||null,deplacement:c.dep||0}});}
function sChantier(c){return pousser("prtech_chantier_enregistrer",{p_jeton:JETON,p:{id:c.id,client_id:c.client||"",nom:c.nom,court:c.court||null,ville:c.ville||null,adresse:c.adresse||null,couleur:c.col,debut:c.debut,jours_anterieurs:c.ant||0,archive:!!c.archive,perso:!!c.perso,fixe:!!c.fixe,fin:c.fin||"",jours_perso:c.jp||"",note:c.note||""}});}
function dClient(id){return pousser("prtech_client_supprimer",{p_jeton:JETON,p_id:id});}
function sLot(l){return pousser("prtech_contrat_enregistrer",{p_jeton:JETON,p:{id:l.id,chantier_id:l.ch,type:l.type,num:l.num,jours:l.jours,mode:l.mode,prix:l.prix,montant:l.montant==null?"":l.montant,statut:l.st,num_facture:l.nf,date_facture:l.df,date_paiement:l.dp,ref_commande:l.ref,document:l.doc}});}

/* jours réservés à l'avance, avant devis ou contrat */
function resa(d){return S.V[d]&&!S.P[d]?S.V[d]:null;}
function resaNom(v){var c=v.client&&clById(v.client);return v.lib||(c?c.nom:"Réservé");}
function resaClient(v){var c=v.client&&clById(v.client);return c?c.nom:"client à préciser";}
function resaCourt(v){var c=v.client&&clById(v.client);return ((c?c.nom:v.lib||"Réservé").trim().split(/\s+/)[0]||"").slice(0,9);}
function series(){var g={};Object.keys(S.V).sort().forEach(function(d){if(S.P[d])return;var v=S.V[d];(g[v.serie]=g[v.serie]||{serie:v.serie,client:v.client,lib:v.lib,h:v.h,jours:[]}).jours.push(d);});
  return Object.keys(g).map(function(k){return g[k];}).sort(function(a,b){return a.jours[0]<b.jours[0]?-1:1;});}
function resaEstime(g){var c=g.client&&clById(g.client);if(!c)return null;return c.mode==="heure"?g.jours.length*g.h*c.tarif:g.jours.length*c.tarif;}
function sPrev(serie,jours,client,lib,h){return pousser("prtech_previsions_enregistrer",{p_jeton:JETON,p:{serie:serie,client_id:client||"",libelle:lib||"",heures:h,jours:jours}});}
function dPrev(jours){return pousser("prtech_previsions_supprimer",{p_jeton:JETON,p_jours:jours});}
function chById(id){return S.chantiers.filter(function(c){return c.id===id;})[0];}
function clById(id){return S.clients.filter(function(c){return c.id===id;})[0];}
function lotById(id){return S.lots.filter(function(l){return l.id===id;})[0];}
function clientOf(ch){var c=clById(ch.client);return c?c.nom:"";}
function lotsOf(chid){return S.lots.filter(function(l){return l.ch===chid;}).sort(function(a,b){return (a.type===b.type?a.num-b.num:(a.type==="M"?-1:1));});}
function lotName(l){return (l.type==="M"?"Marché ":"Avenant ")+l.num;}
function lotShort(l){return (l.type==="M"?"M":"AV")+l.num;}

/* ---------------- moteur : planning en cascade ---------------- */
function chOrder(){return S.chantiers.map(function(c,i){return {c:c,i:i};}).sort(function(a,b){return a.c.debut<b.c.debut?-1:a.c.debut>b.c.debut?1:a.i-b.i;}).map(function(o){return o.c;});}
function compute(){
  var res={days:{},ch:{},lot:{}}, occ={};
  function push(d,e){(res.days[d]=res.days[d]||[]).push(e);}
  var dates=Object.keys(S.P).sort();
  // tâches perso à date fixe : leurs jours sont pris avant tout le reste (week-ends compris)
  S.chantiers.forEach(function(c){if(!c.perso||!c.fixe||!c.fin)return;
    for(var x=c.debut,g0=0;x<=c.fin&&g0<400;x=add(x,1),g0++)if(!S.P[x]){push(x,{ch:c.id,lot:null,kind:"prevu",frac:1});occ[x]=c.id;}});
  chOrder().forEach(function(ch){
    var lots=lotsOf(ch.id), total=0, bounds=[];
    lots.forEach(function(l){bounds.push({l:l,b:total+(+l.jours||0)});total+=(+l.jours||0);
      res.lot[l.id]={faits:0,h:0,reprise:0,prevus:0,du:null,au:null,finit:false};});
    function lotAt(pos){for(var i=0;i<bounds.length;i++)if(pos<bounds[i].b-1e-9)return bounds[i];return bounds[bounds.length-1]||null;}
    function mark(l,d){var s=res.lot[l.id];if(!s.du||d<s.du)s.du=d;if(!s.au||d>s.au)s.au=d;}
    if(ch.perso)total=ch.fixe?nbJours(ch.debut,ch.fin):(ch.jp||0);
    var pos=0, faits=0, hours=0, first=null, last=null, deps=0;
    // jours faits avant la mise en service de l'outil
    var ant=Math.min(ch.ant||0,total||ch.ant||0);
    while(ant>1e-9&&lots.length){var bd=lotAt(pos),take=Math.min(ant,bd.b-pos);if(take<=1e-9)break;
      var s0=res.lot[bd.l.id];s0.faits+=take;s0.h+=take*JH;s0.reprise+=take;pos+=take;ant-=take;faits+=take;hours+=take*JH;}
    dates.forEach(function(d){
      var p=S.P[d]; if(!p.it)return;
      var me=p.it.filter(function(i){return i.ch===ch.id;})[0]; if(!me)return;
      var sum=p.it.reduce(function(a,i){return a+(+i.h||0);},0);
      var frac=p.it.length>1&&sum>0?(+me.h)/sum:1;
      var bd=lotAt(pos), l=bd&&bd.l;
      push(d,{ch:ch.id,lot:l&&l.id,kind:"fait",frac:frac,h:+me.h,dep:!!me.dep,over:lots.length>0&&pos>=total-1e-9});
      if(me.dep)deps++;
      if(l){res.lot[l.id].faits+=frac;res.lot[l.id].h+=(+me.h);mark(l,d);}
      pos+=frac;faits+=frac;hours+=(+me.h);
      if(!first)first=d;last=d;
    });
    // Le planning part de la vraie date de début : les jours passés non notés
    // restent « prévus » (avec un ? à confirmer) tant que personne ne les a saisis.
    var rest=ch.perso&&ch.fixe?0:total-pos, d=ch.debut, planned=[], guard=0;
    if(ch.perso&&ch.fixe)for(var xf=ch.debut,gf=0;xf<=ch.fin&&gf<400;xf=add(xf,1),gf++)if(!S.P[xf])planned.push(xf);
    // un chantier facturé se cale du lundi au vendredi ; une tâche perso aussi le week-end
    while(rest>1e-9 && guard<1500){
      if((ch.perso?true:ouvre(d)) && !S.P[d] && !occ[d] && !S.V[d]){
        var f=Math.min(1,rest), bd2=lotAt(pos), l2=bd2&&bd2.l;
        push(d,{ch:ch.id,lot:l2&&l2.id,kind:"prevu",frac:f});
        occ[d]=ch.id;
        if(l2){res.lot[l2.id].prevus+=f;mark(l2,d);}
        pos+=f;rest-=f;planned.push(d);
      }
      d=add(d,1);guard++;
    }
    lots.forEach(function(l){res.lot[l.id].finit=res.lot[l.id].faits>=(+l.jours)-1e-9;});
    res.ch[ch.id]={dep:deps,total:total,faits:faits,h:hours,restants:Math.max(0,total-faits),depasse:lots.length?Math.max(0,faits-total):0,
      perso:!!ch.perso,sansMarche:!lots.length&&!ch.perso,debut:first||planned[0]||ch.debut,fin:planned.length?planned[planned.length-1]:last,planned:planned};
  });
  R=res;
}
function nbJours(a,b){if(!a||!b||b<a)return 0;return Math.round((D(b)-D(a))/864e5)+1;}
function estPerso(chid){var c=chById(chid);return !!(c&&c.perso);}
function finsSnapshot(){var o={};S.chantiers.forEach(function(c){o[c.id]=R.ch[c.id]&&R.ch[c.id].fin;});return o;}
function diffFins(before){var m=[];chOrder().forEach(function(c){var a=before[c.id],b=R.ch[c.id].fin;if(a&&b&&a!==b)m.push(court(c)+" "+fd(a)+" → "+fd(b));});return m;}

/* déplacements d'un chantier : nombre de jours cochés × forfait du client */
function depCh(ch){var c=clById(ch.client),n=(R.ch[ch.id]&&R.ch[ch.id].dep)||0,pu=c?c.dep||0:0;return {n:n,pu:pu,v:n*pu};}
function etat(l){var s=R.lot[l.id];
  if(l.st==="p")return "p";
  if(l.st==="f")return l.df&&echeance(l.df)<TODAY?"r":"f";
  return s&&s.finit?"a":"c";}
function montant(l){var s=R.lot[l.id];
  if(l.montant!=null)return {v:l.montant,est:false};
  if(l.mode==="heure"){if(s&&s.finit)return {v:s.h*l.prix,est:false};return {v:((s?s.h:0)+(l.jours-(s?Math.min(s.faits,l.jours):0))*JH)*l.prix,est:true};}
  return {v:l.jours*l.prix,est:false};}
function realise(l){var s=R.lot[l.id];if(l.mode==="heure"&&l.montant==null)return s.h*l.prix;return Math.min(s.faits,l.jours)/l.jours*montant(l).v;}
function donnees(filterCh){var h=0;S.lots.forEach(function(l){if(l.mode!=="jour")return;if(filterCh&&l.ch!==filterCh)return;var s=R.lot[l.id];h+=s.h-s.faits*JH;});return h;}
function debutSuivi(){var m=S.reg.MISE_EN_SERVICE||TODAY;return m;}
function manque(d){return d<TODAY&&d>=debutSuivi()&&ouvre(d)&&!S.P[d];}
function argentClient(clid){var t={sig:0,fact:0,enc:0};S.lots.forEach(function(l){var c=chById(l.ch);if(!c||c.client!==clid)return;var m=montant(l).v;t.sig+=m;if(l.st!=="a")t.fact+=m;if(l.st==="p")t.enc+=m;});return t;}

/* ---------------- état à envoyer ---------------- */
function lotEtatTxt(l){var s=R.lot[l.id];
  if(s.finit)return s.au?"terminé le "+fd(s.au):"terminé";
  if(s.faits>0)return jj(s.faits)+" faits, en cours";
  if(s.du&&s.du<TODAY)return "prévu depuis le "+fd(s.du)+", jours pas encore confirmés";
  return "à venir"+(s.du?", à partir du "+fd(s.du):"");}
function blocChantier(ch,o){
  var r=R.ch[ch.id], L=[];
  L.push(ch.nom.toUpperCase()+(ch.ville?" · "+ch.ville:""));
  if(r.sansMarche){L.push("Travaux sans devis signé : "+jj(r.faits)+" réalisés"+(r.faits?(r.debut===r.fin?" (le "+fd(r.debut)+")":" (du "+fd(r.debut)+" au "+fd(r.fin)+")"):""));if(o.h&&r.h>0)L.push("Heures réalisées : "+hh(r.h));var dps=depCh(ch);if(o.f&&dps.n)L.push("Déplacements : "+dps.n+" × "+eur(dps.pu)+" = "+eur(dps.v)+" HT");return L;}
  lotsOf(ch.id).forEach(function(l){L.push("• "+lotName(l)+" : "+jj(+l.jours)+" · "+lotEtatTxt(l));});
  L.push("Total : "+jj(r.total)+" · "+jj(Math.min(r.faits,r.total))+" faits · "+jj(r.restants)+" restants");
  L.push(r.restants>0?"Fin prévue le "+fd(r.fin):"Chantier terminé"+(r.fin?" le "+fd(r.fin):""));
  if(o.h&&r.h>0)L.push("Heures réalisées : "+hh(r.h));
  if(o.f){var sg=0,rf=0,rp=0,en=0;
    L.push("Facturation (HT) :");
    lotsOf(ch.id).forEach(function(l){var m=montant(l),e=etat(l);sg+=m.v;
      L.push("  "+lotName(l)+" : "+eur(m.v)+(m.est?" (estimé)":"")+" · "+(e==="p"?"payé le "+fd(l.dp):e==="f"||e==="r"?"facture "+(l.nf||"")+" du "+fd(l.df)+", échéance "+fdy(echeance(l.df)):e==="a"?"à facturer":"en cours"));
      if(e==="c"||e==="a")rf+=m.v; if(e==="f"||e==="r")rp+=m.v; if(e==="p")en+=m.v;});
    var dpe=depCh(ch);if(dpe.n)L.push("  Déplacements : "+dpe.n+" × "+eur(dpe.pu)+" = "+eur(dpe.v)+" HT, en plus");
    L.push("Signé : "+eur(sg)+" · Encaissé : "+eur(en)+" · Reste à encaisser : "+eur(rp)+" · Reste à facturer : "+eur(rf));}
  return L;
}
function etatTexte(sel,o){
  var L=[];
  if(sel.slice(0,3)==="ch:"){var ch=chById(sel.slice(3));if(!ch)return "";
    L.push("ÉTAT DE CHANTIER au "+fdy(TODAY));L.push("Client : "+clientOf(ch));L.push("");L=L.concat(blocChantier(ch,o));}
  else{var cl=clById(sel.slice(3));if(!cl)return "";
    L.push("ÉTAT CLIENT au "+fdy(TODAY));L.push(cl.nom);
    S.chantiers.filter(function(c){return c.client===cl.id;}).forEach(function(ch){L.push("");L=L.concat(blocChantier(ch,o));});}
  return L.join("\n");
}

/* ---------------- PDF ---------------- */
var PDFOUT={logo:null,lib:false};
function prepPDF(){
  var p1=window.jspdf?Promise.resolve():new Promise(function(ok,ko){var s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";s.onload=ok;s.onerror=function(){ko(new Error("Le PDF demande du réseau."));};document.head.appendChild(s);});
  var p2=PDFOUT.logo?Promise.resolve():fetch("prtech-logo.png").then(function(r){return r.blob();}).then(function(b){return new Promise(function(ok){var fr=new FileReader();fr.onload=function(){PDFOUT.logo=fr.result;ok();};fr.readAsDataURL(b);});});
  return Promise.all([p1,p2]).then(function(){PDFOUT.lib=true;});
}
function pdfTxt(s){return String(s).replace(/[  ]/g," ").replace(/→/g,"->");}
function construirePDF(sel,o){
  var doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"}), g=S.reg, y=14, W=210, M=16;
  if(PDFOUT.logo)doc.addImage(PDFOUT.logo,"PNG",M-3,y-4,30,30);
  doc.setFont("helvetica","bold");doc.setFontSize(15);doc.setTextColor(11,11,12);doc.text(pdfTxt(g.ENT_MARQUE||"PR.TECH"),W-M,y+2,{align:"right"});
  doc.setFont("helvetica","normal");doc.setFontSize(9.5);doc.setTextColor(90,100,114);
  [g.ENT_NOM,g.ENT_ADRESSE,g.ENT_SIRET?"SIRET "+g.ENT_SIRET:null,g.ENT_TEL?"Tél. "+g.ENT_TEL:null].filter(Boolean).forEach(function(t,i){doc.text(pdfTxt(t),W-M,y+8+i*4.6,{align:"right"});});
  y=46;doc.setDrawColor(56,182,255);doc.setLineWidth(1.2);doc.line(M,y,W-M,y);y+=9;
  var lignes=etatTexte(sel,o).split("\n");
  lignes.forEach(function(t,i){
    var titre=i===0, entete=/^[A-ZÉÈÀÂÎÔÛÇ0-9 '’.\-·]+( · .*)?$/.test(t)&&t.length>2&&t===t.toUpperCase();
    doc.setTextColor(11,11,12);
    if(titre){doc.setFont("helvetica","bold");doc.setFontSize(14);}
    else if(entete){doc.setFont("helvetica","bold");doc.setFontSize(11.5);y+=1.5;}
    else{doc.setFont("helvetica","normal");doc.setFontSize(10.5);}
    var parts=doc.splitTextToSize(pdfTxt(t)||" ",W-2*M);
    parts.forEach(function(p){if(y>280){doc.addPage();y=18;}doc.text(p,M,y);y+=titre?7:5.4;});
  });
  doc.setFontSize(8.5);doc.setTextColor(150,160,170);
  doc.text(pdfTxt((g.ENT_MARQUE||"PR.TECH")+" · "+(g.ENT_NOM||"")+" · document généré le "+fdy(TODAY)),M,290);
  return doc.output("blob");
}
function nomFichier(sel){var n=sel.slice(0,3)==="ch:"?(chById(sel.slice(3))||{}).nom:(clById(sel.slice(3))||{}).nom;return "prtech-etat-"+String(n||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+TODAY+".pdf";}
function telecharger(blob,nom){var u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=nom;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove();},3000);}
function envoyerPDF(sel,o){
  function go(){
    var blob=construirePDF(sel,o), nom=nomFichier(sel), f;
    try{f=new File([blob],nom,{type:"application/pdf"});}catch(e){f=null;}
    if(f&&navigator.canShare&&navigator.canShare({files:[f]})){
      navigator.share({files:[f],title:"État "+(g0())}).catch(function(e){if(e&&e.name==="AbortError")return;telecharger(blob,nom);});
    }else{telecharger(blob,nom);toast("PDF téléchargé",nom);}
  }
  function g0(){return S.reg.ENT_MARQUE||"PR.TECH";}
  if(PDFOUT.lib)return go();
  prepPDF().then(go,function(e){toast("PDF impossible",e.message+" Utilise « Copier le texte ».");});
}
function copier(txt){
  function sel(){var el=document.getElementById("etat-txt");try{var r=document.createRange();r.selectNodeContents(el);var s=window.getSelection();s.removeAllRanges();s.addRange(r);}catch(e){}toast("Texte sélectionné","Fais Copier pour le coller dans un message");}
  try{navigator.clipboard.writeText(txt).then(function(){toast("Texte copié","Colle-le dans un SMS, WhatsApp ou un mail");},sel);}catch(e){sel();}
}

/* ---------------- notifications ---------------- */
function b64u(s){var b=s.replace(/-/g,"+").replace(/_/g,"/");var r=atob(b+"=".repeat((4-b.length%4)%4)),o=new Uint8Array(r.length);for(var i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o;}
function notifEtat(){
  if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window))return "non";
  if(Notification.permission==="denied")return "refuse";
  return (Notification.permission==="granted"&&lsGet("prtech_push_ok")==="1")?"actif":"inactif";
}
function fnNotif(corps){return fetch(API+"/functions/v1/prtech-notif?jeton="+encodeURIComponent(JETON),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(corps)}).then(function(r){return r.json().catch(function(){return {};}).then(function(j){if(!r.ok)throw new Error(j.error||("Erreur "+r.status));return j;});});}
function activerNotif(){
  Notification.requestPermission().then(function(p){if(p!=="granted")throw new Error("Notifications refusées sur ce téléphone.");return navigator.serviceWorker.ready;})
  .then(function(reg){return reg.pushManager.getSubscription().then(function(s){return s||reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(S.reg.VAPID_PUBLIQUE)});});})
  .then(function(sub){return fnNotif({action:"abonner",abonnement:sub.toJSON(),appareil:navigator.userAgent.slice(0,120)});})
  .then(function(){lsSet("prtech_push_ok","1");return fnNotif({action:"essai"});})
  .then(function(){toast("Rappel activé","Une notification d'essai vient de partir. Ensuite : 20 h, seulement si ta journée n'est pas notée.");renderLui();})
  .catch(function(e){toast("Rappel pas activé",e.message);});
}

/* ---------------- état d'interface ---------------- */
var VIEW="lui", LT="cal", TAB="planning", LM=TODAY.slice(0,7), AM=TODAY.slice(0,7), MODE="ch", SH=null, RF="all", RO={f:true,h:false}, DELARM=null, OUV={};
function monthDays(ym){var y=+ym.slice(0,4),m=+ym.slice(5,7),n=new Date(Date.UTC(y,m,0)).getUTCDate(),a=[];for(var i=1;i<=n;i++)a.push(ym+"-"+pad(i));return a;}
function shiftMonth(ym,k){var y=+ym.slice(0,4),m=+ym.slice(5,7)-1+k;y+=Math.floor(m/12);m=((m%12)+12)%12;return y+"-"+pad(m+1);}
function monthLabel(ym){return MOIS[+ym.slice(5,7)-1]+" "+ym.slice(0,4);}
var ABS="Pas travaillé";
var ABL={"Pas travaillé":"repos","Météo":"pluie","Malade":"malade","Congé":"congé","Perso":"perso","Autre":"autre"};

/* ================= squelette ================= */
function squelette(){
  var gestion=MOI.role==="gestion";
  document.getElementById("racine").innerHTML=
    '<header class="brand"><img src="prtech-logo.png" alt=""><span class="wm">PR<b>.TECH</b></span><span class="who">'+esc(MOI.nom)+'</span><span class="sp"></span><span class="pend" id="pend" hidden></span>'
    +(gestion?'<div class="vsw"><button data-view="moi" aria-pressed="true">Gestion</button><button data-view="lui" aria-pressed="false">Vue Patrice</button></div>':'')+'</header>'
    +'<div id="view-lui"'+(gestion?' class="stage cadre" hidden':'')+'><div class="app" id="app"><div class="appscroll" id="lui"></div>'
    +'<nav class="lnav" id="lnav"><button data-lt="cal" aria-pressed="true"><i></i>Calendrier</button><button data-lt="chs" aria-pressed="false"><i></i>Chantiers</button><button data-lt="cls" aria-pressed="false"><i></i>Clients</button></nav></div></div>'
    +(gestion?'<div id="view-moi" class="stage"><div class="wide"><div class="tabs" id="tabs"><button data-tab="planning" aria-pressed="true">Planning</button><button data-tab="marches" aria-pressed="false">Clients, marchés &amp; avenants</button><button data-tab="heures" aria-pressed="false">Jours vendus / heures faites</button><button data-tab="rapport" aria-pressed="false">Rapport &amp; états</button></div><div id="moi"></div></div></div>':'');
  VIEW=gestion?"moi":"lui";
  majAttente();
}
function setView(v){VIEW=v;
  document.querySelectorAll("[data-view]").forEach(function(b){b.setAttribute("aria-pressed",b.dataset.view===v?"true":"false");});
  var a=document.getElementById("view-lui"),b=document.getElementById("view-moi");if(a)a.hidden=v!=="lui";if(b)b.hidden=v!=="moi";}

/* ================= LUI ================= */
function cellBg(entries){
  var fait=entries.filter(function(e){return e.kind==="fait";}), pv=entries.filter(function(e){return e.kind==="prevu";});
  function grad(list,solid){
    if(list.length===1){var c0=col(chById(list[0].ch));return solid?c0:tint(c0);}
    var tot=list.reduce(function(a,e){return a+e.frac;},0)||1, acc=0, stops=[];
    list.forEach(function(e){var c=col(chById(e.ch)),cc=solid?c:tint(c),a=acc/tot*100;acc+=e.frac;stops.push(cc+" "+a+"% "+(acc/tot*100)+"%");});
    return "linear-gradient(90deg,"+stops.join(",")+")";
  }
  if(fait.length)return {cls:"done",style:"background:"+grad(fait,true),list:fait};
  if(pv.length)return {cls:"pv",style:"background:"+grad(pv,false)+";box-shadow:inset 0 -4px 0 "+col(chById(pv[0].ch)),list:pv};
  return {cls:"",style:"",list:[]};
}
function renderLui(){
  document.querySelectorAll("#lnav button").forEach(function(b){b.setAttribute("aria-pressed",b.dataset.lt===LT?"true":"false");});
  document.getElementById("lui").innerHTML=LT==="cal"?luiCal():LT==="chs"?luiChs():luiCls();
}
function carteNotif(){
  if(MOI.role!=="artisan")return "";
  var e=notifEtat();
  if(e==="actif")return "";
  if(lsGet("prtech_notif_cache")==="1")return "";
  var ios=/iphone|ipad/i.test(navigator.userAgent), autonome=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches||navigator.standalone;
  if(e==="non")return '<div class="carte bleue"><div class="l">Rappel de 20 h</div><div>'+(ios&&!autonome?"Sur iPhone : touche <b>Partager</b> puis <b>Sur l'écran d'accueil</b>, et ouvre PR.TECH depuis l'icône pour activer le rappel.":"Ce téléphone ne reçoit pas les notifications web.")+'</div><button class="bs" data-act="notif-cacher">Plus tard</button></div>';
  if(e==="refuse")return '<div class="carte bleue"><div class="l">Rappel de 20 h</div><div>Les notifications sont bloquées pour PR.TECH. Autorise-les dans les réglages du téléphone.</div><button class="bs" data-act="notif-cacher">Plus tard</button></div>';
  return '<div class="carte bleue"><div class="l">Rappel de 20 h</div><div>Si ta journée n\'est pas notée à 20 h, ton téléphone te le rappelle.</div><div class="row"><button class="bs" data-act="notif-cacher">Plus tard</button><button class="bp" data-act="notif">Activer</button></div></div>';
}
function luiCal(){
  var h="";
  var td=R.days[TODAY]||[], p=S.P[TODAY];
  h+=carteNotif();
  h+='<div class="carte"><div class="l">Aujourd\'hui · '+fdl(TODAY)+'</div>';
  if(p&&p.it){h+=p.it.map(function(i){var c=chById(i.ch);return '<div class="w"><span class="dot" style="background:'+(c?col(c):"#999")+'"></span>'+esc(c?c.nom:"?")+'<span class="muted" style="margin-left:auto;font-weight:700">'+hh(i.h)+'</span></div>';}).join("");
    h+='<button class="bs" data-act="open" data-d="'+TODAY+'">Modifier</button>';}
  else if(p&&p.abs){h+='<div class="w">Pas travaillé'+(p.abs!==ABS?' · '+esc(p.abs):'')+'</div><button class="bs" data-act="open" data-d="'+TODAY+'">Modifier</button>';}
  else{var pv=td.filter(function(e){return e.kind==="prevu";})[0];
    if(pv){var c=chById(pv.ch);h+='<div class="w"><span class="dot" style="background:'+col(c)+'"></span>Prévu : '+esc(c.nom)+'</div>';}
    else h+='<div class="w muted">Rien de prévu</div>';
    h+='<button class="bp" data-act="open" data-d="'+TODAY+'">Noter ma journée</button>';}
  h+='</div>';
  var days=monthDays(LM), off=dow(days[0]);
  h+='<div class="mbar"><button class="arrow" data-act="lm" data-k="-1" aria-label="Mois précédent">‹</button><h2>'+monthLabel(LM)+'</h2><button class="arrow" data-act="lm" data-k="1" aria-label="Mois suivant">›</button></div>';
  h+='<div class="cal"><div class="grid">'+["L","M","M","J","V","S","D"].map(function(j){return '<div class="hd">'+j+'</div>';}).join("");
  for(var i=0;i<off;i++)h+='<div class="mc off"></div>';
  days.forEach(function(d){
    var e=R.days[d]||[], bg=cellBg(e), pp=S.P[d], cls="mc", nm="", lab="", ms=manque(d), rv=resa(d);
    if(dow(d)>=5||ferie(d))cls+=" we";
    if(d===TODAY)cls+=" today";
    if(pp&&pp.abs){cls+=" abs";nm=ABL[pp.abs]||"abs";}
    else if(ms)cls+=" miss";
    else if(rv)cls+=" resa";
    else if(bg.cls)cls+=" "+bg.cls;
    if(bg.list.length&&!(pp&&pp.abs)){var ns=bg.list.map(function(x){return court(chById(x.ch));});nm=ns[0]+(ns.length>1?"+"+(ns.length-1):"");}
    if(pp&&pp.it)lab=hh(pp.it.reduce(function(a,x){return a+(+x.h);},0)).replace(" ","")+(pp.it.some(function(x){return x.dep;})?"+D":"");
    if(rv){nm=resaCourt(rv);lab=hh(rv.h).replace(" ","");}
    h+='<button class="'+cls+'" style="'+(pp&&pp.abs||ms||rv?"":bg.style)+'" data-act="open" data-d="'+d+'" aria-label="'+fdl(d)+(ms?", à confirmer":"")+'">'
      +'<span class="n">'+(+d.slice(8))+'</span><span class="nm">'+esc(nm)+'</span>'+(ms?'<span class="q">?</span>':'<span class="h">'+lab+'</span>')+'</button>';
  });
  h+='</div><div class="legend"><span><i class="key k1"></i>Fait</span><span><i class="key k2"></i>Prévu</span><span><i class="key k5"></i>Réservé</span><span><i class="key k6"></i>Perso</span><span><i class="key k3"></i>Pas travaillé</span><span><i class="key k4">?</i>À remplir</span></div></div>';
  var jt=0,ht=0;days.forEach(function(d){var pp=S.P[d];if(pp&&pp.it){var tr=pp.it.filter(function(x){return !estPerso(x.ch);});if(tr.length){jt++;ht+=tr.reduce(function(a,x){return a+(+x.h);},0);}}});
  h+='<div class="sect"><div class="rtitle">Mon mois · '+monthLabel(LM)+'</div><div class="stats">'
    +'<div class="stat"><div class="l">Jours</div><div class="v">'+jt+'</div></div>'
    +'<div class="stat"><div class="l">Heures</div><div class="v">'+hh(ht)+'</div></div>'
    +'<div class="stat"><div class="l">Moy./jour</div><div class="v">'+(jt?hh(ht/jt):"—")+'</div></div></div></div>';
  h+=dispos(days);
  return h;
}
/* ce qui reste du mois affiché : jours de chantier, jours perso, jours libres */
function dispos(days){var a=days.filter(function(d){return d>=TODAY;});if(!a.length)return "";
  var c=0,p=0,l=0;a.forEach(function(d){var e=R.days[d]||[],pp=S.P[d];
    var per=e.some(function(x){return estPerso(x.ch);}), chn=e.some(function(x){return !estPerso(x.ch);})||resa(d);
    if(per)p++;else if(chn)c++;else if(ouvre(d)&&!(pp&&pp.abs))l++;});
  return '<div class="sect"><div class="rtitle">Mes disponibilités'+(a[0]===TODAY?' d\'ici la fin du mois':'')+'</div><div class="stats">'
    +'<div class="stat"><div class="l">Chantiers</div><div class="v">'+c+' j</div></div>'
    +'<div class="stat"><div class="l">Perso</div><div class="v" style="color:'+PERSO+'">'+p+' j</div></div>'
    +'<div class="stat hl"><div class="l">Libres</div><div class="v">'+l+' j</div></div></div></div>';}
function luiChs(){
  var h='<div class="ltop"><div class="t">Mes chantiers</div><div class="s">Ce qui reste, la fin prévue, l\'état à envoyer</div></div><div class="sect" style="border-top:none">';
  var g=donnees();
  if(g>0.01)h+='<div class="gift"><div class="big">'+jj(g/JH)+'</div><div class="txt"><b>donnés gratuitement</b><br>'+hh(g)+' au-delà des journées de '+JH+' h vendues</div></div>';
  var list=chOrder().filter(function(c){var r=R.ch[c.id];return !c.perso&&r.restants>0||(r.sansMarche&&r.fin&&r.fin>=add(TODAY,-30));});
  h+='<div class="rtitle" style="margin-top:14px">En cours et à venir</div><div class="chl">';
  list.forEach(function(c){h+=chCard(c);});
  if(!list.length)h+='<div class="note">Aucun chantier en cours.</div>';
  h+='</div>';
  var sr=series();
  if(sr.length){h+='<div class="rtitle" style="margin-top:18px">Réservé, en attente de contrat</div><div class="chl">';
    sr.forEach(function(x){h+='<div class="chc rs"><div class="top"><i class="key k5"></i><span class="nm">'+esc(resaNom(x))+'</span><span class="tag2 t-neu">'+jj(x.jours.length)+'</span></div><div class="cl">'+esc(resaClient(x))+'</div><div class="info"><span>Du <b>'+fd(x.jours[0])+'</b> au <b>'+fd(x.jours[x.jours.length-1])+'</b></span><span>'+hh(x.h)+' par jour</span></div></div>';});
    h+='</div>';}
  var pl=persoList();
  h+='<div class="rtitle" style="margin-top:18px">Mes tâches perso</div><div class="chl">'+pl.map(persoCarte).join("")+(pl.length?'':'<div class="note">Aucune tâche perso prévue.</div>')+'</div>'
    +'<button class="addrow" style="width:100%;margin-top:10px" data-act="newperso">+ Tâche perso</button>';
  var done=chOrder().filter(function(c){return !c.perso&&list.indexOf(c)<0;});
  if(done.length){h+='<div class="rtitle" style="margin-top:18px">Terminés</div><div class="chl">';done.forEach(function(c){h+=chCard(c);});h+='</div>';}
  return h+'</div>';
}
function persoList(){return chOrder().filter(function(c){if(!c.perso)return false;var r=R.ch[c.id];return r.restants>0||(r.fin&&r.fin>=add(TODAY,-7));});}
function persoQuand(c){var r=R.ch[c.id];if(c.fixe)return c.debut===c.fin?'le '+fd(c.debut):'du '+fd(c.debut)+' au '+fd(c.fin);
  if(r.restants<=0)return 'terminé';return r.planned.length?(r.planned.length>1?'du '+fd(r.planned[0])+' au '+fd(r.fin):'le '+fd(r.planned[0])):'';}
function persoCarte(c){var r=R.ch[c.id];
  return '<button class="chc perso" data-act="editperso" data-ch="'+c.id+'"><div class="top"><span class="dot" style="background:'+PERSO+'"></span><span class="nm">'+esc(c.nom)+'</span><span class="tag2 t-perso">'+(c.fixe?'date fixe':jj(r.total)+' à caler')+'</span></div>'
    +'<div class="info"><span>'+persoQuand(c)+'</span><span>'+(!c.fixe&&r.restants>0&&r.faits?'reste '+jj(r.restants):'')+'</span></div>'+(c.note?'<div class="cl">'+esc(c.note)+'</div>':'')+'</button>';}
function chCard(c){var r=R.ch[c.id], g=donnees(c.id), h="";
  h+='<div class="chc"><div class="top"><span class="dot" style="background:'+col(c)+'"></span><span class="nm">'+esc(c.nom)+'</span>'+(r.sansMarche?'<span class="tag2 t-amb">sans devis</span>':'')+'</div>'
    +'<div class="cl">'+esc(clientOf(c))+(c.ville?' · '+esc(c.ville):'')+'</div>';
  if(r.sansMarche){h+='<div class="info"><span><b>'+jj(r.faits)+'</b> faits · '+hh(r.h)+'</span><span>Marine prépare le devis</span></div>';}
  else{var pc=r.total?Math.min(r.faits,r.total)/r.total*100:0;
    h+='<div class="prog"><i style="width:'+pc+'%;background:'+col(c)+'"></i></div>'
      +'<div class="info"><span>'+(r.restants<=0?'Terminé · <b>'+jj(r.total)+'</b>':r.faits>0?'Reste <b>'+jj(r.restants)+'</b> sur '+jj(r.total):'Commence le <b>'+fd(r.debut)+'</b> · '+jj(r.total))+'</span><span>'+(r.restants>0?'Fin prévue <b>'+fd(r.fin)+'</b>':(r.fin?'le <b>'+fd(r.fin)+'</b>':''))+'</span></div>';
    if(g>0.01)h+='<div class="info"><span>Heures en plus des '+JH+' h</span><span><b style="color:var(--red)">+'+hh(g)+' = '+jj(g/JH)+' gratuits</b></span></div>';}
  h+='<div class="acts"><button class="bs" data-act="etat" data-sel="ch:'+c.id+'">État à envoyer</button></div></div>';
  return h;}
function luiCls(){
  var h='<div class="ltop"><div class="t">Mes clients</div><div class="s">Tarifs, signé, facturé, encaissé</div></div><div class="sect" style="border-top:none"><div class="chl">';
  S.clients.forEach(function(cl){var chs=S.chantiers.filter(function(c){return c.client===cl.id;}), t=argentClient(cl.id);
    h+='<div class="chc"><div class="top"><span class="nm">'+esc(cl.nom)+'</span><span class="tag2 t-neu">'+tarifTxt(cl.mode,cl.tarif)+(cl.dep?' + dépl. '+eur(cl.dep):'')+'</span></div>'
      +'<div class="cl">'+(chs.length?chs.map(function(c){return esc(c.nom);}).join(" · "):"aucun chantier")+(cl.tel?' · '+esc(cl.tel):'')+'</div>'
      +(t.sig?'<div class="money"><span>Signé<b>'+eur(t.sig)+'</b></span><span>Facturé<b>'+eur(t.fact)+'</b></span><span>Encaissé<b>'+eur(t.enc)+'</b></span><span class="due">Reste à encaisser<b>'+eur(t.fact-t.enc)+'</b></span></div>':'')
      +'<div class="acts"><button class="bs" data-act="editcl" data-cl="'+cl.id+'">Modifier</button>'+(chs.length?'<button class="bs" data-act="etat" data-sel="cl:'+cl.id+'">État du client</button>':'')+'</div></div>';});
  h+='</div><button class="addrow" style="width:100%;margin-top:12px" data-act="newcl">+ Nouveau client</button></div>';
  return h;
}

/* ================= feuilles ================= */
function placeOv(ctx){var ov=document.getElementById("ov");
  if(ctx==="lui"&&MOI.role==="gestion"){document.getElementById("app").appendChild(ov);ov.classList.remove("center");}
  else if(ctx==="lui"){document.body.appendChild(ov);ov.classList.remove("center");}
  else{document.body.appendChild(ov);ov.classList.add("center");}
  ov.hidden=false;}
function openSheet(d,ctx){
  var p=S.P[d], rows=[], abs=null, e=R.days[d]||[];
  if(p&&p.it)rows=p.it.map(function(i){return {ch:i.ch,h:+i.h,dep:!!i.dep,note:i.note||""};});
  else if(p&&p.abs)abs=p.abs;
  if(!rows.length){var pv=e.filter(function(x){return x.kind==="prevu";})[0];rows=[{ch:pv?pv.ch:null,h:JH}];}
  var rv=resa(d), planifie=e.some(function(x){return x.kind==="prevu";}), vv;
  if(rv){var js=Object.keys(S.V).filter(function(k){return S.V[k].serie===rv.serie;}).sort();vv={serie:rv.serie,au:js[js.length-1],client:rv.client||"",lib:rv.lib,h:rv.h};}
  else vv={serie:null,au:d,client:S.clients.length?S.clients[0].id:"new",lib:"",h:JH};
  SH={kind:"day",d:d,ctx:ctx,rows:rows,abs:abs,mode:abs?"a":(!p&&(rv||(d>TODAY&&!planifie))?"v":"w"),err:"",nc:-1,v:vv};
  placeOv(ctx);renderSheet();
}
function openEtat(sel,ctx){SH={kind:"etat",sel:sel,ctx:ctx,o:{f:true,h:false}};placeOv(ctx);renderSheet();prepPDF().catch(function(){});}
function openCl(ctx,id){SH={kind:"cl",ctx:ctx,id:id||null,err:"",arme:false};placeOv(ctx);renderSheet();}
function openPerso(ctx,id){var c=id?chById(id):null;
  SH={kind:"perso",ctx:ctx,id:id||null,err:"",arme:false,dr:c?{nom:c.nom,fixe:c.fixe,du:c.debut,au:c.fin||c.debut,j:c.jp||1,note:c.note}:{nom:"",fixe:false,du:TODAY,au:TODAY,j:1,note:""}};
  placeOv(ctx);renderSheet();}
function lirePerso(){var d=SH.dr,g=function(id){var e=document.getElementById(id);return e?e.value.trim():null;},v;
  if((v=g("pp-nom"))!=null)d.nom=v;if((v=g("pp-du"))!=null)d.du=v;if((v=g("pp-au"))!=null)d.au=v;if((v=g("pp-j"))!=null)d.j=parseInt(v,10);if((v=g("pp-note"))!=null)d.note=v;}
function feuillePerso(){var d=SH.dr,h="";
  h+='<div class="shh"><div><div class="t">'+(SH.id?"Modifier la tâche perso":"Nouvelle tâche perso")+'</div><div class="s">0 € · seulement dans le planning de Patrice</div></div><button class="x" data-act="close" aria-label="Fermer">✕</button></div>';
  h+='<div class="nc"><label class="full">Quoi<input id="pp-nom" value="'+esc(d.nom)+'" placeholder="ex. Abri de jardin"></label></div>';
  h+='<div class="seg"><button data-act="pmode" data-k="fixe" aria-pressed="'+d.fixe+'">Date fixe</button><button data-act="pmode" data-k="caler" aria-pressed="'+(!d.fixe)+'">À caler</button></div>';
  h+='<div class="nc">'+(d.fixe
    ?'<label>Du<input type="date" id="pp-du" value="'+d.du+'"></label><label>Au<input type="date" id="pp-au" value="'+d.au+'"></label>'
    :'<label>Nombre de jours<input type="number" id="pp-j" min="1" step="1" value="'+d.j+'"></label><label>Pas avant le<input type="date" id="pp-du" value="'+d.du+'"></label>')
    +'<label class="full">Note (facultatif)<input id="pp-note" value="'+esc(d.note||"")+'"></label>'
    +'<div class="note">'+(d.fixe?'Ces jours sont bloqués, week-ends compris. Les chantiers se décalent autour.':'Se cale comme un chantier, samedi et dimanche compris. Les chantiers avancent ou reculent autour.')+'</div></div>';
  if(SH.err)h+='<div class="err">'+esc(SH.err)+'</div>';
  if(SH.arme){var fp=R.ch[SH.id]?R.ch[SH.id].faits:0;h+='<div class="err">'+(fp>0?jj(fp)+' déjà faits restent notés. La suite est retirée et les chantiers se recalent.':'La tâche est retirée et les chantiers se recalent.')+'</div>';}
  h+='<div class="shf">'+(SH.id?'<button class="bs danger" data-act="delperso">'+(SH.arme?"Confirmer l'annulation":"Annuler la tâche")+'</button>':'<button class="bs" data-act="close">Annuler</button>')+'<button class="bp" data-act="saveperso">Enregistrer</button></div>';
  return h;}
function savePerso(){lirePerso();var d=SH.dr;
  if(!d.nom){SH.err="Dis ce que c'est.";return renderSheet();}
  if(!d.du){SH.err="Indique une date.";return renderSheet();}
  if(d.fixe&&(!d.au||d.au<d.du)){SH.err="La date de fin est avant le début.";return renderSheet();}
  if(!d.fixe&&!(d.j>=1)){SH.err="Indique au moins 1 jour.";return renderSheet();}
  var before=finsSnapshot(), c=SH.id?chById(SH.id):{id:uid(),client:null,ville:"",adresse:"",col:0,ant:0,par:MOI.nom,perso:true};
  c.nom=d.nom;c.court=d.nom.split(/\s+/)[0].slice(0,9);c.fixe=d.fixe;c.debut=d.du;c.fin=d.fixe?d.au:"";c.jp=d.fixe?0:d.j;c.note=d.note||"";
  if(!SH.id)S.chantiers.push(c);sChantier(c);finish(before,"Tâche perso enregistrée : "+c.nom);}
function closeSheet(){SH=null;document.getElementById("ov").hidden=true;}
function chantiersFor(d){
  var pvs=(R.days[d]||[]).filter(function(e){return e.kind==="prevu";}).map(function(e){return e.ch;});
  var list=S.chantiers.filter(function(c){var r=R.ch[c.id];
    var sel=SH.rows.some(function(x){return x.ch===c.id;});
    if(sel||pvs.indexOf(c.id)>=0)return true;
    if(r.sansMarche)return c.debut<=d&&(!r.fin||r.fin>=add(d,-30));
    return r.fin&&r.fin>=d&&r.debut<=add(d,45);});
  return list.sort(function(a,b){var pa=pvs.indexOf(a.id)>=0?0:1,pb=pvs.indexOf(b.id)>=0?0:1;return pa-pb||(R.ch[a.id].debut<R.ch[b.id].debut?-1:1);});
}
function renderSheet(){
  var h="";
  if(SH.kind==="perso"){document.getElementById("sheet").innerHTML=feuillePerso();return;}
  if(SH.kind==="lot"){document.getElementById("sheet").innerHTML=feuilleLot();return;}
  if(SH.kind==="ch"){document.getElementById("sheet").innerHTML=feuilleCh();return;}
  if(SH.kind==="etat"){
    var title=SH.sel.slice(0,3)==="ch:"?"État du chantier":"État du client";
    h+='<div class="shh"><div><div class="t">'+title+'</div><div class="s">PDF à l\'en-tête PR.TECH, ou texte à coller</div></div><button class="x" data-act="close" aria-label="Fermer">✕</button></div>';
    h+='<div class="opts"><button data-act="eopt" data-k="f" aria-pressed="'+SH.o.f+'">Montants et factures</button><button data-act="eopt" data-k="h" aria-pressed="'+SH.o.h+'">Heures réalisées</button></div>';
    h+='<div class="etat" id="etat-txt">'+esc(etatTexte(SH.sel,SH.o))+'</div>';
    h+='<div class="shf"><button class="bs" data-act="copy">Copier le texte</button><button class="bp" data-act="pdf">Envoyer le PDF</button></div>';
  }
  else if(SH.kind==="cl"){
    var cl=SH.id?clById(SH.id):{nom:"",mode:"jour",tarif:300,tel:"",dep:55};
    h+='<div class="shh"><div><div class="t">'+(SH.id?"Modifier le client":"Nouveau client")+'</div><div class="s">Visible aussi dans l\'outil de Marine</div></div><button class="x" data-act="close" aria-label="Fermer">✕</button></div>';
    h+='<div class="nc"><label class="full">Nom<input id="ncl-nom" value="'+esc(cl.nom)+'" placeholder="ex. SARL Toitures 33"></label>'
      +'<label>Tarif<select id="ncl-mode"><option value="jour"'+(cl.mode==="jour"?" selected":"")+'>à la journée</option><option value="heure"'+(cl.mode==="heure"?" selected":"")+'>à l\'heure</option></select></label>'
      +'<label>Montant HT (€)<input id="ncl-tarif" type="number" inputmode="decimal" min="0" step="1" value="'+cl.tarif+'"></label>'
      +'<label class="full">Téléphone<input id="ncl-tel" inputmode="tel" value="'+esc(cl.tel||"")+'" placeholder="facultatif"></label>'
      +'<label class="full">Déplacement HT par jour (€) · mettre 0 si aucun<input id="ncl-dep" type="number" inputmode="decimal" min="0" step="1" value="'+(cl.dep==null?55:cl.dep)+'"></label></div>';
    if(SH.err)h+='<div class="err">'+esc(SH.err)+'</div>';
    if(SH.arme){var ncc=S.chantiers.filter(function(c){return c.client===SH.id;}).length;h+='<div class="err">'+(ncc?'Les '+ncc+' chantier'+(ncc>1?'s':'')+' de ce client, leurs contrats et leurs jours pointés ne seront plus visibles.':'Le client est retiré.')+'</div>';}
    h+='<div class="shf">'+(SH.id?'<button class="bs danger" data-act="delcl">'+(SH.arme?"Confirmer la suppression":"Supprimer")+'</button>':'<button class="bs" data-act="close">Annuler</button>')+'<button class="bp" data-act="savecl">Enregistrer</button></div>';
  }
  else{
    var d=SH.d, e=R.days[d]||[], pv=e.filter(function(x){return x.kind==="prevu";});
    var rv0=resa(d);
    var sub=rv0?"Réservé : "+resaNom(rv0)+" · "+resaClient(rv0):pv.length?"Prévu : "+pv.map(function(x){var l=lotById(x.lot);return chById(x.ch).nom+(l?" · "+lotName(l):"");}).join(" + "):(S.P[d]?"Déjà noté":"Rien de prévu ce jour");
    h+='<div class="shh"><div><div class="t cap">'+fdl(d)+'</div><div class="s">'+esc(sub)+'</div></div><button class="x" data-act="close" aria-label="Fermer">✕</button></div>';
    h+='<div class="seg s3"><button data-act="mode" data-k="w" aria-pressed="'+(SH.mode==="w")+'">J\'ai travaillé</button><button data-act="mode" data-k="a" aria-pressed="'+(SH.mode==="a")+'">Pas travaillé</button><button data-act="mode" data-k="v" aria-pressed="'+(SH.mode==="v")+'">Réserver</button></div>';
    if(SH.mode==="w"){
      var list=chantiersFor(d);
      SH.rows.forEach(function(r,i){
        h+='<div class="rowc"><div class="lbl"><span>'+(SH.rows.length>1?"Chantier "+(i+1):"Chantier")+'</span>'+(i>0?'<button data-act="delrow" data-i="'+i+'">Retirer</button>':'')+'</div><div class="pick">';
        list.forEach(function(c){var isPv=pv.some(function(x){return x.ch===c.id;}), sm=R.ch[c.id].sansMarche;
          h+='<button class="pk" data-act="pick" data-i="'+i+'" data-ch="'+c.id+'" aria-pressed="'+(r.ch===c.id)+'"><span class="dot" style="background:'+col(c)+'"></span><span><span class="nm">'+esc(c.nom)+'</span><span class="cl">'+esc(clientOf(c))+(c.ville?' · '+esc(c.ville):'')+'</span></span>'+(c.perso?'<span class="tag p">perso</span>':isPv?'<span class="tag">prévu</span>':sm?'<span class="tag r">sans devis</span>':'')+'</button>';});
        if(SH.nc===i){
          h+='<div class="nc"><label class="full">Client<select id="nc-client">'+S.clients.map(function(c){return '<option value="'+c.id+'">'+esc(c.nom)+' · '+tarifTxt(c.mode,c.tarif)+'</option>';}).join("")+'<option value="new">+ Nouveau client</option></select></label>'
            +'<label class="full">Nouveau client (si besoin)<input id="nc-cnom" placeholder="ex. Mme Garcia"></label>'
            +'<label>Tarif<select id="nc-mode"><option value="jour">à la journée</option><option value="heure">à l\'heure</option></select></label>'
            +'<label>Montant HT (€)<input id="nc-tarif" type="number" inputmode="decimal" min="0" value="300"></label>'
            +'<label>Chantier<input id="nc-nom" placeholder="ex. Toit garage"></label>'
            +'<label>Ville<input id="nc-ville" placeholder="ex. Cenon"></label>'
            +'<div class="note">Sans devis signé : Marine reçoit une alerte pour faire le devis ou le marché.</div>'
            +'<button class="bp" data-act="nc-create" data-i="'+i+'">Ajouter ce chantier</button></div>';
        }else h+='<button class="pk new" data-act="nc-open" data-i="'+i+'">+ Autre chantier (pas dans la liste)</button>';
        h+='</div>'+(estPerso(r.ch)?'<div class="lbl"><span>Journée perso · 8 h</span></div><input class="pnote" id="pn-'+i+'" value="'+esc(r.note||"")+'" placeholder="Détail (facultatif)">':'<div class="lbl"><span>Heures</span></div><div class="step"><button data-act="hstep" data-i="'+i+'" data-k="-0.5" aria-label="Moins une demi-heure">−</button>'
          +'<input type="number" inputmode="decimal" step="0.5" min="0" max="16" id="hin-'+i+'" data-hin="'+i+'" value="'+r.h+'" aria-label="Heures"><span class="u">h</span>'
          +'<button data-act="hstep" data-i="'+i+'" data-k="0.5" aria-label="Plus une demi-heure">+</button></div>')+depBtn(r,i)+'</div>';
      });
      if(SH.rows.length<2)h+='<button class="addrow" data-act="addrow">+ J\'ai aussi été sur un autre chantier ce jour-là</button>';
    }else if(SH.mode==="v"){
      var v=SH.v;
      h+='<div class="nc"><label>Du<input type="date" id="pv-du" value="'+d+'" disabled></label>'
        +'<label>Jusqu\'au<input type="date" id="pv-au" value="'+v.au+'" min="'+d+'"></label>'
        +'<label class="full">Client<select id="pv-client">'+S.clients.map(function(c){return '<option value="'+c.id+'"'+(c.id===v.client?" selected":"")+'>'+esc(c.nom)+' · '+tarifTxt(c.mode,c.tarif)+'</option>';}).join("")+'<option value="new"'+(v.client==="new"?" selected":"")+'>+ Nouveau client</option></select></label>'
        +'<label class="full">Nouveau client (si besoin)<input id="pv-cnom" placeholder="ex. Mme Garcia"></label>'
        +'<label class="full">Pour quoi (chantier, lieu)<input id="pv-lib" value="'+esc(v.lib)+'" placeholder="ex. Hangar Dupont à Cenon"></label>'
        +'<label>Heures par jour<input id="pv-h" type="number" inputmode="decimal" step="0.5" min="0.5" max="16" value="'+v.h+'"></label>'
        +'<div class="note">Samedis, dimanches et jours fériés ne sont pas réservés. Les chantiers prévus se décalent autour. Marine est prévenue pour préparer le devis ou le contrat.</div></div>';
    }else{
      h+='<div class="note">Rien à remplir de plus. Les chantiers prévus glissent tous au prochain jour ouvré.</div>';
    }
    if(SH.err)h+='<div class="err">'+esc(SH.err)+'</div>';
    if(SH.mode==="v"){
      h+='<div class="shf">'+(rv0?'<button class="bs danger" data-act="delv1">Retirer ce jour</button><button class="bs danger" data-act="delvs">Tout retirer</button>':'<button class="bs" data-act="close">Annuler</button>')+'<button class="bp" data-act="savesheet">'+(rv0?"Enregistrer":"Réserver")+'</button></div>';
    }else
    h+='<div class="shf">'+(S.P[d]?'<button class="bs" data-act="clearday">Effacer</button>':'<button class="bs" data-act="close">Annuler</button>')+'<button class="bp" data-act="savesheet">Enregistrer</button></div>';
  }
  document.getElementById("sheet").innerHTML=h;
}
function depBtn(r,i){var c=r.ch&&chById(r.ch),cl=c&&clById(c.client);if(!cl||!(cl.dep>0))return "";
  return '<button class="dep" data-act="dep" data-i="'+i+'" aria-pressed="'+(!!r.dep)+'"><span class="box">'+(r.dep?"✓":"")+'</span><span>Déplacement</span><small>'+eur(cl.dep)+'</small></button>';}
function val(id){var e=document.getElementById(id);return e?e.value.trim():"";}
function lireHeures(){if(!SH||SH.kind!=="day")return;SH.rows.forEach(function(r,i){var e=document.getElementById("hin-"+i);if(e){var v=parseFloat(String(e.value).replace(",","."));r.h=isNaN(v)?0:v;}var n=document.getElementById("pn-"+i);if(n)r.note=n.value.trim();});}
function createChantierFromSheet(i){
  var cid=val("nc-client"), nom=val("nc-nom");
  if(!nom){SH.err="Donne un nom au chantier.";return renderSheet();}
  if(cid==="new"){var cn=val("nc-cnom");if(!cn){SH.err="Donne le nom du nouveau client.";return renderSheet();}
    var ncl={id:uid(),nom:cn,mode:val("nc-mode")||"jour",tarif:parseFloat(val("nc-tarif"))||0,tel:"",dep:55,par:MOI.nom};S.clients.push(ncl);sClient(ncl);cid=ncl.id;}
  var ch={id:uid(),client:cid,nom:nom,court:"",ville:val("nc-ville"),adresse:"",col:S.chantiers.length%PAL.length,debut:SH.d,ant:0,par:MOI.nom};
  S.chantiers.push(ch);sChantier(ch);
  SH.rows[i].ch=ch.id;SH.nc=-1;SH.err="";compute();renderSheet();
}
function savePrev(){
  var d=SH.d, v=SH.v, au=val("pv-au")||d, cid=val("pv-client"), lib=val("pv-lib"), hj=parseFloat(val("pv-h").replace(",","."));
  if(au<d){SH.err="La date de fin est avant le début.";return renderSheet();}
  if(!(hj>0)||hj>16){SH.err="Indique des heures entre 0,5 et 16.";return renderSheet();}
  if(cid==="new"){var cn=val("pv-cnom");if(!cn){SH.err="Donne le nom du nouveau client.";return renderSheet();}
    var ncl={id:uid(),nom:cn,mode:"jour",tarif:300,tel:"",dep:55,par:MOI.nom};S.clients.push(ncl);sClient(ncl);cid=ncl.id;}
  if(!cid){SH.err="Choisis un client.";return renderSheet();}
  var jours=[],x=d,garde=0;
  while(x<=au&&garde<200){if(ouvre(x)&&!S.P[x])jours.push(x);x=add(x,1);garde++;}
  if(!jours.length){SH.err="Aucun jour ouvré libre sur cette période.";return renderSheet();}
  var before=finsSnapshot(), serie=v.serie||uid(), n=jours.length, retires=[];
  // réservation modifiée : les jours à partir d'ici qui sortent de la période sont retirés,
  // les jours d'avant restent et prennent le nouveau client et le nouveau libellé
  Object.keys(S.V).forEach(function(k){if(S.V[k].serie!==serie)return;
    if(k<d)jours.push(k);else if(jours.indexOf(k)<0){retires.push(k);delete S.V[k];}});
  jours.sort();jours.forEach(function(k){S.V[k]={serie:serie,client:cid,lib:lib,h:hj};});
  if(retires.length)dPrev(retires);
  sPrev(serie,jours,cid,lib,hj);
  finish(before,n+" jour"+(n>1?"s":"")+" réservé"+(n>1?"s":"")+" à partir du "+fd(d));
}
function saveSheet(){
  if(SH.mode==="v")return savePrev();
  lireHeures();
  var d=SH.d, before=finsSnapshot();
  if(SH.mode==="a"){S.P[d]={abs:SH.abs||ABS};}
  else{
    if(SH.rows.some(function(r){return !r.ch;})){SH.err="Choisis un chantier pour chaque ligne.";return renderSheet();}
    if(SH.rows.some(function(r){return !estPerso(r.ch)&&(!(r.h>0)||r.h>16);})){SH.err="Indique des heures entre 0,5 et 16.";return renderSheet();}
    var seen={};if(SH.rows.some(function(r){if(seen[r.ch])return true;seen[r.ch]=1;})){SH.err="Le même chantier est choisi deux fois.";return renderSheet();}
    S.P[d]={it:SH.rows.map(function(r){var pe=estPerso(r.ch);return {ch:r.ch,h:pe?8:Math.round(r.h*2)/2,dep:!pe&&!!r.dep,note:pe?(r.note||""):""};})};}
  delete S.V[d];
  sJour(d);
  finish(before,"Journée du "+fd(d)+" enregistrée");
}
function finish(before,title){
  closeSheet();compute();
  var m=diffFins(before);
  toast(title,m.length?"Fins prévues : "+m.join(" · "):"Planning inchangé");
  renderAll();
}
var tt;
function toast(t,s){var el=document.getElementById("toast");el.innerHTML="<b>"+esc(t)+"</b>"+esc(s||"");el.hidden=false;clearTimeout(tt);tt=setTimeout(function(){el.hidden=true;},5200);}

/* ================= MOI ================= */
function renderMoi(){
  var el=document.getElementById("moi");if(!el)return;
  document.querySelectorAll("#tabs button").forEach(function(b){b.setAttribute("aria-pressed",b.dataset.tab===TAB?"true":"false");});
  el.innerHTML=TAB==="planning"?tPlanning():TAB==="marches"?tMarches():TAB==="heures"?tHeures():tRapport();
}
function barColor(c,l){if(c&&c.perso)return PERSO;if(MODE==="ch")return col(c);return l?STC[etat(l)]:STC.n;}
function tPlanning(){
  var days=monthDays(AM), off=dow(days[0]), h="";
  h+='<div class="pgrid"><div class="card"><div class="chead"><button class="arrow" data-act="am" data-k="-1" aria-label="Mois précédent">‹</button><h2 style="text-transform:capitalize;min-width:150px;text-align:center">'+monthLabel(AM)+'</h2><button class="arrow" data-act="am" data-k="1" aria-label="Mois suivant">›</button><span class="sp"></span>'
    +'<span class="muted" style="font-size:12.5px">Couleur par</span><div class="modes"><button data-act="mode2" data-k="ch" aria-pressed="'+(MODE==="ch")+'">Chantier</button><button data-act="mode2" data-k="fa" aria-pressed="'+(MODE==="fa")+'">Facturation</button></div></div>';
  h+='<div class="acalw"><div class="acal">'+["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(function(j){return '<div class="hd">'+j+'</div>';}).join("");
  for(var i=0;i<off;i++)h+='<div class="ac off"></div>';
  days.forEach(function(d){
    var e=R.days[d]||[], pp=S.P[d], cls="ac", ms=manque(d);
    if(dow(d)>=5||ferie(d))cls+=" we"; if(d===TODAY)cls+=" today"; if(pp&&pp.abs)cls+=" abs"; if(ms)cls+=" miss";
    h+='<button class="'+cls+'" data-act="open2" data-d="'+d+'"><span class="n"><span>'+(+d.slice(8))+(ferie(d)?" · férié":"")+'</span>'+(pp&&pp.it?'<span>'+hh(pp.it.reduce(function(a,x){return a+(+x.h);},0))+'</span>':'')+'</span>';
    e.forEach(function(x){var c=chById(x.ch), l=x.lot?lotById(x.lot):null, cc=barColor(c,l);
      var sm=c.perso?"perso":l?(MODE==="fa"?lotShort(l)+" · "+STL[etat(l)]:lotShort(l)):"sans marché";
      var lab=esc(c.nom)+' <small>'+sm+(x.over?" · hors contrat":"")+'</small>';
      if(x.kind==="fait")h+='<span class="bar" style="background:'+(!c.perso&&(x.over||!l)?"var(--red)":cc)+'">'+lab+(pp.it.length>1?' <small>'+hh(x.h)+'</small>':'')+(x.dep?' <small>· dépl.</small>':'')+'</span>';
      else h+='<span class="bar pv" style="background:'+tint(cc)+';box-shadow:inset 3px 0 0 '+cc+'">'+lab+'</span>';
    });
    var rvm=resa(d);if(rvm)h+='<span class="bar rsv">Réservé · '+esc(resaNom(rvm))+' <small>'+esc(resaClient(rvm))+' · '+hh(rvm.h)+'</small></span>';
    if(pp&&pp.abs)h+='<span class="absl">'+esc(pp.abs)+'</span>';
    if(ms)h+='<span class="missl">? non saisi</span>';
    h+='</button>';
  });
  h+='</div></div><div class="cfoot">'
    +(MODE==="ch"?'Plein = fait (pointé par Patrice) · clair = prévu, recalculé en cascade à chaque saisie · rouge = sans marché ou hors contrat · clique un jour pour corriger'
      :['c','a','f','r','p'].map(function(k){return '<span class="badge b-'+k+'">'+STL[k]+'</span>';}).join(" ")+' · plein = fait, clair = prévu')+'</div></div>';
  h+='<div class="side"><div class="card"><div class="chead"><h2>Chantiers</h2><span class="muted" style="font-size:12.5px">dans l\'ordre du planning</span></div>';
  chOrder().forEach(function(c){var r=R.ch[c.id];if(c.perso)return;
    var segs=lotsOf(c.id).map(function(l){var s=R.lot[l.id],cc=barColor(c,l),fa=Math.min(s.faits,l.jours);return '<i style="width:'+(r.total?fa/r.total*100:0)+'%;background:'+cc+'"></i><i style="width:'+(r.total?(l.jours-fa)/r.total*100:0)+'%;background:'+tint(cc)+'"></i>';}).join("");
    h+='<div class="chc"><div class="top"><span class="dot" style="background:'+col(c)+'"></span><span class="nm">'+esc(c.nom)+'</span><span class="cl" style="margin-left:auto">'+esc(clientOf(c))+'</span></div>';
    if(r.sansMarche)h+='<div class="info"><span><b>'+jj(r.faits)+'</b> · '+hh(r.h)+'</span><span class="badge b-n">sans marché</span></div>';
    else h+='<div class="prog">'+segs+'</div><div class="info"><span><b>'+jj(Math.min(r.faits,r.total))+'</b> / '+jj(r.total)+'</span><span>'+(r.restants>0?'fin prévue <b>'+fd(r.fin)+'</b>':'terminé'+(r.fin?' le <b>'+fd(r.fin)+'</b>':''))+'</span></div>'
      +'<div style="display:flex;gap:5px;flex-wrap:wrap">'+lotsOf(c.id).map(function(l){var e=etat(l);return '<span class="badge b-'+e+'">'+lotShort(l)+' · '+STL[e]+'</span>';}).join("")+'</div>';
    h+='</div>';
  });
  h+='</div>';
  var pl=persoList();
  h+='<div class="card"><div class="chead"><h2>Tâches perso de Patrice</h2><span class="sp"></span><button class="bsm" data-act="newperso">+ Tâche perso</button></div><div class="chl" style="padding:10px 12px;margin:0">'
    +(pl.length?pl.map(persoCarte).join(""):'<div class="note">Aucune tâche perso prévue.</div>')+'</div></div>';
  h+='</div></div>';
  return h;
}

function libFact(l){var e=etat(l);
  if(e==="p")return "payé le "+fd(l.dp);
  if(e==="f"||e==="r")return (l.nf?l.nf+" · ":"")+"échéance "+fd(echeance(l.df));
  if(e==="a")return "terminé, à facturer";
  return "facturé à la fin";}
function tMarches(){
  var h="";
  h+='<div class="card"><div class="chead"><h2>Nouveau marché</h2><span class="muted" style="font-size:12.5px">un chantier, un nombre de jours, une date de début · le tarif du client est repris</span></div><form class="form" id="fnew">'
    +'<label>Client<select id="n-client">'+S.clients.map(function(c){return '<option value="'+c.id+'">'+esc(c.nom)+' · '+tarifTxt(c.mode,c.tarif)+'</option>';}).join("")+'<option value="new">+ Nouveau client…</option></select></label>'
    +'<label>Nouveau client<input id="n-cnom" placeholder="si nouveau"></label>'
    +'<label>Chantier<input id="n-nom" placeholder="ex. Collège Montaigne"></label>'
    +'<label>Nom court<input id="n-court" placeholder="ex. MONTAIGNE" maxlength="12"></label>'
    +'<label>Ville<input id="n-ville" placeholder="ex. Lormont"></label>'
    +'<label>Début<input type="date" id="n-debut" value="'+TODAY+'"></label>'
    +'<label>Jours<input type="number" id="n-jours" min="0.5" step="0.5" value="10"></label>'
    +'<label>Forfait HT (si connu)<input type="number" id="n-montant" min="0" step="1" placeholder="auto"></label>'
    +'<div class="act"><button class="bp" type="submit">Créer le marché</button></div></form></div>';
  h+='<div class="card"><div class="chead"><h2>Clients</h2><span class="muted" style="font-size:12.5px">tarifs visibles et modifiables par Patrice</span><span class="sp"></span><button class="bsm" data-act="newcl2">+ Nouveau client</button></div>';
  S.clients.forEach(function(cl){var n=S.chantiers.filter(function(c){return c.client===cl.id;}).length;
    h+='<div class="rowact"><button class="li" data-act="editcl2" data-cl="'+cl.id+'"><span class="li-t">'+esc(cl.nom)+(cl.par&&cl.par!=="Marine"?' <span class="badge b-a">ajouté par '+esc(cl.par)+'</span>':'')+'</span><span>'+tarifTxt(cl.mode,cl.tarif)+(cl.dep?' · dépl. '+eur(cl.dep):'')+'</span><span class="muted">'+esc(cl.tel||"—")+'</span><span class="muted">'+n+' chantier'+(n>1?"s":"")+'</span><span class="go">›</span></button><span class="ra"><button class="bsm" data-act="editcl2" data-cl="'+cl.id+'">Modifier</button><button class="bsm danger" data-act="delcl0" data-cl="'+cl.id+'">Supprimer</button></span></div>';});
  h+='</div>';
  var sr=series();
  if(sr.length){h+='<div class="card"><div class="chead"><h2>Jours réservés, sans contrat</h2><span class="muted" style="font-size:12.5px">notés à l\'avance par Patrice · à transformer en marché quand le devis est signé</span></div>';
    sr.forEach(function(x){var est=resaEstime(x);
      h+='<div class="li rs"><span class="li-t"><i class="key k5" style="margin-right:8px;vertical-align:-2px"></i>'+esc(resaNom(x))+'</span><span>'+esc(resaClient(x))+'</span><span class="muted">'+fd(x.jours[0])+' → '+fd(x.jours[x.jours.length-1])+' · '+jj(x.jours.length)+'</span><span class="muted">'+(est!=null?"≈ "+eur(est):"—")+'</span><button class="bsm pri" data-act="mkresa" data-serie="'+x.serie+'">Créer le marché</button></div>';});
    h+='</div>';}
  chOrder().forEach(function(c){if(c.perso)return;var r=R.ch[c.id], lots=lotsOf(c.id), cl=clById(c.client)||{mode:"jour",tarif:0};
    var tm=lots.reduce(function(a,l){return a+montant(l).v;},0);
    var ouv=!!OUV[c.id];
    h+='<div class="card"><div class="chead"><button class="tg" data-act="tgch" data-ch="'+c.id+'" aria-expanded="'+ouv+'"><span class="chev">'+(ouv?'▾':'▸')+'</span><span class="dot" style="background:'+col(c)+'"></span><h2>'+esc(c.nom)+'</h2><span class="muted">'+esc(clientOf(c))+(c.ville?' · '+esc(c.ville):'')+'</span></button>'+(c.par&&c.par!=="Marine"?'<span class="badge b-a">créé par '+esc(c.par)+'</span>':'')+'<span class="sp"></span>'
      +(function(){var dp=depCh(c);return dp.n?'<span class="resume">déplacements '+dp.n+' × '+eur(dp.pu)+' = <b>'+eur(dp.v)+'</b></span>':'';})()
      +(r.sansMarche?'':'<span class="resume">'+jj(r.total)+' · <b>'+eur(tm)+'</b> · début '+fd(c.debut)+' · fin prévue <b>'+fd(r.fin)+'</b></span>')
      +'<button class="bsm" data-act="editch" data-ch="'+c.id+'">Modifier</button><button class="bsm danger" data-act="delch0" data-ch="'+c.id+'">Supprimer</button></div>';
    if(!ouv){h+='</div>';return;}
    if(r.sansMarche){
      h+='<div class="nolot"><span class="badge b-n">pas de marché signé</span><span>'+jj(r.faits)+' pointés ('+hh(r.h)+') · tarif client '+tarifTxt(cl.mode,cl.tarif)+'</span><span style="flex:1"></span><button class="bsm pri" data-act="mkmarche" data-ch="'+c.id+'">Créer le marché ('+jj(Math.max(1,Math.ceil(r.faits)))+')</button></div></div>';
      return;}
    h+='<div class="rowact"><div class="ct-h"><span>Contrat</span><span>Jours</span><span>Montant HT</span><span>Période</span><span>Fait</span><span>Facturation</span><span></span></div><span class="ra"></span></div>';
    lots.forEach(function(l){var s=R.lot[l.id], m=montant(l), e=etat(l), fa=Math.min(s.faits,l.jours);
      h+='<div class="rowact"><button class="ct" data-act="editlot" data-lot="'+l.id+'">'
        +'<span class="ct-n"><b>'+lotName(l)+'</b>'+(l.ref?'<small>'+esc(l.ref)+'</small>':'')+'</span>'
        +'<span>'+jj(+l.jours)+'</span>'
        +'<span><b>'+eur(m.v)+'</b>'+(m.est?'<small>estimé</small>':'')+'</span>'
        +'<span class="muted">'+(s.du?fd(s.du)+' → '+fd(s.au):'—')+'</span>'
        +'<span class="ct-f"><span class="mini"><i style="width:'+(fa/l.jours*100)+'%;background:'+col(c)+'"></i></span><small>'+jj(fa)+' / '+jj(+l.jours)+'</small></span>'
        +'<span class="ct-s"><span class="badge b-'+e+'">'+STL[e]+'</span><small>'+esc(libFact(l))+'</small></span>'
        +'<span class="go">›</span></button><span class="ra"><button class="bsm" data-act="editlot" data-lot="'+l.id+'">Modifier</button><button class="bsm danger" data-act="dellot0" data-lot="'+l.id+'">Supprimer</button></span></div>';
    });
    h+='<div class="cfoot"><button class="bsm" data-act="addav" data-ch="'+c.id+'">+ Ajouter un avenant</button><span>Clique un contrat pour modifier ses jours, son montant ou sa facture.</span></div></div>';
  });
  return h;
}

/* fenêtre : un contrat */
function feuilleLot(){
  var l=lotById(SH.id), d=SH.dr, c=chById(l.ch), h="";
  h+='<div class="shh"><div><div class="t">'+esc(c.nom)+' · '+lotName(l)+'</div><div class="s">'+(l.doc?esc(l.doc):'Pas de document rattaché')+'</div></div><button class="x" data-act="close" aria-label="Fermer">✕</button></div>';
  h+='<div class="nc">'
    +'<label>Jours<input id="lo-jours" type="number" min="0.5" step="0.5" value="'+d.jours+'"></label>'
    +'<label>Tarif<select id="lo-mode"><option value="jour"'+(d.mode==="jour"?" selected":"")+'>à la journée</option><option value="heure"'+(d.mode==="heure"?" selected":"")+'>à l\'heure</option></select></label>'
    +'<label>Prix HT (€)<input id="lo-prix" type="number" min="0" step="1" value="'+d.prix+'"></label>'
    +'<label>Forfait HT (€)<input id="lo-montant" type="number" min="0" step="1" value="'+(d.montant==null?"":d.montant)+'" placeholder="vide = jours × prix"></label>'
    +'<label class="full">Bon de commande<input id="lo-ref" value="'+esc(d.ref)+'" placeholder="ex. CF2605-080"></label></div>';
  h+='<div class="lbl"><span>Facturation</span></div><div class="seg3">'
    +[["a","Non facturé"],["f","Facturé"],["p","Payé"]].map(function(x){return '<button data-act="lst" data-k="'+x[0]+'" aria-pressed="'+(d.st===x[0])+'">'+x[1]+'</button>';}).join("")+'</div>';
  if(d.st!=="a")h+='<div class="nc"><label>N° de facture<input id="lo-nf" value="'+esc(d.nf)+'" placeholder="F-2026-…"></label>'
    +'<label>Facturé le<input id="lo-df" type="date" value="'+(d.df||"")+'"></label>'
    +(d.st==="p"?'<label>Payé le<input id="lo-dp" type="date" value="'+(d.dp||"")+'"></label>':'')
    +'<div class="note">Échéance 45 jours fin de mois : <b>'+(d.df?fdy(echeance(d.df)):"—")+'</b></div></div>';
  if(SH.err)h+='<div class="err">'+esc(SH.err)+'</div>';
  h+='<div class="shf"><button class="bs danger" data-act="dellot2">'+(SH.arme?"Confirmer la suppression":"Supprimer")+'</button><button class="bp" data-act="savelot">Enregistrer</button></div>';
  return h;
}
function lireLot(){var d=SH.dr,g=function(id){var e=document.getElementById(id);return e?e.value.trim():null;};
  var v;
  if((v=g("lo-jours"))!=null)d.jours=parseFloat(v.replace(",","."));
  if((v=g("lo-mode"))!=null)d.mode=v;
  if((v=g("lo-prix"))!=null)d.prix=parseFloat(v.replace(",","."));
  if((v=g("lo-montant"))!=null){var m=parseFloat(v.replace(",","."));d.montant=m>0?m:null;}
  if((v=g("lo-ref"))!=null)d.ref=v;
  if((v=g("lo-nf"))!=null)d.nf=v;
  if((v=g("lo-df"))!=null)d.df=v;
  if((v=g("lo-dp"))!=null)d.dp=v;}

/* fenêtre : un chantier */
function feuilleCh(){
  var c=chById(SH.id), h="";
  h+='<div class="shh"><div><div class="t">'+esc(c.nom)+'</div><div class="s">Le nom court s\'affiche dans le calendrier de Patrice</div></div><button class="x" data-act="close" aria-label="Fermer">✕</button></div>';
  h+='<div class="nc"><label class="full">Nom<input id="ch-nom" value="'+esc(c.nom)+'"></label>'
    +'<label>Nom court<input id="ch-court" maxlength="12" value="'+esc(c.court)+'" placeholder="'+esc(court(c))+'"></label>'
    +'<label>Client<select id="ch-client">'+S.clients.map(function(x){return '<option value="'+x.id+'"'+(x.id===c.client?" selected":"")+'>'+esc(x.nom)+'</option>';}).join("")+'</select></label>'
    +'<label>Ville<input id="ch-ville" value="'+esc(c.ville)+'"></label>'
    +'<label>Début<input id="ch-debut" type="date" value="'+c.debut+'"></label>'
    +'<label class="full">Adresse<input id="ch-adresse" value="'+esc(c.adresse)+'"></label></div>';
  if(SH.err)h+='<div class="err">'+esc(SH.err)+'</div>';
  if(SH.arme){var nl=lotsOf(c.id).length;h+='<div class="err">'+(nl?'Le chantier et ses '+nl+' contrat'+(nl>1?'s':'')+' sont retirés. Les jours déjà pointés ne seront plus comptés.':'Le chantier est retiré.')+'</div>';}
  h+='<div class="shf"><button class="bs danger" data-act="delch">'+(SH.arme?"Confirmer la suppression":"Supprimer")+'</button><button class="bp" data-act="savech">Enregistrer</button></div>';
  return h;
}

function tHeures(){
  var h='<div class="card"><div class="chead"><h2>Jours vendus et heures réellement faites</h2><span class="muted" style="font-size:12.5px">journée vendue = '+JH+' h · jours pointés dans l\'outil (hors reprise)</span></div><div class="tw"><table><thead><tr>'
    +'<th class="l">Chantier · contrat</th><th>Jours pointés</th><th>Heures vendues</th><th>Heures faites</th><th>Écart</th><th>Jours gratuits</th><th>€ / h prévu</th><th>€ / h réel</th></tr></thead><tbody>';
  var T={j:0,hv:0,hf:0,g:0}, any=false;
  chOrder().forEach(function(c){lotsOf(c.id).forEach(function(l){var s=R.lot[l.id], fj=s.faits-s.reprise, fh=s.h-s.reprise*JH;if(fj<=1e-9)return;any=true;
    var hv=fj*JH, ec=fh-hv, jour=l.mode==="jour", pj=montant(l).v/l.jours;T.j+=fj;T.hv+=hv;T.hf+=fh;if(jour)T.g+=ec;
    h+='<tr><td class="l"><span class="dot" style="background:'+col(c)+';margin-right:7px;width:10px;height:10px"></span><b>'+esc(c.nom)+'</b> · '+lotName(l)+'<span class="ps">'+esc(clientOf(c))+' · '+(jour?eur(pj)+" / jour":tarifTxt(l.mode,l.prix))+'</span></td>'
      +'<td>'+jj(fj)+'</td><td>'+hh(hv)+'</td><td><b>'+hh(fh)+'</b><span class="ps">'+hh(fh/fj)+' / jour</span></td>'
      +'<td class="'+(ec>0.01&&jour?"pos":"")+'">'+(ec>0?"+ ":ec<0?"− ":"")+hh(Math.abs(ec))+'</td>'
      +'<td>'+(!jour?'<span class="muted">payé à l\'heure</span>':ec>0.01?'<b style="color:var(--red)">'+jj(ec/JH)+'</b>':'—')+'</td>'
      +'<td>'+(jour?(pj/JH).toFixed(2).replace(".",","):l.prix.toFixed(2).replace(".",","))+' €</td><td><b>'+(jour?(fj*pj/fh).toFixed(2).replace(".",","):l.prix.toFixed(2).replace(".",","))+' €</b></td></tr>';
  });});
  if(!any)h+='<tr><td class="l muted" colspan="8">Rien encore : le tableau se remplit dès que Patrice note ses journées.</td></tr>';
  else h+='<tr class="tot"><td class="l">Total</td><td>'+jj(T.j)+'</td><td>'+hh(T.hv)+'</td><td>'+hh(T.hf)+'</td><td></td><td style="color:var(--red)">'+jj(T.g/JH)+'<span class="ps">soit '+hh(T.g)+'</span></td><td></td><td></td></tr>';
  h+='</tbody></table></div>';
  h+='<div class="expl"><div><b>Ce qui est facturé</b>Au jour ou au forfait : le montant du marché, quelles que soient les heures. À l\'heure : les heures réellement faites.</div>'
    +'<div><b>Ce qui est suivi en plus</b>Une journée de 10 h vendue '+JH+' h, c\'est '+(10-JH)+' h données. L\'outil les additionne et les traduit en jours gratuits. Patrice voit ce compteur dans ses chantiers.</div>'
    +'<div><b>À quoi ça sert</b>Le € / h réel montre ce que la journée rapporte vraiment. Les jours gratuits servent d\'argument pour un avenant ou pour le prix du prochain marché.</div></div></div>';
  var mo={};Object.keys(S.P).forEach(function(d){var p=S.P[d];if(!p.it)return;var tr=p.it.filter(function(i){return !estPerso(i.ch);});if(!tr.length)return;var k=d.slice(0,7);mo[k]=mo[k]||{j:0,h:0};mo[k].j++;tr.forEach(function(i){mo[k].h+=(+i.h);});});
  var ks=Object.keys(mo).sort();
  if(ks.length){h+='<div class="card"><div class="chead"><h2>Par mois</h2><span class="muted" style="font-size:12.5px">tous chantiers confondus</span></div><div class="tw"><table><thead><tr><th class="l">Mois</th><th>Jours travaillés</th><th>Heures faites</th><th>Base '+JH+' h / jour</th><th>Écart</th><th>Moyenne / jour</th></tr></thead><tbody>';
    ks.forEach(function(k){var m=mo[k],b=m.j*JH;h+='<tr><td class="l" style="text-transform:capitalize">'+monthLabel(k)+'</td><td>'+m.j+'</td><td>'+hh(m.h)+'</td><td>'+hh(b)+'</td><td class="'+(m.h-b>0?"pos":"")+'">'+(m.h-b>0?"+ ":"")+hh(m.h-b)+'</td><td>'+hh(m.h/m.j)+'</td></tr>';});
    h+='</tbody></table></div></div>';}
  return h;
}

function tRapport(){
  var chs=S.chantiers.filter(function(c){return !c.perso&&RF==="all"||!c.perso&&(RF==="cl:"+c.client)||(RF==="ch:"+c.id);});
  var ids=chs.map(function(c){return c.id;}), lots=S.lots.filter(function(l){return ids.indexOf(l.ch)>=0;});
  var K={sig:0,real:0,fact:0,enc:0};
  lots.forEach(function(l){var m=montant(l).v;K.sig+=m;K.real+=realise(l);if(l.st!=="a")K.fact+=m;if(l.st==="p")K.enc+=m;});
  var opt='<option value="all"'+(RF==="all"?" selected":"")+'>Tout</option><optgroup label="Par client">'+S.clients.map(function(c){return '<option value="cl:'+c.id+'"'+(RF==="cl:"+c.id?" selected":"")+'>'+esc(c.nom)+'</option>';}).join("")+'</optgroup><optgroup label="Par chantier">'+chOrder().filter(function(c){return !c.perso;}).map(function(c){return '<option value="ch:'+c.id+'"'+(RF==="ch:"+c.id?" selected":"")+'>'+esc(c.nom)+'</option>';}).join("")+'</optgroup>';
  var h='<div class="rhead"><h2>Contrats, facturation et paiements</h2><select id="rf" data-chg="rf" aria-label="Périmètre du rapport">'+opt+'</select><span class="muted">situation au '+fdy(TODAY)+' · montants HT</span></div>';
  h+='<div class="kpis"><div class="kpi"><div class="l">Signé</div><div class="v">'+eur(K.sig)+'</div><div class="s">marchés + avenants</div></div>'
    +'<div class="kpi"><div class="l">Réalisé</div><div class="v">'+eur(K.real)+'</div><div class="s">au prorata des jours faits</div></div>'
    +'<div class="kpi"><div class="l">Facturé</div><div class="v">'+eur(K.fact)+'</div><div class="s">reste à facturer : '+eur(K.sig-K.fact)+'</div></div>'
    +'<div class="kpi"><div class="l">Encaissé</div><div class="v">'+eur(K.enc)+'</div><div class="s">reste à encaisser : '+eur(K.fact-K.enc)+'</div></div></div>';
  if(RF!=="all"){
    h+='<div class="card" style="margin-bottom:16px"><div class="chead"><h2>'+(RF.slice(0,3)==="ch:"?"État du chantier":"État du client")+' à envoyer</h2><span class="muted" style="font-size:12.5px">le même que celui que Patrice envoie depuis son téléphone</span></div><div class="etatw"><div class="etat" id="etat-txt">'+esc(etatTexte(RF,RO))+'</div><div class="side2">'
      +'<div class="opts"><button data-act="ropt" data-k="f" aria-pressed="'+RO.f+'">Montants et factures</button><button data-act="ropt" data-k="h" aria-pressed="'+RO.h+'">Heures réalisées</button></div>'
      +'<button class="bp" data-act="rpdf">Télécharger le PDF</button><button class="bs" data-act="rcopy">Copier le texte</button></div></div></div>';
  }
  S.clients.forEach(function(cl){var cc=chs.filter(function(c){return c.client===cl.id;});if(!cc.length)return;
    var t={m:0,f:0,p:0};
    h+='<div class="card"><div class="chead"><h2>'+esc(cl.nom)+'</h2><span class="muted" style="font-size:12.5px">'+tarifTxt(cl.mode,cl.tarif)+'</span></div><table class="fit"><thead><tr><th class="l">Chantier · contrat</th><th>Montant</th><th>Fait</th><th class="l">Facturation</th><th>Reste à facturer</th><th>Reste à encaisser</th><th>Payé</th></tr></thead><tbody>';
    cc.forEach(function(c){var r=R.ch[c.id];
      if(r.sansMarche){h+='<tr><td class="l"><b>'+esc(c.nom)+'</b> · sans marché<span class="ps">'+jj(r.faits)+' · '+hh(r.h)+(depCh(c).n?' · déplacements '+depCh(c).n+' × '+eur(depCh(c).pu)+' = '+eur(depCh(c).v):'')+'</span></td><td>—</td><td>—</td><td class="l"><span class="badge b-n">devis à faire</span></td><td>—</td><td>—</td><td></td></tr>';return;}
      lotsOf(c.id).forEach(function(l){var s=R.lot[l.id],mm=montant(l),m=mm.v,f=l.st!=="a"?m:0,p=l.st==="p"?m:0,e=etat(l);t.m+=m;t.f+=f;t.p+=p;
      h+='<tr><td class="l"><b>'+esc(c.nom)+'</b> · '+lotName(l)+'<span class="ps">'+jj(+l.jours)+(s.du?' · '+fd(s.du)+' → '+fd(s.au):'')+'</span></td><td>'+eur(m)+(mm.est?'<span class="ps">estimé</span>':'')+'</td><td>'+Math.round(Math.min(s.faits,l.jours)/l.jours*100)+' %</td>'
        +'<td class="l"><span class="badge b-'+e+'">'+STL[e]+'</span><span class="ps">'+esc(libFact(l))+'</span></td><td>'+(m-f?eur(m-f):'—')+'</td><td>'+(f-p?eur(f-p):'—')+'</td><td><button class="paye" data-act="paye" data-lot="'+l.id+'" aria-pressed="'+(l.st==="p")+'" aria-label="Payé : '+esc(c.nom)+' '+lotName(l)+'"><span class="box">'+(l.st==="p"?"✓":"")+'</span></button></td></tr>';});
      var dpr=depCh(c);if(dpr.n)h+='<tr><td class="l"><b>'+esc(c.nom)+'</b> · Déplacements<span class="ps">'+dpr.n+' × '+eur(dpr.pu)+'</span></td><td>'+eur(dpr.v)+'</td><td></td><td class="l"><span class="ps">en plus du marché, à ajouter à la facture</span></td><td></td><td></td><td></td></tr>';});
    h+='<tr class="tot"><td class="l">Total</td><td>'+eur(t.m)+'</td><td></td><td class="l">facturé '+eur(t.f)+' · encaissé '+eur(t.p)+'</td><td>'+eur(t.m-t.f)+'</td><td>'+eur(t.f-t.p)+'</td><td></td></tr></tbody></table></div>';
  });
  var gch=chOrder().filter(function(c){return ids.indexOf(c.id)>=0&&R.ch[c.id].fin;});
  if(gch.length){
    var a=gch.reduce(function(m,c){var d=R.ch[c.id].debut;return !m||d<m?d:m;},null), b=gch.reduce(function(m,c){var d=R.ch[c.id].fin;return !m||d>m?d:m;},null);
    if(a<add(TODAY,-60))a=add(TODAY,-60);
    while(dow(a)!==0)a=add(a,-1);
    var cols=[];for(var d=a;d<=b||dow(d)!==0;d=add(d,1))if(dow(d)<5)cols.push(d);
    h+='<div class="card"><div class="chead"><h2>Calendrier</h2><span class="muted" style="font-size:12.5px">jours ouvrés · plein = fait, clair = prévu · trait noir = aujourd\'hui</span></div><div class="gantt"><div class="gt" style="grid-template-columns:auto repeat('+cols.length+',minmax(0,1fr))">';
    h+='<div class="gl"></div>'+cols.map(function(d,k){var pas=cols.length>90?3:cols.length>45?2:1;return '<div class="gw">'+(dow(d)===0&&Math.floor(k/5)%pas===0?fd(d):"")+'</div>';}).join("");
    gch.forEach(function(c){
      h+='<div class="gl">'+esc(c.nom)+'<small>'+esc(clientOf(c))+'</small></div>';
      cols.forEach(function(d){var e=(R.days[d]||[]).filter(function(x){return x.ch===c.id;})[0], bg="var(--surface-2)";
        if(ferie(d))bg="var(--line)";
        if(e)bg=e.kind==="fait"?col(c):tint(col(c));
        h+='<div class="gd'+(d===TODAY?" td":"")+'" style="background:'+bg+'" title="'+fd(d)+'"></div>';});
    });
    h+='</div></div></div>';
  }
  return h;
}

/* ================= rendu & événements ================= */
function renderAll(){compute();renderLui();renderMoi();}

document.addEventListener("click",function(e){
  var v=e.target.closest("[data-view]");if(v){setView(v.dataset.view);return;}
  var t=e.target.closest("#tabs button[data-tab]");if(t){TAB=t.dataset.tab;DELARM=null;OUV={};renderMoi();return;}
  var n=e.target.closest("#lnav button[data-lt]");if(n){LT=n.dataset.lt;renderLui();window.scrollTo(0,0);var sc=document.getElementById("lui");if(sc)sc.scrollTop=0;return;}
  if(e.target.id==="ov"){closeSheet();return;}
  var b=e.target.closest("[data-act]");if(!b)return;
  var a=b.dataset.act, i=+b.dataset.i;
  if(a==="open")return openSheet(b.dataset.d,"lui");
  if(a==="open2")return openSheet(b.dataset.d,"moi");
  if(a==="etat")return openEtat(b.dataset.sel,"lui");
  if(a==="newcl")return openCl("lui",null);
  if(a==="editcl")return openCl("lui",b.dataset.cl);
  if(a==="notif")return activerNotif();
  if(a==="notif-cacher"){lsSet("prtech_notif_cache","1");return renderLui();}
  if(a==="lm"){LM=shiftMonth(LM,+b.dataset.k);return renderLui();}
  if(a==="am"){AM=shiftMonth(AM,+b.dataset.k);return renderMoi();}
  if(a==="mode2"){MODE=b.dataset.k;return renderMoi();}
  if(a==="ropt"){RO[b.dataset.k]=!RO[b.dataset.k];return renderMoi();}
  if(a==="rpdf")return envoyerPDF(RF,RO);
  if(a==="rcopy")return copier(etatTexte(RF,RO));
  if(!SH&&a==="addav"){var ls=lotsOf(b.dataset.ch), last=ls[ls.length-1], nn=ls.filter(function(l){return l.type==="A";}).length+1, bf=finsSnapshot();
    var nl={id:uid(),ch:b.dataset.ch,type:"A",num:nn,jours:5,mode:last?last.mode:"jour",prix:last?last.prix:300,montant:null,st:"a",nf:"",df:"",dp:"",ref:"",doc:""};
    S.lots.push(nl);sLot(nl);compute();var m=diffFins(bf);toast("Avenant "+nn+" ajouté (5 jours)",m.length?"Fins prévues : "+m.join(" · "):"Ajuste les jours et le forfait");return renderAll();}
  if(!SH&&a==="mkmarche"){var ch=chById(b.dataset.ch), cl=clById(ch.client)||{mode:"jour",tarif:300}, r=R.ch[ch.id];
    var ml={id:uid(),ch:ch.id,type:"M",num:1,jours:Math.max(1,Math.ceil(r.faits)),mode:cl.mode,prix:cl.tarif,montant:null,st:"a",nf:"",df:"",dp:"",ref:"",doc:""};
    S.lots.push(ml);sLot(ml);compute();toast("Marché créé pour "+ch.nom,"Ajuste les jours si le devis en prévoit plus : le planning suivra");return renderAll();}
  if(!SH&&a==="dellot"){if(DELARM!==b.dataset.lot){DELARM=b.dataset.lot;return renderMoi();}
    var id=b.dataset.lot;S.lots=S.lots.filter(function(l){return l.id!==id;});DELARM=null;pousser("prtech_contrat_supprimer",{p_jeton:JETON,p_id:id});return renderAll();}
  if(a==="editlot"){var lo=lotById(b.dataset.lot);SH={kind:"lot",ctx:"moi",id:lo.id,dr:JSON.parse(JSON.stringify(lo)),err:"",arme:false};placeOv("moi");return renderSheet();}
  if(a==="editch"){SH={kind:"ch",ctx:"moi",id:b.dataset.ch,err:"",arme:false};placeOv("moi");return renderSheet();}
  if(a==="editcl2")return openCl("moi",b.dataset.cl);
  if(a==="newperso")return openPerso(b.closest("#moi")?"moi":"lui",null);
  if(a==="editperso")return openPerso(b.closest("#moi")?"moi":"lui",b.dataset.ch);
  if(!SH&&a==="mkresa"){var g=series().filter(function(x){return x.serie===b.dataset.serie;})[0];if(!g)return;
    var cg=g.client&&clById(g.client);if(!cg)return toast("Client manquant","Ouvre un jour réservé et choisis le client");
    var bfr=finsSnapshot(), nch={id:uid(),client:cg.id,nom:g.lib||cg.nom,court:"",ville:"",adresse:"",col:S.chantiers.length%PAL.length,debut:g.jours[0],ant:0,par:MOI.nom};
    S.chantiers.push(nch);sChantier(nch);
    var nlo={id:uid(),ch:nch.id,type:"M",num:1,jours:g.jours.length,mode:cg.mode,prix:cg.tarif,montant:null,st:"a",nf:"",df:"",dp:"",ref:"",doc:""};
    S.lots.push(nlo);sLot(nlo);g.jours.forEach(function(k){delete S.V[k];});dPrev(g.jours);
    compute();toast("Marché créé : "+nch.nom,g.jours.length+" jours à partir du "+fd(g.jours[0])+". Ajuste les jours et le montant d'après le devis.");return renderAll();}
  if(a==="newcl2")return openCl("moi",null);
  if(!SH&&a==="delcl0"){openCl("moi",b.dataset.cl);SH.arme=true;return renderSheet();}
  if(!SH&&a==="delch0"){SH={kind:"ch",ctx:"moi",id:b.dataset.ch,err:"",arme:true};placeOv("moi");return renderSheet();}
  if(!SH&&a==="dellot0"){var lz=lotById(b.dataset.lot);SH={kind:"lot",ctx:"moi",id:lz.id,dr:JSON.parse(JSON.stringify(lz)),err:"",arme:true};placeOv("moi");return renderSheet();}
  if(!SH&&a==="tgch"){OUV[b.dataset.ch]=!OUV[b.dataset.ch];return renderMoi();}
  if(!SH&&a==="paye"){var lp=lotById(b.dataset.lot);if(!lp)return;
    if(lp.st==="p"){lp.st="f";lp.dp="";}else{lp.st="p";if(!lp.df)lp.df=TODAY;if(!lp.dp)lp.dp=TODAY;}
    sLot(lp);compute();toast(lp.st==="p"?"Payé : "+chById(lp.ch).nom+" · "+lotName(lp):"Paiement retiré : "+chById(lp.ch).nom+" · "+lotName(lp),lp.st==="p"?"Encaissé, tous les onglets sont à jour":"Remis en attente de paiement");return renderAll();}
  if(!SH)return;
  if(a==="close")return closeSheet();
  if(a==="eopt"){SH.o[b.dataset.k]=!SH.o[b.dataset.k];return renderSheet();}
  if(a==="copy")return copier(etatTexte(SH.sel,SH.o));
  if(a==="pdf")return envoyerPDF(SH.sel,SH.o);
  if(a==="lst"){lireLot();var dr=SH.dr;dr.st=b.dataset.k;if(dr.st!=="a"&&!dr.df)dr.df=TODAY;if(dr.st==="p"&&!dr.dp)dr.dp=TODAY;SH.err="";return renderSheet();}
  if(a==="savelot"){lireLot();var d2=SH.dr;
    if(!(d2.jours>0)){SH.err="Indique un nombre de jours.";return renderSheet();}
    if(!(d2.prix>=0)){SH.err="Indique un prix.";return renderSheet();}
    if(d2.st==="a"){d2.df="";d2.dp="";}if(d2.st==="f")d2.dp="";
    var lo2=lotById(SH.id),bfl=finsSnapshot();["jours","mode","prix","montant","ref","st","nf","df","dp"].forEach(function(k){lo2[k]=d2[k];});
    sLot(lo2);return finish(bfl,lotName(lo2)+" enregistré");}
  if(a==="dellot2"){if(!SH.arme){SH.arme=true;return renderSheet();}
    var idl=SH.id,bfd=finsSnapshot();S.lots=S.lots.filter(function(l){return l.id!==idl;});pousser("prtech_contrat_supprimer",{p_jeton:JETON,p_id:idl});return finish(bfd,"Contrat supprimé");}
  if(a==="savech"){var c3=chById(SH.id),nm3=val("ch-nom"),db3=val("ch-debut");
    if(!nm3){SH.err="Donne un nom au chantier.";return renderSheet();}
    if(!db3){SH.err="Indique la date de début.";return renderSheet();}
    var bfc=finsSnapshot();c3.nom=nm3;c3.court=val("ch-court");c3.client=val("ch-client")||c3.client;c3.ville=val("ch-ville");c3.debut=db3;c3.adresse=val("ch-adresse");
    sChantier(c3);return finish(bfc,c3.nom+" enregistré");}
  if(a==="delcl"){if(!SH.arme){SH.arme=true;return renderSheet();}
    var idc=SH.id,bfk=finsSnapshot();
    S.chantiers.filter(function(c){return c.client===idc;}).forEach(function(c){S.lots.filter(function(l){return l.ch===c.id;}).forEach(function(l){pousser("prtech_contrat_supprimer",{p_jeton:JETON,p_id:l.id});});c.archive=true;sChantier(c);});
    S.lots=S.lots.filter(function(l){return chById(l.ch)&&chById(l.ch).client!==idc;});S.chantiers=S.chantiers.filter(function(c){return c.client!==idc;});
    S.clients=S.clients.filter(function(c){return c.id!==idc;});dClient(idc);return finish(bfk,"Client supprimé");}
  if(a==="delch"){if(!SH.arme){SH.arme=true;return renderSheet();}
    var idh=SH.id,chh=chById(idh),bfh=finsSnapshot();
    S.lots.filter(function(l){return l.ch===idh;}).forEach(function(l){pousser("prtech_contrat_supprimer",{p_jeton:JETON,p_id:l.id});});
    chh.archive=true;sChantier(chh);S.lots=S.lots.filter(function(l){return l.ch!==idh;});S.chantiers=S.chantiers.filter(function(c){return c.id!==idh;});
    return finish(bfh,"Chantier supprimé : "+chh.nom);}
  if(a==="savecl"){var nom=val("ncl-nom");if(!nom){SH.err="Donne un nom au client.";return renderSheet();}
    var edit=!!SH.id, c0=edit?clById(SH.id):{id:uid(),par:MOI.nom};
    c0.nom=nom;c0.mode=val("ncl-mode")||"jour";c0.tarif=parseFloat(val("ncl-tarif").replace(",","."))||0;c0.tel=val("ncl-tel");c0.dep=parseFloat(val("ncl-dep").replace(",","."))||0;
    if(!edit)S.clients.push(c0);sClient(c0);
    closeSheet();toast(edit?"Client modifié":"Client enregistré : "+nom,MOI.role==="artisan"?"Marine le voit dans son outil":"Patrice le voit sur son téléphone");return renderAll();}
  if(a==="mode"){lireHeures();SH.mode=b.dataset.k;SH.err="";return renderSheet();}
  if(a==="delv1"){var bv=finsSnapshot(),dv=SH.d;delete S.V[dv];dPrev([dv]);return finish(bv,"Réservation du "+fd(dv)+" retirée");}
  if(a==="delvs"){var bv2=finsSnapshot(),sv=SH.v.serie,js2=Object.keys(S.V).filter(function(k){return S.V[k].serie===sv;});js2.forEach(function(k){delete S.V[k];});dPrev(js2);return finish(bv2,js2.length+" jours réservés retirés");}
  if(a==="pick"){lireHeures();if(SH.rows[i].ch!==b.dataset.ch)SH.rows[i].dep=false;SH.rows[i].ch=b.dataset.ch;SH.err="";return renderSheet();}
  if(a==="pmode"){lirePerso();SH.dr.fixe=b.dataset.k==="fixe";if(SH.dr.fixe&&SH.dr.au<SH.dr.du)SH.dr.au=SH.dr.du;SH.err="";return renderSheet();}
  if(a==="saveperso")return savePerso();
  if(a==="delperso"){var cp=chById(SH.id),fp0=R.ch[cp.id].faits;
    if(!SH.arme){SH.arme=true;return renderSheet();}
    var bp0=finsSnapshot();
    if(fp0>0){
      // des jours sont déjà faits : on les garde, on retire seulement la suite
      var faitsJ=Object.keys(S.P).filter(function(k){return S.P[k].it&&S.P[k].it.some(function(x){return x.ch===cp.id;});}).sort();
      if(cp.fixe)cp.fin=faitsJ[faitsJ.length-1];else cp.jp=Math.round(fp0*2)/2;
      sChantier(cp);return finish(bp0,"Tâche perso arrêtée : "+jj(fp0)+(fp0>1?" gardés":" gardé")+", la suite est retirée");}
    cp.archive=true;sChantier(cp);S.chantiers=S.chantiers.filter(function(x){return x.id!==cp.id;});return finish(bp0,"Tâche perso annulée");}
  if(a==="dep"){lireHeures();SH.rows[i].dep=!SH.rows[i].dep;return renderSheet();}
  if(a==="nc-open"){lireHeures();SH.nc=i;return renderSheet();}
  if(a==="nc-create"){lireHeures();return createChantierFromSheet(i);}
  if(a==="hstep"){lireHeures();SH.rows[i].h=Math.max(0.5,Math.min(16,(SH.rows[i].h||0)+(+b.dataset.k)));var inp=document.getElementById("hin-"+i);if(inp)inp.value=SH.rows[i].h;return;}
  if(a==="addrow"){lireHeures();SH.rows[0].h=Math.min(SH.rows[0].h,4);SH.rows.push({ch:null,h:4});return renderSheet();}
  if(a==="delrow"){lireHeures();SH.rows.splice(i,1);if(SH.nc>=SH.rows.length)SH.nc=-1;return renderSheet();}
  if(a==="reason"){SH.abs=b.dataset.k;SH.err="";return renderSheet();}
  if(a==="savesheet")return saveSheet();
  if(a==="clearday"){var bf3=finsSnapshot(),dd=SH.d;delete S.P[dd];sJour(dd);return finish(bf3,"Journée du "+fd(dd)+" effacée");}
});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&SH)closeSheet();});
document.addEventListener("focusin",function(e){if(e.target.dataset&&e.target.dataset.hin!=null)try{e.target.select();}catch(_){}});

document.addEventListener("change",function(e){
  var t=e.target, k=t.dataset.chg;if(!k)return;
  if(k==="rf"){RF=t.value;return renderMoi();}
  var before=finsSnapshot();
  if(k==="ch"){var c=chById(t.dataset.ch), f1=t.dataset.k;
    if(f1==="debut"){if(!t.value)return renderMoi();c.debut=t.value;}
    else if(f1==="ant"){var v1=parseFloat(t.value);c.ant=v1>0?v1:0;}
    else c[f1]=t.value.trim();
    sChantier(c);}
  if(k==="cl"){var cl=clById(t.dataset.cl), f0=t.dataset.k;
    if(f0==="tarif"){var v0=parseFloat(t.value);if(!(v0>=0))return renderMoi();cl.tarif=v0;}else if(f0==="nom"){if(!t.value.trim())return renderMoi();cl.nom=t.value.trim();}else cl[f0]=t.value;
    sClient(cl);}
  if(k==="lot"){var l=lotById(t.dataset.lot), f=t.dataset.k;
    if(f==="jours"||f==="prix"){var v=parseFloat(t.value);if(!(v>0))return renderMoi();l[f]=v;}
    else if(f==="montant"){var vm=parseFloat(t.value);l.montant=vm>0?vm:null;}
    else l[f]=t.value;
    if(f==="st"&&t.value!=="a"&&!l.df)l.df=TODAY;
    if(f==="st"&&t.value==="p"&&!l.dp)l.dp=TODAY;
    if(f==="st"&&t.value!=="p")l.dp="";
    if(f==="dp"&&t.value)l.st="p";
    sLot(l);}
  compute();
  var m=diffFins(before);
  if(m.length)toast("Planning recalculé","Fins prévues : "+m.join(" · "));
  renderAll();
});

document.addEventListener("submit",function(e){
  if(e.target.id==="login"){e.preventDefault();return connexion();}
  if(e.target.id!=="fnew")return;e.preventDefault();
  var cid=val("n-client"), cn=val("n-cnom"), nom=val("n-nom");
  if(!nom)return toast("Nom du chantier manquant","Remplis « Chantier »");
  if(cid==="new"){if(!cn)return toast("Nom du client manquant","Remplis « Nouveau client »");var nc={id:uid(),nom:cn,mode:"jour",tarif:300,tel:"",dep:55,par:MOI.nom};S.clients.push(nc);sClient(nc);cid=nc.id;}
  var cl=clById(cid), before=finsSnapshot();
  var ch={id:uid(),client:cid,nom:nom,court:val("n-court"),ville:val("n-ville"),adresse:"",col:S.chantiers.length%PAL.length,debut:val("n-debut")||TODAY,ant:0,par:MOI.nom};
  S.chantiers.push(ch);sChantier(ch);
  var mt=parseFloat(val("n-montant"));
  var lo={id:uid(),ch:ch.id,type:"M",num:1,jours:parseFloat(val("n-jours"))||1,mode:cl.mode,prix:cl.tarif,montant:mt>0?mt:null,st:"a",nf:"",df:"",dp:"",ref:"",doc:""};
  S.lots.push(lo);sLot(lo);
  compute();var m=diffFins(before);
  toast("Marché créé : "+nom,"Du "+fd(R.ch[ch.id].debut)+" au "+fd(R.ch[ch.id].fin)+(m.length?" · "+m.join(" · "):""));renderAll();
});

/* ================= démarrage ================= */
function ecranConnexion(msg){
  document.getElementById("racine").innerHTML='<form class="login" id="login"><img src="prtech-logo.png" alt="PR.TECH"><p>Entre ton code personnel, ou ouvre le lien reçu.</p>'
    +'<input id="code" autocomplete="one-time-code" autocapitalize="characters" placeholder="PRT-XXXXXX" aria-label="Code personnel">'
    +(msg?'<div class="err">'+esc(msg)+'</div>':'')+'<button class="bp" type="submit">Entrer</button></form>';
}
function connexion(){
  var c=val("code").toUpperCase().replace(/\s/g,"");if(c&&c.indexOf("PRT-")!==0)c="PRT-"+c;
  rpc("prtech_connexion",{p_code:c}).then(function(j){if(!j)return ecranConnexion("Code inconnu. Vérifie avec Marine.");JETON=j;lsSet("prtech_jeton",j);demarrer();},
    function(){ecranConnexion("Pas de réseau. Réessaie dans un instant.");});
}
/* Marine connectée à son compte AP2M (tour de contrôle, même site) : PRTECH s'ouvre sans code. */
var ESSAI_AP2M=false;
function jetonAP2M(){
  var s=null;try{s=JSON.parse(lsGet("sb-zhgqqaedtmeowpjadtqr-auth-token"));}catch(e){}
  if(!s||!s.access_token||(s.expires_at&&s.expires_at*1000<Date.now()+30000))return Promise.resolve(null);
  return fetch(API+"/rest/v1/rpc/prtech_jeton_ap2m",{method:"POST",headers:{"apikey":CLE,"Authorization":"Bearer "+s.access_token,"Content-Type":"application/json"},body:"{}"})
    .then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});
}
function sansCode(msg){
  if(ESSAI_AP2M)return ecranConnexion(msg);ESSAI_AP2M=true;
  jetonAP2M().then(function(j){if(j&&/^[0-9a-f-]{36}$/i.test(j)){JETON=j;lsSet("prtech_jeton",j);demarrer();}else ecranConnexion(msg);});
}
function demarrer(){
  var cache=null;try{cache=JSON.parse(lsGet("prtech_cache"));}catch(e){}
  function go(){squelette();setView(VIEW);renderAll();vider();}
  charger().then(go,function(e){
    if(e.serveur){lsSet("prtech_jeton",null);JETON=null;return sansCode("Ce lien n'est plus valable.");}
    if(cache&&cache.moi){appliquer(cache);go();toast("Hors ligne","Tes saisies partiront dès que le réseau revient");}
    else ecranConnexion("Pas de réseau pour le premier chargement.");
  });
}
(function(){
  var q=new URLSearchParams(location.search), k=q.get("k"), o=q.get("onglet");
  if(k&&/^[0-9a-f-]{36}$/i.test(k)){JETON=k;lsSet("prtech_jeton",k);}
  // Lien direct depuis la tour de contrôle AP2M : ?onglet=marches ouvre la gestion sur cet onglet
  if(o&&/^(planning|marches|heures|rapport)$/.test(o))TAB=o;
  if(k||o)history.replaceState(null,"",location.pathname);
  // Une nouvelle version de l'appli prend la main : la page se recharge seule (sauf saisie en cours).
  if("serviceWorker" in navigator){
    var avait=!!navigator.serviceWorker.controller, recharge=false;
    navigator.serviceWorker.addEventListener("controllerchange",function(){if(avait&&!recharge&&!SH){recharge=true;location.reload();}});
    navigator.serviceWorker.register("prtech-sw.js").then(function(reg){
      document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")reg.update().catch(function(){});});
    }).catch(function(){});
  }
  document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"&&JETON&&S)recharger();});
  setInterval(function(){if(document.visibilityState==="visible"&&JETON&&S)recharger();},90000);
  if(!JETON)return sansCode();
  demarrer();
})();
