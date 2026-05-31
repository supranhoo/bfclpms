import { Building2, Network, Factory, MapPin, Users, Layers, type LucideIcon } from 'lucide-react';
import type { EmployeeDims, SlabLike } from './slabMatcher';

/**
 * Single source of truth for increment-slab scope dimensions.
 * Add a new entry here (and the matching columns on `increment_slabs`
 * + `EmployeeDims`/`SlabLike`) and the editor modal will pick it up
 * automatically — no layout changes needed.
 */
export interface SlabDimensionConfig {
  /** key on the slab row (array of master ids) */
  slabKey: keyof SlabLike;
  /** key on the resolved employee dims (single id) */
  empKey: keyof EmployeeDims;
  /** key on `useEligibilityMasters()` result */
  mastersKey:
    | 'companies'
    | 'divisions'
    | 'business_units'
    | 'locations'
    | 'employee_categories'
    | 'levels';
  label: string;
  placeholder: string;
  icon: LucideIcon;
}

export const SLAB_DIMENSIONS: SlabDimensionConfig[] = [
  { slabKey: 'company_ids',            empKey: 'company_id',            mastersKey: 'companies',           label: 'Company',           placeholder: 'All companies',       icon: Building2 },
  { slabKey: 'division_ids',           empKey: 'division_id',           mastersKey: 'divisions',           label: 'Division',          placeholder: 'All divisions',       icon: Network },
  { slabKey: 'business_unit_ids',      empKey: 'business_unit_id',      mastersKey: 'business_units',      label: 'Business Unit',     placeholder: 'All business units',  icon: Factory },
  { slabKey: 'location_ids',           empKey: 'location_id',           mastersKey: 'locations',           label: 'Location',          placeholder: 'All locations',       icon: MapPin },
  { slabKey: 'employee_category_ids',  empKey: 'employee_category_id',  mastersKey: 'employee_categories', label: 'Employee Category', placeholder: 'All emp categories',  icon: Users },
  { slabKey: 'level_ids',              empKey: 'level_id',              mastersKey: 'levels',              label: 'Level',             placeholder: 'All levels',          icon: Layers },
];