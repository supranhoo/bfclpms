/**
 * Menu Registry / Override types (Phase 1+2 foundation).
 *
 * The registry catalogs every renamable/movable menu item with its DEFAULTS.
 * Overrides store per-client customizations on top. The resolver merges them
 * into a final tree, but `menu_key` is ALWAYS immutable — it is the permission
 * key, the audit key, and the SSOT identity for the item.
 */

export type MenuRegistryRow = {
  menu_key: string;
  default_label: string;
  module_key: string;
  default_parent_key: string | null;
  menu_level: 1 | 2 | 3 | 4;
  route_path: string | null;
  icon_name: string | null;
  default_sort_order: number;
  accepts_children: boolean;
  is_renamable: boolean;
  is_movable: boolean;
  is_cross_app_movable: boolean;
  is_system_required: boolean;
  feature_key: string | null;
  permission_key: string | null;
  is_custom?: boolean;
  color?: string | null;
  created_by?: string | null;
};

export type MenuOverrideRow = {
  id: string;
  menu_key: string;
  client_id: string | null;
  custom_label: string | null;
  custom_parent_key: string | null;
  custom_sort_order: number | null;
  custom_menu_level: number | null;
  custom_module_key: string | null;
  is_active: boolean;
  updated_by: string | null;
  updated_at: string;
};

export type ResolvedMenuNode = {
  menu_key: string;
  label: string;            // override → default
  parent_key: string | null; // override → default
  sort_order: number;        // override → default
  module_key: string;
  menu_level: 1 | 2 | 3 | 4;
  route_path: string | null;
  icon_name: string | null;
  accepts_children: boolean;
  is_renamable: boolean;
  is_movable: boolean;
  is_cross_app_movable: boolean;
  is_system_required: boolean;
  /** True when ANY of label/parent/sort was overridden vs default. */
  is_overridden: boolean;
  is_custom?: boolean;
  color?: string | null;
};