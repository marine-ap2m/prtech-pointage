-- Suppression d'un client depuis l'onglet « Clients, marchés & avenants ».
-- Retire aussi ses chantiers archivés (leurs contrats partent en cascade).
-- Refuse si un chantier actif existe encore : l'appli le supprime d'abord.
create or replace function public.prtech_client_supprimer(p_jeton uuid, p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.prtech_qui(p_jeton);
  if exists(select 1 from public.prtech_chantiers where client_id = p_id and not archive) then
    raise exception 'Ce client a encore des chantiers : supprime-les d''abord';
  end if;
  delete from public.prtech_chantiers where client_id = p_id;
  delete from public.prtech_clients where id = p_id;
end $$;
