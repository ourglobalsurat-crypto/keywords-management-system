import type { ListType, MatchType, Status, GeoTier, Role, Action } from "./constants";

export type Keyword = {
  id: number;
  list_type: ListType;
  campaign: string;
  ad_group: string;
  keyword: string;
  match_type: MatchType;
  intent_cluster: string;
  priority: string;
  notes: string;
  status: Status;
  created_by: string;
  created_role: Role | "";
  updated_by: string;
  updated_role: Role | "";
  created_at: string;
  updated_at: string;
};

export type NegativeKeyword = {
  id: number;
  category: string;
  keyword: string;
  match_type: MatchType;
  notes: string;
  status: Status;
  created_by: string;
  created_role: Role | "";
  updated_by: string;
  updated_role: Role | "";
  created_at: string;
  updated_at: string;
};

export type GeoLocation = {
  id: number;
  tier: GeoTier;
  location: string;
  notes: string;
  created_by: string;
  created_role: Role | "";
  created_at: string;
};

export type Seed = {
  id: number;
  seed_term: string;
  seed_url: string;
  source_site: string;
  notes: string;
  created_by: string;
  created_role: Role | "";
  created_at: string;
};

export type ActivityEntry = {
  id: number;
  actor_name: string;
  actor_role: Role | "";
  action: Action;
  entity_type: string;
  entity_id: number | null;
  keyword_text: string;
  details: Record<string, unknown>;
  created_at: string;
};
