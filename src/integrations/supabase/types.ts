export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      access_profile_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          profile_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          profile_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          profile_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_profile_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_profile_menu_rights: {
        Row: {
          can_add: boolean
          can_delete: boolean
          can_update: boolean
          can_view: boolean
          id: string
          menu_key: string
          profile_id: string
        }
        Insert: {
          can_add?: boolean
          can_delete?: boolean
          can_update?: boolean
          can_view?: boolean
          id?: string
          menu_key: string
          profile_id: string
        }
        Update: {
          can_add?: boolean
          can_delete?: boolean
          can_update?: boolean
          can_view?: boolean
          id?: string
          menu_key?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_profile_menu_rights_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_profile_org_scope: {
        Row: {
          business_unit_id: string | null
          company_id: string | null
          department_id: string | null
          designation: string | null
          division_id: string | null
          id: string
          level: string | null
          location: string | null
          pms_grade: string | null
          profile_id: string
        }
        Insert: {
          business_unit_id?: string | null
          company_id?: string | null
          department_id?: string | null
          designation?: string | null
          division_id?: string | null
          id?: string
          level?: string | null
          location?: string | null
          pms_grade?: string | null
          profile_id: string
        }
        Update: {
          business_unit_id?: string | null
          company_id?: string | null
          department_id?: string | null
          designation?: string | null
          division_id?: string | null
          id?: string
          level?: string | null
          location?: string | null
          pms_grade?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_profile_org_scope_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_profile_org_scope_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_profile_org_scope_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_profile_org_scope_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_profile_org_scope_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          app_name: string
          created_at: string
          enable_org_kpi_auto_inherit: boolean
          enable_org_kpi_autopull: boolean
          enable_org_kpi_forward_sync: boolean
          enabled_modules: Json | null
          id: string
          login_background_url: string | null
          login_hero_description: string | null
          login_hero_headline: string | null
          login_wallpapers: Json | null
          logo_url: string | null
          organization_name: string
          pms_policy_content: string | null
          pms_policy_url: string | null
          pms_policy_visible_roles: Json | null
          updated_at: string
          view_mode_strip_color: string
        }
        Insert: {
          app_name?: string
          created_at?: string
          enable_org_kpi_auto_inherit?: boolean
          enable_org_kpi_autopull?: boolean
          enable_org_kpi_forward_sync?: boolean
          enabled_modules?: Json | null
          id?: string
          login_background_url?: string | null
          login_hero_description?: string | null
          login_hero_headline?: string | null
          login_wallpapers?: Json | null
          logo_url?: string | null
          organization_name?: string
          pms_policy_content?: string | null
          pms_policy_url?: string | null
          pms_policy_visible_roles?: Json | null
          updated_at?: string
          view_mode_strip_color?: string
        }
        Update: {
          app_name?: string
          created_at?: string
          enable_org_kpi_auto_inherit?: boolean
          enable_org_kpi_autopull?: boolean
          enable_org_kpi_forward_sync?: boolean
          enabled_modules?: Json | null
          id?: string
          login_background_url?: string | null
          login_hero_description?: string | null
          login_hero_headline?: string | null
          login_wallpapers?: Json | null
          logo_url?: string | null
          organization_name?: string
          pms_policy_content?: string | null
          pms_policy_url?: string | null
          pms_policy_visible_roles?: Json | null
          updated_at?: string
          view_mode_strip_color?: string
        }
        Relationships: []
      }
      audit_kpi_assignments: {
        Row: {
          assigned_by: string | null
          auditor_id: string
          created_at: string
          employee_id: string
          id: string
        }
        Insert: {
          assigned_by?: string | null
          auditor_id: string
          created_at?: string
          employee_id: string
          id?: string
        }
        Update: {
          assigned_by?: string | null
          auditor_id?: string
          created_at?: string
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_kpi_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_kpi_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_kpi_assignments_auditor_id_fkey"
            columns: ["auditor_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_kpi_assignments_auditor_id_fkey"
            columns: ["auditor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_kpi_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_kpi_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_kpi_level_assignments: {
        Row: {
          assigned_by: string | null
          auditor_id: string
          created_at: string
          id: string
          kpi_id: string
        }
        Insert: {
          assigned_by?: string | null
          auditor_id: string
          created_at?: string
          id?: string
          kpi_id: string
        }
        Update: {
          assigned_by?: string | null
          auditor_id?: string
          created_at?: string
          id?: string
          kpi_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_kpi_level_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_kpi_level_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_kpi_level_assignments_auditor_id_fkey"
            columns: ["auditor_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_kpi_level_assignments_auditor_id_fkey"
            columns: ["auditor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_kpi_level_assignments_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: true
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_lookup_attempts: {
        Row: {
          attempted_at: string
          client_ip: string | null
          id: number
          succeeded: boolean
        }
        Insert: {
          attempted_at?: string
          client_ip?: string | null
          id?: number
          succeeded?: boolean
        }
        Update: {
          attempted_at?: string
          client_ip?: string | null
          id?: number
          succeeded?: boolean
        }
        Relationships: []
      }
      backup_logs: {
        Row: {
          backup_format: string
          backup_type: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          status: string
          tables_count: number | null
          total_rows: number | null
        }
        Insert: {
          backup_format?: string
          backup_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          status?: string
          tables_count?: number | null
          total_rows?: number | null
        }
        Update: {
          backup_format?: string
          backup_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          status?: string
          tables_count?: number | null
          total_rows?: number | null
        }
        Relationships: []
      }
      bundle_assignment_logs: {
        Row: {
          assigned_by: string | null
          bundle_id: string
          created_at: string
          employee_id: string
          id: string
          kpis_created: number
          review_period: string
          review_year: number
        }
        Insert: {
          assigned_by?: string | null
          bundle_id: string
          created_at?: string
          employee_id: string
          id?: string
          kpis_created?: number
          review_period: string
          review_year: number
        }
        Update: {
          assigned_by?: string | null
          bundle_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          kpis_created?: number
          review_period?: string
          review_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_assignment_logs_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_assignment_logs_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_assignment_logs_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "template_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_assignment_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_assignment_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_unit_sub_units: {
        Row: {
          business_unit_id: string
          capacity: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          product_types: string[] | null
          sort_order: number
        }
        Insert: {
          business_unit_id: string
          capacity?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          product_types?: string[] | null
          sort_order?: number
        }
        Update: {
          business_unit_id?: string
          capacity?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          product_types?: string[] | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_unit_sub_units_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      business_units: {
        Row: {
          code: string | null
          created_at: string
          division_id: string | null
          id: string
          level: string | null
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          division_id?: string | null
          id?: string
          level?: string | null
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          division_id?: string | null
          id?: string
          level?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_units_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          code: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
        }
        Relationships: []
      }
      custom_reports: {
        Row: {
          category: string | null
          color: string
          columns: Json
          created_at: string
          created_by: string | null
          default_sort: Json | null
          description: string | null
          export_excel: boolean
          export_pdf: boolean
          filename_template: string | null
          filters: Json
          group_by: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          view_roles: string[]
        }
        Insert: {
          category?: string | null
          color?: string
          columns?: Json
          created_at?: string
          created_by?: string | null
          default_sort?: Json | null
          description?: string | null
          export_excel?: boolean
          export_pdf?: boolean
          filename_template?: string | null
          filters?: Json
          group_by?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          view_roles?: string[]
        }
        Update: {
          category?: string | null
          color?: string
          columns?: Json
          created_at?: string
          created_by?: string | null
          default_sort?: Json | null
          description?: string | null
          export_excel?: boolean
          export_pdf?: boolean
          filename_template?: string | null
          filters?: Json
          group_by?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          view_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "custom_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          business_unit_id: string | null
          code: string | null
          created_at: string
          id: string
          level: string | null
          name: string
        }
        Insert: {
          business_unit_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          level?: string | null
          name: string
        }
        Update: {
          business_unit_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          level?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      designations: {
        Row: {
          code: string | null
          company_id: string | null
          created_at: string
          id: string
          level: string | null
          name: string
        }
        Insert: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          level?: string | null
          name: string
        }
        Update: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          level?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "designations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          code: string | null
          company_id: string | null
          created_at: string
          id: string
          level: string | null
          name: string
        }
        Insert: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          level?: string | null
          name: string
        }
        Update: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          level?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "divisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_change_audit: {
        Row: {
          id: string
          new_email: string | null
          old_email: string | null
          performed_at: string
          performed_by: string | null
          source: string
          user_id: string
        }
        Insert: {
          id?: string
          new_email?: string | null
          old_email?: string | null
          performed_at?: string
          performed_by?: string | null
          source: string
          user_id: string
        }
        Update: {
          id?: string
          new_email?: string | null
          old_email?: string | null
          performed_at?: string
          performed_by?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      email_dispatch_queue: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          recipient_email: string
          recipient_name: string | null
          sent_at: string | null
          template_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string | null
          template_key: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string | null
          template_key?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          metadata: Json | null
          provider: string | null
          recipient_email: string
          recipient_name: string | null
          status: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          provider?: string | null
          recipient_email: string
          recipient_name?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          provider?: string | null
          recipient_email?: string
          recipient_name?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      employee_incentive_eligibility: {
        Row: {
          absent_days: number
          availability_percent: number | null
          created_at: string
          custom_fields: Json | null
          department_lti_count: number
          employee_id: string
          entered_by: string | null
          has_warning_letter: boolean
          id: string
          is_contract_worker: boolean
          is_suspended: boolean
          lti_count: number
          lwp_days: number
          present_days: number | null
          production_value: number | null
          remarks: string | null
          review_period: string
          review_year: number
          shutdown_hours: number | null
          total_working_days: number | null
          updated_at: string
          weekly_off_days: number | null
        }
        Insert: {
          absent_days?: number
          availability_percent?: number | null
          created_at?: string
          custom_fields?: Json | null
          department_lti_count?: number
          employee_id: string
          entered_by?: string | null
          has_warning_letter?: boolean
          id?: string
          is_contract_worker?: boolean
          is_suspended?: boolean
          lti_count?: number
          lwp_days?: number
          present_days?: number | null
          production_value?: number | null
          remarks?: string | null
          review_period: string
          review_year: number
          shutdown_hours?: number | null
          total_working_days?: number | null
          updated_at?: string
          weekly_off_days?: number | null
        }
        Update: {
          absent_days?: number
          availability_percent?: number | null
          created_at?: string
          custom_fields?: Json | null
          department_lti_count?: number
          employee_id?: string
          entered_by?: string | null
          has_warning_letter?: boolean
          id?: string
          is_contract_worker?: boolean
          is_suspended?: boolean
          lti_count?: number
          lwp_days?: number
          present_days?: number | null
          production_value?: number | null
          remarks?: string | null
          review_period?: string
          review_year?: number
          shutdown_hours?: number | null
          total_working_days?: number | null
          updated_at?: string
          weekly_off_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_incentive_eligibility_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_incentive_eligibility_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_incentive_records: {
        Row: {
          adjusted_score: number | null
          adjustment_source_period: string | null
          base_incentive_percent: number
          computed_at: string | null
          confirmed_by: string | null
          created_at: string
          disqualification_reasons: string[] | null
          employee_id: string
          final_incentive_percent: number
          id: string
          incentive_amount: number | null
          incentive_status: string
          is_disqualified: boolean
          is_retroactive_adjustment: boolean
          lti_penalty_percent: number
          matched_slab_id: string | null
          original_score: number | null
          payment_period: string
          pms_score: number | null
          pro_rata_factor: number
          production_value: number | null
          program_id: string | null
          review_period: string
          review_year: number
          status: string
          status_overridden_at: string | null
          status_overridden_by: string | null
          status_override_reason: string | null
          updated_at: string
        }
        Insert: {
          adjusted_score?: number | null
          adjustment_source_period?: string | null
          base_incentive_percent?: number
          computed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          disqualification_reasons?: string[] | null
          employee_id: string
          final_incentive_percent?: number
          id?: string
          incentive_amount?: number | null
          incentive_status?: string
          is_disqualified?: boolean
          is_retroactive_adjustment?: boolean
          lti_penalty_percent?: number
          matched_slab_id?: string | null
          original_score?: number | null
          payment_period?: string
          pms_score?: number | null
          pro_rata_factor?: number
          production_value?: number | null
          program_id?: string | null
          review_period: string
          review_year: number
          status?: string
          status_overridden_at?: string | null
          status_overridden_by?: string | null
          status_override_reason?: string | null
          updated_at?: string
        }
        Update: {
          adjusted_score?: number | null
          adjustment_source_period?: string | null
          base_incentive_percent?: number
          computed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          disqualification_reasons?: string[] | null
          employee_id?: string
          final_incentive_percent?: number
          id?: string
          incentive_amount?: number | null
          incentive_status?: string
          is_disqualified?: boolean
          is_retroactive_adjustment?: boolean
          lti_penalty_percent?: number
          matched_slab_id?: string | null
          original_score?: number | null
          payment_period?: string
          pms_score?: number | null
          pro_rata_factor?: number
          production_value?: number | null
          program_id?: string | null
          review_period?: string
          review_year?: number
          status?: string
          status_overridden_at?: string | null
          status_overridden_by?: string | null
          status_override_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_incentive_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_incentive_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_incentive_records_matched_slab_id_fkey"
            columns: ["matched_slab_id"]
            isOneToOne: false
            referencedRelation: "incentive_slabs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_incentive_records_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_job_descriptions: {
        Row: {
          created_at: string
          created_by: string | null
          designation: string
          id: string
          key_responsibilities: Json | null
          qualifications: string | null
          required_skills: Json | null
          role_purpose: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          designation: string
          id?: string
          key_responsibilities?: Json | null
          qualifications?: string | null
          required_skills?: Json | null
          role_purpose?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          designation?: string
          id?: string
          key_responsibilities?: Json | null
          qualifications?: string | null
          required_skills?: Json | null
          role_purpose?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      employee_working_days: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          month: string
          updated_at: string | null
          working_days: number
          year: number
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          month: string
          updated_at?: string | null
          working_days: number
          year: number
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          month?: string
          updated_at?: string | null
          working_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_working_days_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_working_days_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      frequency_config: {
        Row: {
          active_month: number | null
          created_at: string | null
          description: string | null
          frequency: string
          id: string
          locked_months: Json | null
          review_window_rules: Json | null
          sub_frequency: string
        }
        Insert: {
          active_month?: number | null
          created_at?: string | null
          description?: string | null
          frequency: string
          id?: string
          locked_months?: Json | null
          review_window_rules?: Json | null
          sub_frequency: string
        }
        Update: {
          active_month?: number | null
          created_at?: string | null
          description?: string | null
          frequency?: string
          id?: string
          locked_months?: Json | null
          review_window_rules?: Json | null
          sub_frequency?: string
        }
        Relationships: []
      }
      iac_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          payload: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: number
          payload?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: number
          payload?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      iac_capabilities: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_destructive: boolean
          label: string
          module: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_destructive?: boolean
          label: string
          module: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_destructive?: boolean
          label?: string
          module?: string
        }
        Relationships: []
      }
      iac_role_capabilities: {
        Row: {
          capability_code: string
          role_id: string
        }
        Insert: {
          capability_code: string
          role_id: string
        }
        Update: {
          capability_code?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iac_role_capabilities_capability_code_fkey"
            columns: ["capability_code"]
            isOneToOne: false
            referencedRelation: "iac_capabilities"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "iac_role_capabilities_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "iac_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      iac_roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          module: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          module: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          module?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      iac_user_role_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          expires_at: string | null
          id: string
          role_id: string
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["iac_scope_type"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          expires_at?: string | null
          id?: string
          role_id: string
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["iac_scope_type"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          expires_at?: string | null
          id?: string
          role_id?: string
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["iac_scope_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iac_user_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "iac_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_field_settings: {
        Row: {
          field_key: string
          field_label: string
          id: string
          import_type: string
          is_mandatory: boolean
          is_visible: boolean
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          field_key: string
          field_label: string
          id?: string
          import_type: string
          is_mandatory?: boolean
          is_visible?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          field_key?: string
          field_label?: string
          id?: string
          import_type?: string
          is_mandatory?: boolean
          is_visible?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      import_progress: {
        Row: {
          categories_created: number
          completed_at: string | null
          created_at: string
          employees_created: number
          errors: Json | null
          id: string
          kpis_imported: number
          processed_rows: number
          started_at: string
          status: string
          total_rows: number
          updated_at: string
          user_id: string
        }
        Insert: {
          categories_created?: number
          completed_at?: string | null
          created_at?: string
          employees_created?: number
          errors?: Json | null
          id: string
          kpis_imported?: number
          processed_rows?: number
          started_at?: string
          status?: string
          total_rows?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          categories_created?: number
          completed_at?: string | null
          created_at?: string
          employees_created?: number
          errors?: Json | null
          id?: string
          kpis_imported?: number
          processed_rows?: number
          started_at?: string
          status?: string
          total_rows?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      incentive_allocation_rules: {
        Row: {
          allocation_pct: number
          created_at: string
          id: string
          program_id: string
          sort_order: number
          source_label: string
          target_bu_id: string | null
          target_sub_unit: string | null
        }
        Insert: {
          allocation_pct?: number
          created_at?: string
          id?: string
          program_id: string
          sort_order?: number
          source_label: string
          target_bu_id?: string | null
          target_sub_unit?: string | null
        }
        Update: {
          allocation_pct?: number
          created_at?: string
          id?: string
          program_id?: string
          sort_order?: number
          source_label?: string
          target_bu_id?: string | null
          target_sub_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incentive_allocation_rules_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_allocation_rules_target_bu_id_fkey"
            columns: ["target_bu_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_custom_tab_data: {
        Row: {
          created_at: string | null
          employee_id: string
          field_values: Json
          id: string
          program_id: string
          tab_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          field_values?: Json
          id?: string
          program_id: string
          tab_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          field_values?: Json
          id?: string
          program_id?: string
          tab_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incentive_custom_tab_data_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_custom_tab_data_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_custom_tab_data_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_custom_tab_data_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "incentive_program_custom_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_disqualification_rules: {
        Row: {
          created_at: string
          exemption_notes: string | null
          id: string
          is_active: boolean
          program_id: string
          rule_config: Json
          rule_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exemption_notes?: string | null
          id?: string
          is_active?: boolean
          program_id: string
          rule_config?: Json
          rule_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exemption_notes?: string | null
          id?: string
          is_active?: boolean
          program_id?: string
          rule_config?: Json
          rule_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incentive_disqualification_rules_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_eligibility_fields: {
        Row: {
          created_at: string | null
          default_value: string | null
          field_key: string
          field_label: string
          field_type: string
          id: string
          is_active: boolean | null
          is_required: boolean | null
          program_id: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          default_value?: string | null
          field_key: string
          field_label: string
          field_type?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          program_id?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          default_value?: string | null
          field_key?: string
          field_label?: string
          field_type?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          program_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "incentive_eligibility_fields_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_production_rates: {
        Row: {
          created_at: string | null
          effective_from: string
          employee_id: string | null
          entity_id: string | null
          id: string
          program_id: string
          rate_per_ton: number
          rate_type: string
          remarks: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          effective_from?: string
          employee_id?: string | null
          entity_id?: string | null
          id?: string
          program_id: string
          rate_per_ton?: number
          rate_type?: string
          remarks?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          effective_from?: string
          employee_id?: string | null
          entity_id?: string | null
          id?: string
          program_id?: string
          rate_per_ton?: number
          rate_type?: string
          remarks?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incentive_production_rates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_production_rates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_production_rates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_program_custom_tabs: {
        Row: {
          created_at: string | null
          fields: Json
          id: string
          is_active: boolean | null
          program_id: string
          sort_order: number | null
          tab_key: string
          tab_label: string
        }
        Insert: {
          created_at?: string | null
          fields?: Json
          id?: string
          is_active?: boolean | null
          program_id: string
          sort_order?: number | null
          tab_key: string
          tab_label: string
        }
        Update: {
          created_at?: string | null
          fields?: Json
          id?: string
          is_active?: boolean | null
          program_id?: string
          sort_order?: number | null
          tab_key?: string
          tab_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "incentive_program_custom_tabs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_program_mappings: {
        Row: {
          created_at: string
          id: string
          mapping_type: string
          mapping_value: string
          program_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mapping_type: string
          mapping_value: string
          program_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mapping_type?: string
          mapping_value?: string
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incentive_program_mappings_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_program_types: {
        Row: {
          created_at: string
          id: string
          label: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          value?: string
        }
        Relationships: []
      }
      incentive_programs: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          incentive_base: string
          is_active: boolean
          min_kra_score: number
          name: string
          no_kra_eligible: boolean
          program_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          incentive_base?: string
          is_active?: boolean
          min_kra_score?: number
          name: string
          no_kra_eligible?: boolean
          program_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          incentive_base?: string
          is_active?: boolean
          min_kra_score?: number
          name?: string
          no_kra_eligible?: boolean
          program_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      incentive_score_revisions: {
        Row: {
          affected_period: string
          affected_year: number
          created_at: string
          employee_id: string
          id: string
          is_payroll_notified: boolean
          notified_at: string | null
          original_score: number | null
          original_slab_percent: number | null
          revised_score: number | null
          revised_slab_percent: number | null
          revision_reason: string
          source_kpi_id: string | null
          source_period: string | null
        }
        Insert: {
          affected_period: string
          affected_year: number
          created_at?: string
          employee_id: string
          id?: string
          is_payroll_notified?: boolean
          notified_at?: string | null
          original_score?: number | null
          original_slab_percent?: number | null
          revised_score?: number | null
          revised_slab_percent?: number | null
          revision_reason: string
          source_kpi_id?: string | null
          source_period?: string | null
        }
        Update: {
          affected_period?: string
          affected_year?: number
          created_at?: string
          employee_id?: string
          id?: string
          is_payroll_notified?: boolean
          notified_at?: string | null
          original_score?: number | null
          original_slab_percent?: number | null
          revised_score?: number | null
          revised_slab_percent?: number | null
          revision_reason?: string
          source_kpi_id?: string | null
          source_period?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incentive_score_revisions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_score_revisions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_slab_categories: {
        Row: {
          created_at: string | null
          id: string
          label: string
          sort_order: number | null
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          label: string
          sort_order?: number | null
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string
          sort_order?: number | null
          value?: string
        }
        Relationships: []
      }
      incentive_slabs: {
        Row: {
          applicable_designations: string[] | null
          business_unit_id: string | null
          company_id: string | null
          created_at: string
          department_id: string | null
          division_id: string | null
          effective_from: string
          id: string
          incentive_percent: number
          location: string | null
          max_value: number
          min_value: number
          pms_grade_id: string | null
          pms_level: string | null
          program_id: string
          rating_label: string | null
          slab_category: string
          sort_order: number
          sub_category: string | null
          updated_at: string
        }
        Insert: {
          applicable_designations?: string[] | null
          business_unit_id?: string | null
          company_id?: string | null
          created_at?: string
          department_id?: string | null
          division_id?: string | null
          effective_from?: string
          id?: string
          incentive_percent?: number
          location?: string | null
          max_value: number
          min_value: number
          pms_grade_id?: string | null
          pms_level?: string | null
          program_id: string
          rating_label?: string | null
          slab_category: string
          sort_order?: number
          sub_category?: string | null
          updated_at?: string
        }
        Update: {
          applicable_designations?: string[] | null
          business_unit_id?: string | null
          company_id?: string | null
          created_at?: string
          department_id?: string | null
          division_id?: string | null
          effective_from?: string
          id?: string
          incentive_percent?: number
          location?: string | null
          max_value?: number
          min_value?: number
          pms_grade_id?: string | null
          pms_level?: string | null
          program_id?: string
          rating_label?: string | null
          slab_category?: string
          sort_order?: number
          sub_category?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incentive_slabs_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_slabs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_slabs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_slabs_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_slabs_pms_grade_id_fkey"
            columns: ["pms_grade_id"]
            isOneToOne: false
            referencedRelation: "pms_grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_slabs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_vessel_rates: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          program_id: string
          rate_per_vessel: number
          remarks: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          program_id: string
          rate_per_vessel?: number
          remarks?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          program_id?: string
          rate_per_vessel?: number
          remarks?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incentive_vessel_rates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          kpi_id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          on_behalf_of: string | null
          on_behalf_role: string | null
          performed_by: string | null
          submission_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          kpi_id: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          on_behalf_of?: string | null
          on_behalf_role?: string | null
          performed_by?: string | null
          submission_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          kpi_id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          on_behalf_of?: string | null
          on_behalf_role?: string | null
          performed_by?: string | null
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_audit_logs_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_audit_logs_on_behalf_of_fkey"
            columns: ["on_behalf_of"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_audit_logs_on_behalf_of_fkey"
            columns: ["on_behalf_of"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_audit_logs_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "review_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_definitions: {
        Row: {
          canonical_kpi_name: string
          canonical_kra_name: string
          category_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          canonical_kpi_name: string
          canonical_kra_name: string
          category_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          canonical_kpi_name?: string
          canonical_kra_name?: string
          category_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_definitions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kra_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_mention_access: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          kpi_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          kpi_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          kpi_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_mention_access_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_name_aliases: {
        Row: {
          category_id: string
          created_at: string
          definition_id: string
          id: string
          variant_kpi_name: string
          variant_kra_name: string
        }
        Insert: {
          category_id: string
          created_at?: string
          definition_id: string
          id?: string
          variant_kpi_name: string
          variant_kra_name: string
        }
        Update: {
          category_id?: string
          created_at?: string
          definition_id?: string
          id?: string
          variant_kpi_name?: string
          variant_kra_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_name_aliases_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kra_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_name_aliases_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_observation_replies: {
        Row: {
          created_at: string
          evidence_urls: Json | null
          id: string
          observation_id: string
          reply_by: string
          reply_text: string
        }
        Insert: {
          created_at?: string
          evidence_urls?: Json | null
          id?: string
          observation_id: string
          reply_by: string
          reply_text: string
        }
        Update: {
          created_at?: string
          evidence_urls?: Json | null
          id?: string
          observation_id?: string
          reply_by?: string
          reply_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_observation_replies_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "kpi_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_observation_replies_reply_by_fkey"
            columns: ["reply_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_observation_replies_reply_by_fkey"
            columns: ["reply_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_observations: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          evidence_url: string | null
          evidence_urls: Json | null
          id: string
          is_applied: boolean
          kpi_id: string
          observation_type: Database["public"]["Enums"]["observation_type"]
          observer_role: string
          reviewed_at: string | null
          reviewed_by: string | null
          score_impact: number
          status: string
          ticket_number: string | null
          title: string
          updated_at: string | null
          visibility: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          evidence_url?: string | null
          evidence_urls?: Json | null
          id?: string
          is_applied?: boolean
          kpi_id: string
          observation_type?: Database["public"]["Enums"]["observation_type"]
          observer_role: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_impact?: number
          status?: string
          ticket_number?: string | null
          title: string
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          evidence_url?: string | null
          evidence_urls?: Json | null
          id?: string
          is_applied?: boolean
          kpi_id?: string
          observation_type?: Database["public"]["Enums"]["observation_type"]
          observer_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_impact?: number
          status?: string
          ticket_number?: string | null
          title?: string
          updated_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_observations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_observations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_observations_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_observations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_observations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_queries: {
        Row: {
          created_at: string
          entity_type: Database["public"]["Enums"]["query_entity_type"]
          evidence_url: string | null
          evidence_urls: Json | null
          id: string
          kpi_id: string
          query_type: string
          raised_by: string
          raised_to: string
          reason: string
          resolution_evidence_url: string | null
          resolution_evidence_urls: Json | null
          resolution_notes: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["query_status"]
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_type?: Database["public"]["Enums"]["query_entity_type"]
          evidence_url?: string | null
          evidence_urls?: Json | null
          id?: string
          kpi_id: string
          query_type?: string
          raised_by: string
          raised_to: string
          reason: string
          resolution_evidence_url?: string | null
          resolution_evidence_urls?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["query_status"]
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_type?: Database["public"]["Enums"]["query_entity_type"]
          evidence_url?: string | null
          evidence_urls?: Json | null
          id?: string
          kpi_id?: string
          query_type?: string
          raised_by?: string
          raised_to?: string
          reason?: string
          resolution_evidence_url?: string | null
          resolution_evidence_urls?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["query_status"]
          ticket_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_queries_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_queries_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_queries_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_queries_raised_to_fkey"
            columns: ["raised_to"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_queries_raised_to_fkey"
            columns: ["raised_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_registry_audit_log: {
        Row: {
          action: string
          affected_definition_id: string | null
          category_id: string | null
          created_at: string
          id: string
          payload: Json
          performed_by: string | null
          primary_definition_id: string | null
          reason: string | null
        }
        Insert: {
          action: string
          affected_definition_id?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          performed_by?: string | null
          primary_definition_id?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          affected_definition_id?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          performed_by?: string | null
          primary_definition_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_registry_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_registry_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_rollback_requests: {
        Row: {
          actioned_at: string | null
          actioned_by: string | null
          created_at: string
          id: string
          kpi_id: string
          reason: string
          requested_by: string
          requested_from_status: string
          status: string
          target_status: string
        }
        Insert: {
          actioned_at?: string | null
          actioned_by?: string | null
          created_at?: string
          id?: string
          kpi_id: string
          reason: string
          requested_by: string
          requested_from_status: string
          status?: string
          target_status: string
        }
        Update: {
          actioned_at?: string | null
          actioned_by?: string | null
          created_at?: string
          id?: string
          kpi_id?: string
          reason?: string
          requested_by?: string
          requested_from_status?: string
          status?: string
          target_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_rollback_requests_actioned_by_fkey"
            columns: ["actioned_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_rollback_requests_actioned_by_fkey"
            columns: ["actioned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_rollback_requests_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_rollback_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_rollback_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_scanner_skips: {
        Row: {
          category_id: string
          id: string
          normalized_kpi: string
          reason: string | null
          skipped_at: string
          skipped_by: string | null
        }
        Insert: {
          category_id: string
          id?: string
          normalized_kpi: string
          reason?: string | null
          skipped_at?: string
          skipped_by?: string | null
        }
        Update: {
          category_id?: string
          id?: string
          normalized_kpi?: string
          reason?: string | null
          skipped_at?: string
          skipped_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_scanner_skips_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kra_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_standardization_actions: {
        Row: {
          action_type: string
          affected_row_count: number
          category_id: string | null
          definition_id: string | null
          id: string
          payload: Json
          performed_at: string
          performed_by: string | null
          reverse_notes: string | null
          reversed_at: string | null
          reversed_by: string | null
        }
        Insert: {
          action_type: string
          affected_row_count?: number
          category_id?: string | null
          definition_id?: string | null
          id?: string
          payload?: Json
          performed_at?: string
          performed_by?: string | null
          reverse_notes?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Update: {
          action_type?: string
          affected_row_count?: number
          category_id?: string | null
          definition_id?: string | null
          id?: string
          payload?: Json
          performed_at?: string
          performed_by?: string | null
          reverse_notes?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Relationships: []
      }
      kpi_templates: {
        Row: {
          applicable_roles: string[] | null
          category_id: string | null
          created_at: string
          created_by: string | null
          criteria: string | null
          description: string | null
          frequency: string | null
          id: string
          is_active: boolean | null
          kpi_name: string
          kra_name: string
          qualitative_options: Json | null
          r0: string | null
          r1: string | null
          r2: string | null
          r3: string | null
          r4: string | null
          r5: string | null
          require_resubmit_reason: boolean | null
          source_of_data: string | null
          target_value: number | null
          threshold_mode: string | null
          title: string
          uom: string | null
          uom_type: string | null
          updated_at: string
          weightage: number | null
        }
        Insert: {
          applicable_roles?: string[] | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          criteria?: string | null
          description?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          kpi_name: string
          kra_name: string
          qualitative_options?: Json | null
          r0?: string | null
          r1?: string | null
          r2?: string | null
          r3?: string | null
          r4?: string | null
          r5?: string | null
          require_resubmit_reason?: boolean | null
          source_of_data?: string | null
          target_value?: number | null
          threshold_mode?: string | null
          title: string
          uom?: string | null
          uom_type?: string | null
          updated_at?: string
          weightage?: number | null
        }
        Update: {
          applicable_roles?: string[] | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          criteria?: string | null
          description?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          kpi_name?: string
          kra_name?: string
          qualitative_options?: Json | null
          r0?: string | null
          r1?: string | null
          r2?: string | null
          r3?: string | null
          r4?: string | null
          r5?: string | null
          require_resubmit_reason?: boolean | null
          source_of_data?: string | null
          target_value?: number | null
          threshold_mode?: string | null
          title?: string
          uom?: string | null
          uom_type?: string | null
          updated_at?: string
          weightage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kra_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      kpis: {
        Row: {
          category_id: string
          created_at: string
          criteria: string | null
          day_count_type: string | null
          employee_id: string
          frequency: string | null
          frequency_cycle_start: string | null
          id: string
          is_frequency_locked: boolean | null
          is_issued: boolean | null
          is_org_level: boolean | null
          kpi_definition_id: string | null
          kpi_name: string
          kra_name: string
          org_level_scope: string | null
          qualitative_options: Json | null
          r0: string | null
          r1: string | null
          r2: string | null
          r3: string | null
          r4: string | null
          r5: string | null
          ref_code: string | null
          require_resubmit_reason: boolean | null
          review_period: string | null
          review_year: number | null
          source_of_data: string | null
          source_template_id: string | null
          status: Database["public"]["Enums"]["review_status"] | null
          sub_frequency: string | null
          target_value: number | null
          threshold_mode: string | null
          uom: string | null
          uom_type: string | null
          updated_at: string
          weightage: number | null
          weightage_variance_acknowledged: boolean
        }
        Insert: {
          category_id: string
          created_at?: string
          criteria?: string | null
          day_count_type?: string | null
          employee_id: string
          frequency?: string | null
          frequency_cycle_start?: string | null
          id?: string
          is_frequency_locked?: boolean | null
          is_issued?: boolean | null
          is_org_level?: boolean | null
          kpi_definition_id?: string | null
          kpi_name: string
          kra_name: string
          org_level_scope?: string | null
          qualitative_options?: Json | null
          r0?: string | null
          r1?: string | null
          r2?: string | null
          r3?: string | null
          r4?: string | null
          r5?: string | null
          ref_code?: string | null
          require_resubmit_reason?: boolean | null
          review_period?: string | null
          review_year?: number | null
          source_of_data?: string | null
          source_template_id?: string | null
          status?: Database["public"]["Enums"]["review_status"] | null
          sub_frequency?: string | null
          target_value?: number | null
          threshold_mode?: string | null
          uom?: string | null
          uom_type?: string | null
          updated_at?: string
          weightage?: number | null
          weightage_variance_acknowledged?: boolean
        }
        Update: {
          category_id?: string
          created_at?: string
          criteria?: string | null
          day_count_type?: string | null
          employee_id?: string
          frequency?: string | null
          frequency_cycle_start?: string | null
          id?: string
          is_frequency_locked?: boolean | null
          is_issued?: boolean | null
          is_org_level?: boolean | null
          kpi_definition_id?: string | null
          kpi_name?: string
          kra_name?: string
          org_level_scope?: string | null
          qualitative_options?: Json | null
          r0?: string | null
          r1?: string | null
          r2?: string | null
          r3?: string | null
          r4?: string | null
          r5?: string | null
          ref_code?: string | null
          require_resubmit_reason?: boolean | null
          review_period?: string | null
          review_year?: number | null
          source_of_data?: string | null
          source_template_id?: string | null
          status?: Database["public"]["Enums"]["review_status"] | null
          sub_frequency?: string | null
          target_value?: number | null
          threshold_mode?: string | null
          uom?: string | null
          uom_type?: string | null
          updated_at?: string
          weightage?: number | null
          weightage_variance_acknowledged?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "kpis_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kra_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpis_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpis_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpis_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpis_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "kpi_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      kra_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_org_level: boolean
          name: string
          org_scoring_mode: string | null
          weightage: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_org_level?: boolean
          name: string
          org_scoring_mode?: string | null
          weightage?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_org_level?: boolean
          name?: string
          org_scoring_mode?: string | null
          weightage?: number
        }
        Relationships: []
      }
      kra_rollover_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          employees_affected: number
          error_message: string | null
          id: string
          kpis_copied: number
          source_period: string
          source_year: number
          status: string
          target_period: string
          target_year: number
          triggered_by: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          employees_affected?: number
          error_message?: string | null
          id?: string
          kpis_copied?: number
          source_period: string
          source_year: number
          status?: string
          target_period: string
          target_year: number
          triggered_by?: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          employees_affected?: number
          error_message?: string | null
          id?: string
          kpis_copied?: number
          source_period?: string
          source_year?: number
          status?: string
          target_period?: string
          target_year?: number
          triggered_by?: string
        }
        Relationships: []
      }
      levels: {
        Row: {
          code: string | null
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "levels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          code: string | null
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_access_config: {
        Row: {
          allowed_roles: string[]
          created_at: string | null
          display_order: number
          id: string
          menu_key: string
          menu_name: string
          section: string
          updated_at: string | null
        }
        Insert: {
          allowed_roles?: string[]
          created_at?: string | null
          display_order?: number
          id?: string
          menu_key: string
          menu_name: string
          section: string
          updated_at?: string | null
        }
        Update: {
          allowed_roles?: string[]
          created_at?: string | null
          display_order?: number
          id?: string
          menu_key?: string
          menu_name?: string
          section?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      menu_access_user_overrides: {
        Row: {
          created_at: string | null
          granted_by: string | null
          id: string
          menu_key: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          granted_by?: string | null
          id?: string
          menu_key: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          granted_by?: string | null
          id?: string
          menu_key?: string
          user_id?: string
        }
        Relationships: []
      }
      modules: {
        Row: {
          code: string
          color: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          icon: string
          id: string
          is_enabled: boolean | null
          name: string
          route: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon: string
          id?: string
          is_enabled?: boolean | null
          name: string
          route: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string
          id?: string
          is_enabled?: boolean | null
          name?: string
          route?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          kpi_id: string | null
          message: string
          metadata: Json | null
          related_user_id: string | null
          snooze_count: number
          snoozed_until: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          kpi_id?: string | null
          message: string
          metadata?: Json | null
          related_user_id?: string | null
          snooze_count?: number
          snoozed_until?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          kpi_id?: string | null
          message?: string
          metadata?: Json | null
          related_user_id?: string | null
          snooze_count?: number
          snoozed_until?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      okv_migration_history: {
        Row: {
          action: string
          category_id: string
          id: string
          kpi_name: string
          kra_name: string
          migrated_at: string
          migrated_by: string | null
          new_okv_id: string | null
          new_scope: string
          old_scope: string
          original_okv_id: string | null
          original_payload: Json | null
          review_period: string
          review_year: number
          triggered_by: string | null
        }
        Insert: {
          action: string
          category_id: string
          id?: string
          kpi_name: string
          kra_name: string
          migrated_at?: string
          migrated_by?: string | null
          new_okv_id?: string | null
          new_scope: string
          old_scope: string
          original_okv_id?: string | null
          original_payload?: Json | null
          review_period: string
          review_year: number
          triggered_by?: string | null
        }
        Update: {
          action?: string
          category_id?: string
          id?: string
          kpi_name?: string
          kra_name?: string
          migrated_at?: string
          migrated_by?: string | null
          new_okv_id?: string | null
          new_scope?: string
          old_scope?: string
          original_okv_id?: string | null
          original_payload?: Json | null
          review_period?: string
          review_year?: number
          triggered_by?: string | null
        }
        Relationships: []
      }
      org_kpi_data_entry_logs: {
        Row: {
          action: string
          category_id: string
          created_at: string
          id: string
          kpi_name: string
          kra_name: string
          new_value: number | null
          old_value: number | null
          org_kpi_value_id: string | null
          performed_by: string | null
          remarks: string | null
          review_period: string
          review_year: number
        }
        Insert: {
          action: string
          category_id: string
          created_at?: string
          id?: string
          kpi_name: string
          kra_name: string
          new_value?: number | null
          old_value?: number | null
          org_kpi_value_id?: string | null
          performed_by?: string | null
          remarks?: string | null
          review_period: string
          review_year: number
        }
        Update: {
          action?: string
          category_id?: string
          created_at?: string
          id?: string
          kpi_name?: string
          kra_name?: string
          new_value?: number | null
          old_value?: number | null
          org_kpi_value_id?: string | null
          performed_by?: string | null
          remarks?: string | null
          review_period?: string
          review_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_kpi_data_entry_logs_org_kpi_value_id_fkey"
            columns: ["org_kpi_value_id"]
            isOneToOne: false
            referencedRelation: "org_kpi_values"
            referencedColumns: ["id"]
          },
        ]
      }
      org_kpi_data_owners: {
        Row: {
          assigned_by: string | null
          category_id: string
          created_at: string | null
          id: string
          kpi_name: string
          kra_name: string
          owner_id: string
        }
        Insert: {
          assigned_by?: string | null
          category_id: string
          created_at?: string | null
          id?: string
          kpi_name: string
          kra_name: string
          owner_id: string
        }
        Update: {
          assigned_by?: string | null
          category_id?: string
          created_at?: string | null
          id?: string
          kpi_name?: string
          kra_name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_kpi_data_owners_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_data_owners_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_data_owners_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kra_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_data_owners_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_data_owners_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_kpi_value_history: {
        Row: {
          category_id: string
          change_type: string
          changed_by: string | null
          created_at: string
          id: string
          kpi_name: string
          kra_name: string
          metadata: Json | null
          new_achieved_value: number | null
          new_status: string | null
          old_achieved_value: number | null
          old_status: string | null
          org_kpi_value_id: string
          propagated_count: number | null
          review_period: string
          review_year: number
        }
        Insert: {
          category_id: string
          change_type?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          kpi_name: string
          kra_name: string
          metadata?: Json | null
          new_achieved_value?: number | null
          new_status?: string | null
          old_achieved_value?: number | null
          old_status?: string | null
          org_kpi_value_id: string
          propagated_count?: number | null
          review_period: string
          review_year: number
        }
        Update: {
          category_id?: string
          change_type?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          kpi_name?: string
          kra_name?: string
          metadata?: Json | null
          new_achieved_value?: number | null
          new_status?: string | null
          old_achieved_value?: number | null
          old_status?: string | null
          org_kpi_value_id?: string
          propagated_count?: number | null
          review_period?: string
          review_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_kpi_value_history_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kra_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_value_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_value_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_value_history_org_kpi_value_id_fkey"
            columns: ["org_kpi_value_id"]
            isOneToOne: false
            referencedRelation: "org_kpi_values"
            referencedColumns: ["id"]
          },
        ]
      }
      org_kpi_values: {
        Row: {
          achieved_value: number | null
          category_id: string
          created_at: string
          criteria: string | null
          data_source: string | null
          department_id: string | null
          employee_id: string | null
          entered_by: string | null
          evidence_url: string | null
          evidence_urls: Json | null
          id: string
          is_na: boolean
          kpi_name: string
          kra_name: string
          last_revision_reason: string | null
          last_revision_requested_at: string | null
          last_revision_requested_by: string | null
          qualitative_options: Json | null
          r0: string | null
          r1: string | null
          r2: string | null
          r3: string | null
          r4: string | null
          r5: string | null
          remarks: string | null
          review_period: string
          review_year: number
          revision_count: number
          sent_back_at: string | null
          sent_back_by: string | null
          sent_back_reason: string | null
          status: string | null
          sub_factors: Json | null
          submission_count: number | null
          target_value: number | null
          uom_type: string | null
          updated_at: string
        }
        Insert: {
          achieved_value?: number | null
          category_id: string
          created_at?: string
          criteria?: string | null
          data_source?: string | null
          department_id?: string | null
          employee_id?: string | null
          entered_by?: string | null
          evidence_url?: string | null
          evidence_urls?: Json | null
          id?: string
          is_na?: boolean
          kpi_name: string
          kra_name: string
          last_revision_reason?: string | null
          last_revision_requested_at?: string | null
          last_revision_requested_by?: string | null
          qualitative_options?: Json | null
          r0?: string | null
          r1?: string | null
          r2?: string | null
          r3?: string | null
          r4?: string | null
          r5?: string | null
          remarks?: string | null
          review_period: string
          review_year: number
          revision_count?: number
          sent_back_at?: string | null
          sent_back_by?: string | null
          sent_back_reason?: string | null
          status?: string | null
          sub_factors?: Json | null
          submission_count?: number | null
          target_value?: number | null
          uom_type?: string | null
          updated_at?: string
        }
        Update: {
          achieved_value?: number | null
          category_id?: string
          created_at?: string
          criteria?: string | null
          data_source?: string | null
          department_id?: string | null
          employee_id?: string | null
          entered_by?: string | null
          evidence_url?: string | null
          evidence_urls?: Json | null
          id?: string
          is_na?: boolean
          kpi_name?: string
          kra_name?: string
          last_revision_reason?: string | null
          last_revision_requested_at?: string | null
          last_revision_requested_by?: string | null
          qualitative_options?: Json | null
          r0?: string | null
          r1?: string | null
          r2?: string | null
          r3?: string | null
          r4?: string | null
          r5?: string | null
          remarks?: string | null
          review_period?: string
          review_year?: number
          revision_count?: number
          sent_back_at?: string | null
          sent_back_by?: string | null
          sent_back_reason?: string | null
          status?: string | null
          sub_factors?: Json | null
          submission_count?: number | null
          target_value?: number | null
          uom_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_kpi_values_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kra_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_values_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_values_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_values_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_values_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_values_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_values_sent_back_by_fkey"
            columns: ["sent_back_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_kpi_values_sent_back_by_fkey"
            columns: ["sent_back_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      password_rollout_logs: {
        Row: {
          created_at: string
          email: string | null
          email_error: string | null
          email_sent: boolean | null
          employee_code: string | null
          error_message: string | null
          full_name: string | null
          generated_by: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_error?: string | null
          email_sent?: boolean | null
          employee_code?: string | null
          error_message?: string | null
          full_name?: string | null
          generated_by: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          email_error?: string | null
          email_sent?: boolean | null
          employee_code?: string | null
          error_message?: string | null
          full_name?: string | null
          generated_by?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_rollout_logs_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "password_rollout_logs_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "password_rollout_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "password_rollout_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_improvement_plans: {
        Row: {
          completion_remarks: string | null
          created_at: string
          employee_id: string
          end_date: string
          extended_end_date: string | null
          hr_approved_at: string | null
          hr_remarks: string | null
          hr_reviewer_id: string | null
          id: string
          improvement_areas: Json
          initiated_by: string
          outcome: Database["public"]["Enums"]["pip_outcome"] | null
          reason: string
          start_date: string
          status: Database["public"]["Enums"]["pip_status"]
          success_criteria: string
          updated_at: string
        }
        Insert: {
          completion_remarks?: string | null
          created_at?: string
          employee_id: string
          end_date: string
          extended_end_date?: string | null
          hr_approved_at?: string | null
          hr_remarks?: string | null
          hr_reviewer_id?: string | null
          id?: string
          improvement_areas?: Json
          initiated_by: string
          outcome?: Database["public"]["Enums"]["pip_outcome"] | null
          reason: string
          start_date: string
          status?: Database["public"]["Enums"]["pip_status"]
          success_criteria: string
          updated_at?: string
        }
        Update: {
          completion_remarks?: string | null
          created_at?: string
          employee_id?: string
          end_date?: string
          extended_end_date?: string | null
          hr_approved_at?: string | null
          hr_remarks?: string | null
          hr_reviewer_id?: string | null
          id?: string
          improvement_areas?: Json
          initiated_by?: string
          outcome?: Database["public"]["Enums"]["pip_outcome"] | null
          reason?: string
          start_date?: string
          status?: Database["public"]["Enums"]["pip_status"]
          success_criteria?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_improvement_plans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_improvement_plans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_improvement_plans_hr_reviewer_id_fkey"
            columns: ["hr_reviewer_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_improvement_plans_hr_reviewer_id_fkey"
            columns: ["hr_reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_improvement_plans_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_improvement_plans_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          auditor_remarks: string | null
          created_at: string
          employee_id: string
          id: string
          manager_remarks: string | null
          overall_rating: Database["public"]["Enums"]["rating_level"] | null
          overall_score: number | null
          review_period: string
          review_year: number
          status: Database["public"]["Enums"]["review_status"] | null
          updated_at: string
        }
        Insert: {
          auditor_remarks?: string | null
          created_at?: string
          employee_id: string
          id?: string
          manager_remarks?: string | null
          overall_rating?: Database["public"]["Enums"]["rating_level"] | null
          overall_score?: number | null
          review_period: string
          review_year: number
          status?: Database["public"]["Enums"]["review_status"] | null
          updated_at?: string
        }
        Update: {
          auditor_remarks?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          manager_remarks?: string | null
          overall_rating?: Database["public"]["Enums"]["rating_level"] | null
          overall_score?: number | null
          review_period?: string
          review_year?: number
          status?: Database["public"]["Enums"]["review_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pip_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          performed_by: string | null
          pip_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string | null
          pip_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string | null
          pip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pip_audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pip_audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pip_audit_logs_pip_id_fkey"
            columns: ["pip_id"]
            isOneToOne: false
            referencedRelation: "performance_improvement_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      pip_milestones: {
        Row: {
          actual_outcome: string | null
          created_at: string
          description: string
          expected_outcome: string
          id: string
          milestone_date: string
          pip_id: string
          remarks: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["pip_milestone_status"]
          updated_at: string
        }
        Insert: {
          actual_outcome?: string | null
          created_at?: string
          description: string
          expected_outcome: string
          id?: string
          milestone_date: string
          pip_id: string
          remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["pip_milestone_status"]
          updated_at?: string
        }
        Update: {
          actual_outcome?: string | null
          created_at?: string
          description?: string
          expected_outcome?: string
          id?: string
          milestone_date?: string
          pip_id?: string
          remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["pip_milestone_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pip_milestones_pip_id_fkey"
            columns: ["pip_id"]
            isOneToOne: false
            referencedRelation: "performance_improvement_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pip_milestones_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pip_milestones_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_evidence_compression_jobs: {
        Row: {
          array_index: number | null
          attempts: number
          bucket_id: string | null
          compressed_path: string | null
          compressed_size_bytes: number | null
          compressed_url: string | null
          enqueued_at: string
          id: string
          last_error: string | null
          mime_type: string | null
          original_path: string | null
          original_size_bytes: number | null
          original_url: string
          processed_at: string | null
          rewritten_at: string | null
          source_column: string
          source_id: string
          source_table: string
          status: string
        }
        Insert: {
          array_index?: number | null
          attempts?: number
          bucket_id?: string | null
          compressed_path?: string | null
          compressed_size_bytes?: number | null
          compressed_url?: string | null
          enqueued_at?: string
          id?: string
          last_error?: string | null
          mime_type?: string | null
          original_path?: string | null
          original_size_bytes?: number | null
          original_url: string
          processed_at?: string | null
          rewritten_at?: string | null
          source_column: string
          source_id: string
          source_table: string
          status?: string
        }
        Update: {
          array_index?: number | null
          attempts?: number
          bucket_id?: string | null
          compressed_path?: string | null
          compressed_size_bytes?: number | null
          compressed_url?: string | null
          enqueued_at?: string
          id?: string
          last_error?: string | null
          mime_type?: string | null
          original_path?: string | null
          original_size_bytes?: number | null
          original_url?: string
          processed_at?: string | null
          rewritten_at?: string | null
          source_column?: string
          source_id?: string
          source_table?: string
          status?: string
        }
        Relationships: []
      }
      pms_grades: {
        Row: {
          code: string | null
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          level: string | null
          name: string
        }
        Insert: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          level?: string | null
          name: string
        }
        Update: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          level?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_grades_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      production_daily_entries: {
        Row: {
          created_at: string | null
          daily_values: Json
          employee_id: string
          id: string
          month: string
          program_id: string
          updated_at: string | null
          updated_by: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          daily_values?: Json
          employee_id: string
          id?: string
          month: string
          program_id: string
          updated_at?: string | null
          updated_by?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          daily_values?: Json
          employee_id?: string
          id?: string
          month?: string
          program_id?: string
          updated_at?: string | null
          updated_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_daily_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_daily_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_daily_entries_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_daily_entries_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_daily_entries_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_targets: {
        Row: {
          achieved_value: number
          business_unit_id: string | null
          created_at: string
          department_id: string | null
          division_id: string | null
          id: string
          incentive_percent: number
          month: string
          program_id: string
          remarks: string | null
          slab_category: string
          sub_unit_label: string | null
          target_value: number
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          achieved_value?: number
          business_unit_id?: string | null
          created_at?: string
          department_id?: string | null
          division_id?: string | null
          id?: string
          incentive_percent?: number
          month: string
          program_id: string
          remarks?: string | null
          slab_category?: string
          sub_unit_label?: string | null
          target_value?: number
          updated_at?: string
          updated_by?: string | null
          year: number
        }
        Update: {
          achieved_value?: number
          business_unit_id?: string | null
          created_at?: string
          department_id?: string | null
          division_id?: string | null
          id?: string
          incentive_percent?: number
          month?: string
          program_id?: string
          remarks?: string | null
          slab_category?: string
          sub_unit_label?: string | null
          target_value?: number
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_targets_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_targets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_targets_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_targets_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          deactivated_at: string | null
          department_id: string | null
          designation: string | null
          email: string | null
          employee_code: string | null
          full_name: string | null
          has_real_email: boolean
          id: string
          is_active: boolean
          level: string | null
          location_id: string | null
          mobile_number: string | null
          pms_grade: string | null
          portal_access: boolean
          reporting_manager_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          department_id?: string | null
          designation?: string | null
          email?: string | null
          employee_code?: string | null
          full_name?: string | null
          has_real_email?: boolean
          id: string
          is_active?: boolean
          level?: string | null
          location_id?: string | null
          mobile_number?: string | null
          pms_grade?: string | null
          portal_access?: boolean
          reporting_manager_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          department_id?: string | null
          designation?: string | null
          email?: string | null
          employee_code?: string | null
          full_name?: string | null
          has_real_email?: boolean
          id?: string
          is_active?: boolean
          level?: string | null
          location_id?: string | null
          mobile_number?: string | null
          pms_grade?: string | null
          portal_access?: boolean
          reporting_manager_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_department_fk"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registry_suggestion_dismissals: {
        Row: {
          dismissed_at: string
          dismissed_by: string | null
          kind: string
          left_id: string
          reason: string | null
          right_id: string
        }
        Insert: {
          dismissed_at?: string
          dismissed_by?: string | null
          kind: string
          left_id: string
          reason?: string | null
          right_id: string
        }
        Update: {
          dismissed_at?: string
          dismissed_by?: string | null
          kind?: string
          left_id?: string
          reason?: string | null
          right_id?: string
        }
        Relationships: []
      }
      report_access_config: {
        Row: {
          created_at: string
          download_roles: Database["public"]["Enums"]["app_role"][]
          id: string
          report_key: string
          report_name: string
          updated_at: string
          view_roles: Database["public"]["Enums"]["app_role"][]
        }
        Insert: {
          created_at?: string
          download_roles?: Database["public"]["Enums"]["app_role"][]
          id?: string
          report_key: string
          report_name: string
          updated_at?: string
          view_roles?: Database["public"]["Enums"]["app_role"][]
        }
        Update: {
          created_at?: string
          download_roles?: Database["public"]["Enums"]["app_role"][]
          id?: string
          report_key?: string
          report_name?: string
          updated_at?: string
          view_roles?: Database["public"]["Enums"]["app_role"][]
        }
        Relationships: []
      }
      report_access_user_overrides: {
        Row: {
          can_download: boolean
          can_view: boolean
          created_at: string
          granted_by: string | null
          id: string
          report_key: string
          user_id: string
        }
        Insert: {
          can_download?: boolean
          can_view?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          report_key: string
          user_id: string
        }
        Update: {
          can_download?: boolean
          can_view?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          report_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_access_user_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_access_user_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_access_user_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_access_user_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_action_notes: {
        Row: {
          applicable_from: string | null
          assignee_id: string | null
          category: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          details: string | null
          id: string
          kpi_id: string | null
          period_id: string | null
          priority: string
          status: string
          subject_employee_id: string
          target_period_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          applicable_from?: string | null
          assignee_id?: string | null
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          details?: string | null
          id?: string
          kpi_id?: string | null
          period_id?: string | null
          priority?: string
          status?: string
          subject_employee_id: string
          target_period_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          applicable_from?: string | null
          assignee_id?: string | null
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          details?: string | null
          id?: string
          kpi_id?: string | null
          period_id?: string | null
          priority?: string
          status?: string
          subject_employee_id?: string
          target_period_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_action_notes_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_action_notes_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_action_notes_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_action_notes_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_action_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_action_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_action_notes_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_action_notes_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "review_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_action_notes_subject_employee_id_fkey"
            columns: ["subject_employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_action_notes_subject_employee_id_fkey"
            columns: ["subject_employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_action_notes_target_period_id_fkey"
            columns: ["target_period_id"]
            isOneToOne: false
            referencedRelation: "review_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      review_period_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          new_state: Json | null
          performed_by: string | null
          previous_state: Json | null
          reason: string | null
          review_period_id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_state?: Json | null
          performed_by?: string | null
          previous_state?: Json | null
          reason?: string | null
          review_period_id: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_state?: Json | null
          performed_by?: string | null
          previous_state?: Json | null
          reason?: string | null
          review_period_id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_period_audit_log_review_period_id_fkey"
            columns: ["review_period_id"]
            isOneToOne: false
            referencedRelation: "review_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      review_period_auto_rules: {
        Row: {
          action: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          review_period_id: string
          rule_type: string
          trigger_condition: Json
          updated_at: string
        }
        Insert: {
          action?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          review_period_id: string
          rule_type: string
          trigger_condition?: Json
          updated_at?: string
        }
        Update: {
          action?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          review_period_id?: string
          rule_type?: string
          trigger_condition?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_period_auto_rules_review_period_id_fkey"
            columns: ["review_period_id"]
            isOneToOne: false
            referencedRelation: "review_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      review_period_locks: {
        Row: {
          created_at: string
          id: string
          is_locked: boolean
          lock_type: string
          locked_at: string | null
          locked_by: string | null
          permissions: Json
          reason: string | null
          review_period_id: string
          target_id: string | null
          unlock_reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_locked?: boolean
          lock_type: string
          locked_at?: string | null
          locked_by?: string | null
          permissions?: Json
          reason?: string | null
          review_period_id: string
          target_id?: string | null
          unlock_reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_locked?: boolean
          lock_type?: string
          locked_at?: string | null
          locked_by?: string | null
          permissions?: Json
          reason?: string | null
          review_period_id?: string
          target_id?: string | null
          unlock_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_period_locks_review_period_id_fkey"
            columns: ["review_period_id"]
            isOneToOne: false
            referencedRelation: "review_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      review_period_stages: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          review_period_id: string
          stage: string
          started_at: string
          started_by: string | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          review_period_id: string
          stage: string
          started_at?: string
          started_by?: string | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          review_period_id?: string
          stage?: string
          started_at?: string
          started_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_period_stages_review_period_id_fkey"
            columns: ["review_period_id"]
            isOneToOne: false
            referencedRelation: "review_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      review_periods: {
        Row: {
          completion_percentage: number
          created_at: string
          current_stage: string
          end_date: string | null
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          period_name: string
          review_year: number
          stage_started_at: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          completion_percentage?: number
          created_at?: string
          current_stage?: string
          end_date?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          period_name: string
          review_year: number
          stage_started_at?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          completion_percentage?: number
          created_at?: string
          current_stage?: string
          end_date?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          period_name?: string
          review_year?: number
          stage_started_at?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_periods_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_periods_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_submissions: {
        Row: {
          achieved_value: number | null
          auditor_achieved_value: number | null
          auditor_evidence_url: string | null
          auditor_evidence_urls: Json | null
          auditor_rating: Database["public"]["Enums"]["rating_level"] | null
          auditor_remarks: string | null
          auditor_score: number | null
          auto_advance_reason: string | null
          final_rating: Database["public"]["Enums"]["rating_level"] | null
          final_score: number | null
          hr_pms_achieved_value: number | null
          hr_pms_evidence_url: string | null
          hr_pms_evidence_urls: Json | null
          hr_pms_rating: Database["public"]["Enums"]["rating_level"] | null
          hr_pms_remarks: string | null
          hr_pms_score: number | null
          id: string
          is_na: boolean
          kpi_id: string
          kpi_status: Database["public"]["Enums"]["kpi_status"]
          management_achieved_value: number | null
          management_evidence_url: string | null
          management_evidence_urls: Json | null
          management_rating: Database["public"]["Enums"]["rating_level"] | null
          management_remarks: string | null
          management_score: number | null
          manager_achieved_value: number | null
          manager_evidence_url: string | null
          manager_evidence_urls: Json | null
          manager_rating: Database["public"]["Enums"]["rating_level"] | null
          manager_remarks: string | null
          manager_score: number | null
          na_marked_by_role: string | null
          performance_review_id: string | null
          self_evidence_url: string | null
          self_evidence_urls: Json | null
          self_rating: Database["public"]["Enums"]["rating_level"] | null
          self_remarks: string | null
          self_score: number | null
          skip_level_achieved_value: number | null
          skip_level_evidence_url: string | null
          skip_level_evidence_urls: Json | null
          skip_level_rating: Database["public"]["Enums"]["rating_level"] | null
          skip_level_remarks: string | null
          skip_level_score: number | null
          submitted_at: string
          updated_at: string
        }
        Insert: {
          achieved_value?: number | null
          auditor_achieved_value?: number | null
          auditor_evidence_url?: string | null
          auditor_evidence_urls?: Json | null
          auditor_rating?: Database["public"]["Enums"]["rating_level"] | null
          auditor_remarks?: string | null
          auditor_score?: number | null
          auto_advance_reason?: string | null
          final_rating?: Database["public"]["Enums"]["rating_level"] | null
          final_score?: number | null
          hr_pms_achieved_value?: number | null
          hr_pms_evidence_url?: string | null
          hr_pms_evidence_urls?: Json | null
          hr_pms_rating?: Database["public"]["Enums"]["rating_level"] | null
          hr_pms_remarks?: string | null
          hr_pms_score?: number | null
          id?: string
          is_na?: boolean
          kpi_id: string
          kpi_status?: Database["public"]["Enums"]["kpi_status"]
          management_achieved_value?: number | null
          management_evidence_url?: string | null
          management_evidence_urls?: Json | null
          management_rating?: Database["public"]["Enums"]["rating_level"] | null
          management_remarks?: string | null
          management_score?: number | null
          manager_achieved_value?: number | null
          manager_evidence_url?: string | null
          manager_evidence_urls?: Json | null
          manager_rating?: Database["public"]["Enums"]["rating_level"] | null
          manager_remarks?: string | null
          manager_score?: number | null
          na_marked_by_role?: string | null
          performance_review_id?: string | null
          self_evidence_url?: string | null
          self_evidence_urls?: Json | null
          self_rating?: Database["public"]["Enums"]["rating_level"] | null
          self_remarks?: string | null
          self_score?: number | null
          skip_level_achieved_value?: number | null
          skip_level_evidence_url?: string | null
          skip_level_evidence_urls?: Json | null
          skip_level_rating?: Database["public"]["Enums"]["rating_level"] | null
          skip_level_remarks?: string | null
          skip_level_score?: number | null
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          achieved_value?: number | null
          auditor_achieved_value?: number | null
          auditor_evidence_url?: string | null
          auditor_evidence_urls?: Json | null
          auditor_rating?: Database["public"]["Enums"]["rating_level"] | null
          auditor_remarks?: string | null
          auditor_score?: number | null
          auto_advance_reason?: string | null
          final_rating?: Database["public"]["Enums"]["rating_level"] | null
          final_score?: number | null
          hr_pms_achieved_value?: number | null
          hr_pms_evidence_url?: string | null
          hr_pms_evidence_urls?: Json | null
          hr_pms_rating?: Database["public"]["Enums"]["rating_level"] | null
          hr_pms_remarks?: string | null
          hr_pms_score?: number | null
          id?: string
          is_na?: boolean
          kpi_id?: string
          kpi_status?: Database["public"]["Enums"]["kpi_status"]
          management_achieved_value?: number | null
          management_evidence_url?: string | null
          management_evidence_urls?: Json | null
          management_rating?: Database["public"]["Enums"]["rating_level"] | null
          management_remarks?: string | null
          management_score?: number | null
          manager_achieved_value?: number | null
          manager_evidence_url?: string | null
          manager_evidence_urls?: Json | null
          manager_rating?: Database["public"]["Enums"]["rating_level"] | null
          manager_remarks?: string | null
          manager_score?: number | null
          na_marked_by_role?: string | null
          performance_review_id?: string | null
          self_evidence_url?: string | null
          self_evidence_urls?: Json | null
          self_rating?: Database["public"]["Enums"]["rating_level"] | null
          self_remarks?: string | null
          self_score?: number | null
          skip_level_achieved_value?: number | null
          skip_level_evidence_url?: string | null
          skip_level_evidence_urls?: Json | null
          skip_level_rating?: Database["public"]["Enums"]["rating_level"] | null
          skip_level_remarks?: string | null
          skip_level_score?: number | null
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_submissions_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: true
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_submissions_performance_review_id_fkey"
            columns: ["performance_review_id"]
            isOneToOne: false
            referencedRelation: "performance_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_asset_calibrations: {
        Row: {
          asset_id: string
          certificate_url: string | null
          created_at: string
          created_by: string | null
          id: string
          next_due_at: string
          notes: string | null
          performed_at: string
          performed_by: string | null
          performed_by_name: string | null
        }
        Insert: {
          asset_id: string
          certificate_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          next_due_at: string
          notes?: string | null
          performed_at: string
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Update: {
          asset_id?: string
          certificate_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          next_due_at?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_asset_calibrations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "safety_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_asset_evidence: {
        Row: {
          asset_id: string
          caption: string | null
          file_path: string
          id: string
          kind: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          asset_id: string
          caption?: string | null
          file_path: string
          id?: string
          kind: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          asset_id?: string
          caption?: string | null
          file_path?: string
          id?: string
          kind?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_asset_evidence_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "safety_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_assets: {
        Row: {
          asset_code: string
          business_unit_id: string | null
          calibration_expires_at: string | null
          calibration_interval_days: number | null
          calibration_required: boolean
          category: string
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          install_date: string | null
          last_calibration_at: string | null
          location: string | null
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          serial_no: string | null
          status: Database["public"]["Enums"]["safety_asset_status"]
          updated_at: string
        }
        Insert: {
          asset_code: string
          business_unit_id?: string | null
          calibration_expires_at?: string | null
          calibration_interval_days?: number | null
          calibration_required?: boolean
          category: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          install_date?: string | null
          last_calibration_at?: string | null
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          serial_no?: string | null
          status?: Database["public"]["Enums"]["safety_asset_status"]
          updated_at?: string
        }
        Update: {
          asset_code?: string
          business_unit_id?: string | null
          calibration_expires_at?: string | null
          calibration_interval_days?: number | null
          calibration_required?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          install_date?: string | null
          last_calibration_at?: string | null
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          serial_no?: string | null
          status?: Database["public"]["Enums"]["safety_asset_status"]
          updated_at?: string
        }
        Relationships: []
      }
      safety_audit_log: {
        Row: {
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          performed_by: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          performed_by?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          performed_by?: string | null
        }
        Relationships: []
      }
      safety_audit_run_responses: {
        Row: {
          answer: Database["public"]["Enums"]["safety_audit_answer"]
          auto_incident_id: string | null
          created_at: string
          created_by: string | null
          evidence_path: string | null
          id: string
          item_id: string
          notes: string | null
          run_id: string
          score: number
          updated_at: string
        }
        Insert: {
          answer: Database["public"]["Enums"]["safety_audit_answer"]
          auto_incident_id?: string | null
          created_at?: string
          created_by?: string | null
          evidence_path?: string | null
          id?: string
          item_id: string
          notes?: string | null
          run_id: string
          score?: number
          updated_at?: string
        }
        Update: {
          answer?: Database["public"]["Enums"]["safety_audit_answer"]
          auto_incident_id?: string | null
          created_at?: string
          created_by?: string | null
          evidence_path?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          run_id?: string
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_audit_run_responses_auto_incident_id_fkey"
            columns: ["auto_incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_audit_run_responses_auto_incident_id_fkey"
            columns: ["auto_incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents_with_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_audit_run_responses_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "safety_audit_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_audit_run_responses_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "safety_audit_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_audit_runs: {
        Row: {
          business_unit_id: string | null
          conducted_at: string
          conducted_by: string | null
          created_at: string
          critical_failures: number
          department_id: string | null
          id: string
          location: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score: number | null
          status: Database["public"]["Enums"]["safety_audit_run_status"]
          summary: string | null
          template_id: string
          updated_at: string
        }
        Insert: {
          business_unit_id?: string | null
          conducted_at?: string
          conducted_by?: string | null
          created_at?: string
          critical_failures?: number
          department_id?: string | null
          id?: string
          location?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["safety_audit_run_status"]
          summary?: string | null
          template_id: string
          updated_at?: string
        }
        Update: {
          business_unit_id?: string | null
          conducted_at?: string
          conducted_by?: string | null
          created_at?: string
          critical_failures?: number
          department_id?: string | null
          id?: string
          location?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["safety_audit_run_status"]
          summary?: string | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_audit_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "safety_audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_audit_template_items: {
        Row: {
          created_at: string
          evidence_required: boolean
          id: string
          is_critical: boolean
          prompt: string
          section: string
          sort_order: number
          template_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          evidence_required?: boolean
          id?: string
          is_critical?: boolean
          prompt: string
          section?: string
          sort_order?: number
          template_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          evidence_required?: boolean
          id?: string
          is_critical?: boolean
          prompt?: string
          section?: string
          sort_order?: number
          template_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "safety_audit_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "safety_audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_audit_templates: {
        Row: {
          category: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      safety_drill_findings: {
        Row: {
          corrective_action: string | null
          created_at: string
          created_by: string | null
          drill_id: string
          due_date: string | null
          id: string
          observation: string
          owner_id: string | null
          resolved_at: string | null
          severity: string
          updated_at: string
        }
        Insert: {
          corrective_action?: string | null
          created_at?: string
          created_by?: string | null
          drill_id: string
          due_date?: string | null
          id?: string
          observation: string
          owner_id?: string | null
          resolved_at?: string | null
          severity?: string
          updated_at?: string
        }
        Update: {
          corrective_action?: string | null
          created_at?: string
          created_by?: string | null
          drill_id?: string
          due_date?: string | null
          id?: string
          observation?: string
          owner_id?: string | null
          resolved_at?: string | null
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_drill_findings_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "safety_emergency_drills"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_drill_participants: {
        Row: {
          accounted_for: boolean
          created_at: string
          drill_id: string
          id: string
          mustered_at: string | null
          notes: string | null
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accounted_for?: boolean
          created_at?: string
          drill_id: string
          id?: string
          mustered_at?: string | null
          notes?: string | null
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accounted_for?: boolean
          created_at?: string
          drill_id?: string
          id?: string
          mustered_at?: string | null
          notes?: string | null
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_drill_participants_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "safety_emergency_drills"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_emergency_contacts: {
        Row: {
          business_unit_id: string | null
          contact_type: Database["public"]["Enums"]["safety_emergency_contact_type"]
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          phone_alt: string | null
          phone_primary: string
          role_title: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_unit_id?: string | null
          contact_type?: Database["public"]["Enums"]["safety_emergency_contact_type"]
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          phone_alt?: string | null
          phone_primary: string
          role_title?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_unit_id?: string | null
          contact_type?: Database["public"]["Enums"]["safety_emergency_contact_type"]
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          phone_alt?: string | null
          phone_primary?: string
          role_title?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      safety_emergency_drills: {
        Row: {
          business_unit_id: string | null
          completed_at: string | null
          conducted_by: string | null
          created_at: string
          created_by: string | null
          drill_code: string
          evacuation_seconds: number | null
          id: string
          location: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scenario: string
          scheduled_at: string
          score: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["safety_drill_status"]
          summary: string | null
          type: Database["public"]["Enums"]["safety_drill_type"]
          updated_at: string
        }
        Insert: {
          business_unit_id?: string | null
          completed_at?: string | null
          conducted_by?: string | null
          created_at?: string
          created_by?: string | null
          drill_code: string
          evacuation_seconds?: number | null
          id?: string
          location?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scenario: string
          scheduled_at: string
          score?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["safety_drill_status"]
          summary?: string | null
          type: Database["public"]["Enums"]["safety_drill_type"]
          updated_at?: string
        }
        Update: {
          business_unit_id?: string | null
          completed_at?: string | null
          conducted_by?: string | null
          created_at?: string
          created_by?: string | null
          drill_code?: string
          evacuation_seconds?: number | null
          id?: string
          location?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scenario?: string
          scheduled_at?: string
          score?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["safety_drill_status"]
          summary?: string | null
          type?: Database["public"]["Enums"]["safety_drill_type"]
          updated_at?: string
        }
        Relationships: []
      }
      safety_hours_worked: {
        Row: {
          business_unit_id: string | null
          created_at: string
          created_by: string | null
          headcount: number | null
          hours_worked: number
          id: string
          notes: string | null
          period_month: number
          period_year: number
          updated_at: string
        }
        Insert: {
          business_unit_id?: string | null
          created_at?: string
          created_by?: string | null
          headcount?: number | null
          hours_worked: number
          id?: string
          notes?: string | null
          period_month: number
          period_year: number
          updated_at?: string
        }
        Update: {
          business_unit_id?: string | null
          created_at?: string
          created_by?: string | null
          headcount?: number | null
          hours_worked?: number
          id?: string
          notes?: string | null
          period_month?: number
          period_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_hours_worked_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_incident_evidence: {
        Row: {
          compressed_at: string | null
          compression_attempts: number
          compression_error: string | null
          compression_status: string
          file_name: string
          file_path: string
          id: string
          incident_id: string
          mime_type: string | null
          original_file_path: string | null
          original_size_bytes: number | null
          size_bytes: number | null
          stage: Database["public"]["Enums"]["safety_evidence_stage"]
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          compressed_at?: string | null
          compression_attempts?: number
          compression_error?: string | null
          compression_status?: string
          file_name: string
          file_path: string
          id?: string
          incident_id: string
          mime_type?: string | null
          original_file_path?: string | null
          original_size_bytes?: number | null
          size_bytes?: number | null
          stage: Database["public"]["Enums"]["safety_evidence_stage"]
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          compressed_at?: string | null
          compression_attempts?: number
          compression_error?: string | null
          compression_status?: string
          file_name?: string
          file_path?: string
          id?: string
          incident_id?: string
          mime_type?: string | null
          original_file_path?: string | null
          original_size_bytes?: number | null
          size_bytes?: number | null
          stage?: Database["public"]["Enums"]["safety_evidence_stage"]
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_incident_evidence_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_evidence_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents_with_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_incident_progress_logs: {
        Row: {
          created_at: string
          id: string
          incident_id: string
          logged_by: string
          note: string
          stage: Database["public"]["Enums"]["safety_incident_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          incident_id: string
          logged_by: string
          note: string
          stage: Database["public"]["Enums"]["safety_incident_status"]
        }
        Update: {
          created_at?: string
          id?: string
          incident_id?: string
          logged_by?: string
          note?: string
          stage?: Database["public"]["Enums"]["safety_incident_status"]
        }
        Relationships: [
          {
            foreignKeyName: "safety_incident_progress_logs_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_progress_logs_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents_with_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_progress_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_progress_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_incident_timeline: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status:
            | Database["public"]["Enums"]["safety_incident_status"]
            | null
          id: string
          incident_id: string
          notes: string | null
          to_status: Database["public"]["Enums"]["safety_incident_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["safety_incident_status"]
            | null
          id?: string
          incident_id: string
          notes?: string | null
          to_status: Database["public"]["Enums"]["safety_incident_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["safety_incident_status"]
            | null
          id?: string
          incident_id?: string
          notes?: string | null
          to_status?: Database["public"]["Enums"]["safety_incident_status"]
        }
        Relationships: [
          {
            foreignKeyName: "safety_incident_timeline_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_timeline_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_timeline_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_timeline_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents_with_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_incidents: {
        Row: {
          acknowledge_due_at: string
          assigned_at: string | null
          assigned_to: string | null
          business_unit_id: string | null
          capa_summary: string | null
          client_submission_id: string
          close_due_at: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          department_id: string | null
          description: string
          id: string
          incident_number: string | null
          incident_type: Database["public"]["Enums"]["safety_incident_type"]
          involved_person_id: string | null
          involved_person_name: string | null
          location: string
          occurred_at: string
          rca_summary: string | null
          reporter_id: string
          severity: Database["public"]["Enums"]["safety_incident_severity"]
          status: Database["public"]["Enums"]["safety_incident_status"]
          title: string
          updated_at: string
          verification_notes: string | null
        }
        Insert: {
          acknowledge_due_at: string
          assigned_at?: string | null
          assigned_to?: string | null
          business_unit_id?: string | null
          capa_summary?: string | null
          client_submission_id?: string
          close_due_at: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          department_id?: string | null
          description: string
          id?: string
          incident_number?: string | null
          incident_type: Database["public"]["Enums"]["safety_incident_type"]
          involved_person_id?: string | null
          involved_person_name?: string | null
          location: string
          occurred_at?: string
          rca_summary?: string | null
          reporter_id: string
          severity: Database["public"]["Enums"]["safety_incident_severity"]
          status?: Database["public"]["Enums"]["safety_incident_status"]
          title: string
          updated_at?: string
          verification_notes?: string | null
        }
        Update: {
          acknowledge_due_at?: string
          assigned_at?: string | null
          assigned_to?: string | null
          business_unit_id?: string | null
          capa_summary?: string | null
          client_submission_id?: string
          close_due_at?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          department_id?: string | null
          description?: string
          id?: string
          incident_number?: string | null
          incident_type?: Database["public"]["Enums"]["safety_incident_type"]
          involved_person_id?: string | null
          involved_person_name?: string | null
          location?: string
          occurred_at?: string
          rca_summary?: string | null
          reporter_id?: string
          severity?: Database["public"]["Enums"]["safety_incident_severity"]
          status?: Database["public"]["Enums"]["safety_incident_status"]
          title?: string
          updated_at?: string
          verification_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_incidents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_involved_person_id_fkey"
            columns: ["involved_person_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_involved_person_id_fkey"
            columns: ["involved_person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_module_access: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string
          granted_at: string
          granted_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      safety_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          incident_id: string | null
          is_read: boolean
          kind: string
          payload: Json
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          incident_id?: string | null
          is_read?: boolean
          kind: string
          payload?: Json
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          incident_id?: string | null
          is_read?: boolean
          kind?: string
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_notifications_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_notifications_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents_with_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_permit_approvals: {
        Row: {
          approver_id: string | null
          approver_role: Database["public"]["Enums"]["safety_app_role"]
          created_at: string
          decided_at: string | null
          decision: string | null
          id: string
          level: number
          notes: string | null
          permit_id: string
        }
        Insert: {
          approver_id?: string | null
          approver_role: Database["public"]["Enums"]["safety_app_role"]
          created_at?: string
          decided_at?: string | null
          decision?: string | null
          id?: string
          level: number
          notes?: string | null
          permit_id: string
        }
        Update: {
          approver_id?: string | null
          approver_role?: Database["public"]["Enums"]["safety_app_role"]
          created_at?: string
          decided_at?: string | null
          decision?: string | null
          id?: string
          level?: number
          notes?: string | null
          permit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_permit_approvals_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "safety_permits"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_permit_evidence: {
        Row: {
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          permit_id: string
          size_bytes: number | null
          stage: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          permit_id: string
          size_bytes?: number | null
          stage: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          permit_id?: string
          size_bytes?: number | null
          stage?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_permit_evidence_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "safety_permits"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_permit_hira: {
        Row: {
          controls: string
          created_at: string
          hazard: string
          id: string
          permit_id: string
          risk_after: string
          risk_before: string
        }
        Insert: {
          controls: string
          created_at?: string
          hazard: string
          id?: string
          permit_id: string
          risk_after: string
          risk_before: string
        }
        Update: {
          controls?: string
          created_at?: string
          hazard?: string
          id?: string
          permit_id?: string
          risk_after?: string
          risk_before?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_permit_hira_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "safety_permits"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_permit_loto_steps: {
        Row: {
          created_at: string
          description: string
          id: string
          isolated_at: string | null
          isolated_by: string | null
          permit_id: string
          removed_at: string | null
          removed_by: string | null
          step_no: number
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          isolated_at?: string | null
          isolated_by?: string | null
          permit_id: string
          removed_at?: string | null
          removed_by?: string | null
          step_no: number
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          isolated_at?: string | null
          isolated_by?: string | null
          permit_id?: string
          removed_at?: string | null
          removed_by?: string | null
          step_no?: number
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_permit_loto_steps_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "safety_permits"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_permit_type_config: {
        Row: {
          approver_role: Database["public"]["Enums"]["safety_app_role"]
          created_at: string
          id: string
          is_active: boolean
          label: string
          level: number
          permit_type: Database["public"]["Enums"]["safety_permit_type"]
          updated_at: string
        }
        Insert: {
          approver_role: Database["public"]["Enums"]["safety_app_role"]
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          level: number
          permit_type: Database["public"]["Enums"]["safety_permit_type"]
          updated_at?: string
        }
        Update: {
          approver_role?: Database["public"]["Enums"]["safety_app_role"]
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          level?: number
          permit_type?: Database["public"]["Enums"]["safety_permit_type"]
          updated_at?: string
        }
        Relationships: []
      }
      safety_permits: {
        Row: {
          business_unit_id: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          current_level: number
          department_id: string | null
          end_at: string
          expired_at: string | null
          hira_summary: string | null
          id: string
          linked_asset_ids: string[]
          location: string
          loto_required: boolean
          permit_number: string | null
          permit_type: Database["public"]["Enums"]["safety_permit_type"]
          rejection_reason: string | null
          requested_by: string
          scope: string
          start_at: string
          status: Database["public"]["Enums"]["safety_permit_status"]
          suspended_reason: string | null
          total_levels: number
          updated_at: string
        }
        Insert: {
          business_unit_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          current_level?: number
          department_id?: string | null
          end_at: string
          expired_at?: string | null
          hira_summary?: string | null
          id?: string
          linked_asset_ids?: string[]
          location: string
          loto_required?: boolean
          permit_number?: string | null
          permit_type: Database["public"]["Enums"]["safety_permit_type"]
          rejection_reason?: string | null
          requested_by: string
          scope: string
          start_at: string
          status?: Database["public"]["Enums"]["safety_permit_status"]
          suspended_reason?: string | null
          total_levels?: number
          updated_at?: string
        }
        Update: {
          business_unit_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          current_level?: number
          department_id?: string | null
          end_at?: string
          expired_at?: string | null
          hira_summary?: string | null
          id?: string
          linked_asset_ids?: string[]
          location?: string
          loto_required?: boolean
          permit_number?: string | null
          permit_type?: Database["public"]["Enums"]["safety_permit_type"]
          rejection_reason?: string | null
          requested_by?: string
          scope?: string
          start_at?: string
          status?: Database["public"]["Enums"]["safety_permit_status"]
          suspended_reason?: string | null
          total_levels?: number
          updated_at?: string
        }
        Relationships: []
      }
      safety_quiz_questions: {
        Row: {
          correct_index: number
          created_at: string
          id: string
          options: Json
          prompt: string
          quiz_id: string
          sort_order: number
          weight: number
        }
        Insert: {
          correct_index: number
          created_at?: string
          id?: string
          options: Json
          prompt: string
          quiz_id: string
          sort_order?: number
          weight?: number
        }
        Update: {
          correct_index?: number
          created_at?: string
          id?: string
          options?: Json
          prompt?: string
          quiz_id?: string
          sort_order?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "safety_quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "safety_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_quizzes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          max_attempts: number
          pass_threshold: number
          randomize: boolean
          sop_id: string
          time_limit_seconds: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_attempts?: number
          pass_threshold?: number
          randomize?: boolean
          sop_id: string
          time_limit_seconds?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_attempts?: number
          pass_threshold?: number
          randomize?: boolean
          sop_id?: string
          time_limit_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_quizzes_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: true
            referencedRelation: "safety_sops"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      safety_severity_sla: {
        Row: {
          acknowledge_hours: number
          amber_threshold_pct: number
          close_hours: number
          severity: Database["public"]["Enums"]["safety_incident_severity"]
          updated_at: string
        }
        Insert: {
          acknowledge_hours: number
          amber_threshold_pct?: number
          close_hours: number
          severity: Database["public"]["Enums"]["safety_incident_severity"]
          updated_at?: string
        }
        Update: {
          acknowledge_hours?: number
          amber_threshold_pct?: number
          close_hours?: number
          severity?: Database["public"]["Enums"]["safety_incident_severity"]
          updated_at?: string
        }
        Relationships: []
      }
      safety_sla_escalations: {
        Row: {
          id: string
          incident_id: string
          level: string
          notified_at: string
          recipient_count: number
        }
        Insert: {
          id?: string
          incident_id: string
          level: string
          notified_at?: string
          recipient_count?: number
        }
        Update: {
          id?: string
          incident_id?: string
          level?: string
          notified_at?: string
          recipient_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "safety_sla_escalations_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_sla_escalations_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents_with_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_sops: {
        Row: {
          attachments: Json
          body_md: string
          category: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          min_read_seconds: number
          published_at: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          attachments?: Json
          body_md?: string
          category?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          min_read_seconds?: number
          published_at?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          attachments?: Json
          body_md?: string
          category?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          min_read_seconds?: number
          published_at?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      safety_training_assignments: {
        Row: {
          assigned_by: string | null
          attempts_count: number
          business_unit_id: string | null
          completed_at: string | null
          created_at: string
          due_at: string | null
          id: string
          last_attempt_at: string | null
          sop_id: string
          status: Database["public"]["Enums"]["safety_training_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          attempts_count?: number
          business_unit_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          last_attempt_at?: string | null
          sop_id: string
          status?: Database["public"]["Enums"]["safety_training_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          attempts_count?: number
          business_unit_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          last_attempt_at?: string | null
          sop_id?: string
          status?: Database["public"]["Enums"]["safety_training_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_training_assignments_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "safety_sops"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_training_attempts: {
        Row: {
          answers: Json
          assignment_id: string
          created_at: string
          finished_at: string | null
          id: string
          passed: boolean | null
          question_order: Json
          reading_seconds: number
          score: number | null
          started_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          assignment_id: string
          created_at?: string
          finished_at?: string | null
          id?: string
          passed?: boolean | null
          question_order?: Json
          reading_seconds?: number
          score?: number | null
          started_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          assignment_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          passed?: boolean | null
          question_order?: Json
          reading_seconds?: number
          score?: number | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_training_attempts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "safety_training_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          business_unit_id: string | null
          department_id: string | null
          id: string
          role: Database["public"]["Enums"]["safety_app_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          business_unit_id?: string | null
          department_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["safety_app_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          business_unit_id?: string | null
          department_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["safety_app_role"]
          user_id?: string
        }
        Relationships: []
      }
      skill_competencies: {
        Row: {
          assessed_at: string | null
          assessed_by: string | null
          category: string | null
          created_at: string
          current_level: number | null
          employee_id: string
          id: string
          remarks: string | null
          required_level: number | null
          review_period: string | null
          review_year: number | null
          skill_name: string
          updated_at: string
        }
        Insert: {
          assessed_at?: string | null
          assessed_by?: string | null
          category?: string | null
          created_at?: string
          current_level?: number | null
          employee_id: string
          id?: string
          remarks?: string | null
          required_level?: number | null
          review_period?: string | null
          review_year?: number | null
          skill_name: string
          updated_at?: string
        }
        Update: {
          assessed_at?: string | null
          assessed_by?: string | null
          category?: string | null
          created_at?: string
          current_level?: number | null
          employee_id?: string
          id?: string
          remarks?: string | null
          required_level?: number | null
          review_period?: string | null
          review_year?: number | null
          skill_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sub_branches: {
        Row: {
          code: string | null
          created_at: string
          department_id: string | null
          id: string
          level: string | null
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          level?: string | null
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          level?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_branches_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_period_submissions: {
        Row: {
          achieved_value: number | null
          admin_achieved_value: number | null
          auditor_achieved_value: number | null
          created_at: string | null
          evidence_url: string | null
          evidence_urls: Json | null
          hr_pms_achieved_value: number | null
          id: string
          is_resubmitted: boolean | null
          kpi_id: string
          management_achieved_value: number | null
          manager_achieved_value: number | null
          remarks: string | null
          review_month: string
          review_year: number
          skip_level_achieved_value: number | null
          sub_period_type: string
          sub_period_value: string
          submitted_at: string | null
          submitted_by: string | null
          update_reason: string | null
          updated_at: string | null
        }
        Insert: {
          achieved_value?: number | null
          admin_achieved_value?: number | null
          auditor_achieved_value?: number | null
          created_at?: string | null
          evidence_url?: string | null
          evidence_urls?: Json | null
          hr_pms_achieved_value?: number | null
          id?: string
          is_resubmitted?: boolean | null
          kpi_id: string
          management_achieved_value?: number | null
          manager_achieved_value?: number | null
          remarks?: string | null
          review_month: string
          review_year: number
          skip_level_achieved_value?: number | null
          sub_period_type: string
          sub_period_value: string
          submitted_at?: string | null
          submitted_by?: string | null
          update_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          achieved_value?: number | null
          admin_achieved_value?: number | null
          auditor_achieved_value?: number | null
          created_at?: string | null
          evidence_url?: string | null
          evidence_urls?: Json | null
          hr_pms_achieved_value?: number | null
          id?: string
          is_resubmitted?: boolean | null
          kpi_id?: string
          management_achieved_value?: number | null
          manager_achieved_value?: number | null
          remarks?: string | null
          review_month?: string
          review_year?: number
          skip_level_achieved_value?: number | null
          sub_period_type?: string
          sub_period_value?: string
          submitted_at?: string | null
          submitted_by?: string | null
          update_reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_period_submissions_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_period_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_period_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      template_bundle_items: {
        Row: {
          bundle_id: string
          created_at: string
          id: string
          sort_order: number
          template_id: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          id?: string
          sort_order?: number
          template_id: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "template_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_bundle_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "kpi_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_bundles: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          designation: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          designation?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          designation?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_bundles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      template_change_logs: {
        Row: {
          changed_by: string
          created_at: string | null
          effective_month: string
          effective_year: number
          employees_affected: number | null
          fields_changed: Json
          id: string
          kpis_updated: number | null
          scope: string | null
          selected_employee_ids: string[] | null
          template_id: string
        }
        Insert: {
          changed_by: string
          created_at?: string | null
          effective_month: string
          effective_year: number
          employees_affected?: number | null
          fields_changed: Json
          id?: string
          kpis_updated?: number | null
          scope?: string | null
          selected_employee_ids?: string[] | null
          template_id: string
        }
        Update: {
          changed_by?: string
          created_at?: string | null
          effective_month?: string
          effective_year?: number
          employees_affected?: number | null
          fields_changed?: Json
          id?: string
          kpis_updated?: number | null
          scope?: string | null
          selected_employee_ids?: string[] | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_change_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "kpi_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      training_needs: {
        Row: {
          category_id: string | null
          created_at: string
          employee_id: string
          gap_type: Database["public"]["Enums"]["tni_gap_type"]
          id: string
          identified_by: string | null
          kpi_id: string | null
          priority: Database["public"]["Enums"]["tni_priority"]
          review_period: string
          review_year: number
          score: number | null
          status: Database["public"]["Enums"]["tni_status"]
          training_recommendation: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          employee_id: string
          gap_type?: Database["public"]["Enums"]["tni_gap_type"]
          id?: string
          identified_by?: string | null
          kpi_id?: string | null
          priority?: Database["public"]["Enums"]["tni_priority"]
          review_period: string
          review_year: number
          score?: number | null
          status?: Database["public"]["Enums"]["tni_status"]
          training_recommendation?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          employee_id?: string
          gap_type?: Database["public"]["Enums"]["tni_gap_type"]
          id?: string
          identified_by?: string | null
          kpi_id?: string | null
          priority?: Database["public"]["Enums"]["tni_priority"]
          review_period?: string
          review_year?: number
          score?: number | null
          status?: Database["public"]["Enums"]["tni_status"]
          training_recommendation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_needs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kra_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_needs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_needs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_needs_identified_by_fkey"
            columns: ["identified_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_needs_identified_by_fkey"
            columns: ["identified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_needs_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vessel_monthly_entries: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          month: string
          program_id: string
          remarks: string | null
          updated_at: string | null
          updated_by: string | null
          vessels_handled: number
          year: number
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          month: string
          program_id: string
          remarks?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vessels_handled?: number
          year: number
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          month?: string
          program_id?: string
          remarks?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vessels_handled?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vessel_monthly_entries_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_config: {
        Row: {
          config_type: string
          config_value: string
          created_at: string | null
          created_by: string | null
          id: string
          is_ongoing: boolean
          review_period: string | null
          review_year: number | null
          updated_at: string | null
          workflow_template_id: string
        }
        Insert: {
          config_type: string
          config_value: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_ongoing?: boolean
          review_period?: string | null
          review_year?: number | null
          updated_at?: string | null
          workflow_template_id: string
        }
        Update: {
          config_type?: string
          config_value?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_ongoing?: boolean
          review_period?: string | null
          review_year?: number | null
          updated_at?: string | null
          workflow_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_config_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_config_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_config_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_settings: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          label: string
          max_value: number | null
          min_value: number | null
          setting_key: string
          setting_value: Json
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          label: string
          max_value?: number | null
          min_value?: number | null
          setting_key: string
          setting_value: Json
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          label?: string
          max_value?: number | null
          min_value?: number | null
          setting_key?: string
          setting_value?: Json
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      workflow_templates: {
        Row: {
          created_at: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          is_default: boolean | null
          name: string
          stages: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          name: string
          stages: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          name?: string
          stages?: Json
        }
        Relationships: []
      }
    }
    Views: {
      eligible_login_users: {
        Row: {
          department_id: string | null
          designation: string | null
          eligibility_type: string | null
          email: string | null
          employee_code: string | null
          full_name: string | null
          id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_fk"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_safety_audit_scoreboard: {
        Row: {
          avg_score: number | null
          business_unit_id: string | null
          excellent_count: number | null
          good_count: number | null
          poor_count: number | null
          refreshed_at: string | null
          run_count: number | null
        }
        Relationships: []
      }
      mv_safety_incidents_open_vs_closed: {
        Row: {
          business_unit_id: string | null
          closed_count: number | null
          open_count: number | null
          orphaned_count: number | null
          refreshed_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_incidents_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_safety_permit_throughput: {
        Row: {
          active_count: number | null
          approved_count: number | null
          business_unit_id: string | null
          expired_count: number | null
          refreshed_at: string | null
          rejected_count: number | null
          total_permits: number | null
        }
        Relationships: []
      }
      mv_safety_severity_rate: {
        Row: {
          business_unit_id: string | null
          critical_count: number | null
          high_count: number | null
          low_count: number | null
          medium_count: number | null
          refreshed_at: string | null
          total_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_incidents_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_safety_training_compliance: {
        Row: {
          compliance_pct: number | null
          overdue_count: number | null
          passed_count: number | null
          refreshed_at: string | null
          total_assignments: number | null
        }
        Relationships: []
      }
      mv_safety_trir: {
        Row: {
          business_unit_id: string | null
          hours_worked: number | null
          recordable_cases: number | null
          refreshed_at: string | null
          trir: number | null
        }
        Relationships: []
      }
      safety_incidents_with_sla: {
        Row: {
          acknowledge_due_at: string | null
          assigned_at: string | null
          assigned_to: string | null
          business_unit_id: string | null
          capa_summary: string | null
          client_submission_id: string | null
          close_due_at: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string | null
          department_id: string | null
          description: string | null
          id: string | null
          incident_number: string | null
          incident_type:
            | Database["public"]["Enums"]["safety_incident_type"]
            | null
          involved_person_id: string | null
          involved_person_name: string | null
          location: string | null
          occurred_at: string | null
          rca_summary: string | null
          reporter_id: string | null
          severity:
            | Database["public"]["Enums"]["safety_incident_severity"]
            | null
          sla_state: string | null
          status: Database["public"]["Enums"]["safety_incident_status"] | null
          title: string | null
          updated_at: string | null
          verification_notes: string | null
        }
        Insert: {
          acknowledge_due_at?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          business_unit_id?: string | null
          capa_summary?: string | null
          client_submission_id?: string | null
          close_due_at?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          id?: string | null
          incident_number?: string | null
          incident_type?:
            | Database["public"]["Enums"]["safety_incident_type"]
            | null
          involved_person_id?: string | null
          involved_person_name?: string | null
          location?: string | null
          occurred_at?: string | null
          rca_summary?: string | null
          reporter_id?: string | null
          severity?:
            | Database["public"]["Enums"]["safety_incident_severity"]
            | null
          sla_state?: never
          status?: Database["public"]["Enums"]["safety_incident_status"] | null
          title?: string | null
          updated_at?: string | null
          verification_notes?: string | null
        }
        Update: {
          acknowledge_due_at?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          business_unit_id?: string | null
          capa_summary?: string | null
          client_submission_id?: string | null
          close_due_at?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          id?: string | null
          incident_number?: string | null
          incident_type?:
            | Database["public"]["Enums"]["safety_incident_type"]
            | null
          involved_person_id?: string | null
          involved_person_name?: string | null
          location?: string | null
          occurred_at?: string | null
          rca_summary?: string | null
          reporter_id?: string | null
          severity?:
            | Database["public"]["Enums"]["safety_incident_severity"]
            | null
          sla_state?: never
          status?: Database["public"]["Enums"]["safety_incident_status"] | null
          title?: string | null
          updated_at?: string | null
          verification_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_incidents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_involved_person_id_fkey"
            columns: ["involved_person_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_involved_person_id_fkey"
            columns: ["involved_person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "eligible_login_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_permit: { Args: { p_permit_id: string }; Returns: Json }
      aggregate_sub_period_scores: {
        Args: { p_kpi_id: string; p_month: string; p_year: number }
        Returns: number
      }
      assign_sop_to_role: {
        Args: {
          _business_unit_id?: string
          _due_in_days?: number
          _role: Database["public"]["Enums"]["safety_app_role"]
          _sop_id: string
        }
        Returns: Json
      }
      backfill_late_joiner_org_kpis: {
        Args: { p_dry_run?: boolean }
        Returns: Json
      }
      backfill_multimonth_percolation: {
        Args: never
        Returns: {
          processed_count: number
          sibling_count: number
        }[]
      }
      batch_insert_kpis_with_rollover_flag: {
        Args: { kpis_json: Json }
        Returns: number
      }
      can_view_safety_incident: {
        Args: { _incident_id: string }
        Returns: boolean
      }
      change_org_kpi_scope_cascading: {
        Args: {
          p_base_period: string
          p_base_year: number
          p_cascade_forward?: boolean
          p_category_id: string
          p_dry_run?: boolean
          p_kpi_name: string
          p_kra_name: string
          p_new_scope: string
          p_triggered_by?: string
        }
        Returns: Json
      }
      check_review_period_permission: {
        Args: {
          p_action: string
          p_period_name: string
          p_review_year: number
          p_user_id: string
        }
        Returns: boolean
      }
      check_template_has_active_kpis: {
        Args: { template_uuid: string }
        Returns: boolean
      }
      close_permit: {
        Args: { p_notes?: string; p_permit_id: string }
        Returns: Json
      }
      complete_drill: {
        Args: {
          p_drill_id: string
          p_evacuation_seconds?: number
          p_score?: number
        }
        Returns: Json
      }
      compute_org_kpi_score_for_kpi: {
        Args: { p_achieved: number; p_kpi_id: string }
        Returns: {
          rating: string
          score: number
        }[]
      }
      correct_may_kpis: {
        Args: {
          p_category_id: string
          p_definition_id: string
          p_new_kpi: string
          p_new_kra: string
          p_old_kpi: string
          p_old_kra: string
          p_review_period: string
          p_review_year: number
        }
        Returns: number
      }
      decide_permit_level: {
        Args: { p_decision: string; p_notes?: string; p_permit_id: string }
        Returns: Json
      }
      detect_alias_drift: {
        Args: never
        Returns: {
          alias_count: number
          canonical_kpi_name: string
          canonical_kra_name: string
          category_id: string
          category_name: string
          definition_id: string
          variant_kra_count: number
          variant_kra_names: string[]
        }[]
      }
      detect_training_needs_for_period: {
        Args: {
          p_review_period: string
          p_review_year: number
          p_threshold?: number
        }
        Returns: number
      }
      dismiss_suggestion: {
        Args: {
          p_kind: string
          p_left_id: string
          p_reason?: string
          p_right_id: string
        }
        Returns: undefined
      }
      enqueue_safety_notification: {
        Args: {
          _body?: string
          _incident: string
          _kind: string
          _payload?: Json
          _recipient: string
          _title: string
        }
        Returns: string
      }
      expire_overdue_permits: { Args: never; Returns: Json }
      find_ongoing_workflow: {
        Args: {
          p_config_type: string
          p_config_value: string
          p_review_period: string
          p_review_year: number
        }
        Returns: string
      }
      generate_bundles_from_kpis: { Args: never; Returns: Json }
      get_active_send_back_markers: {
        Args: { p_kpi_ids: string[] }
        Returns: {
          created_at: string
          kpi_id: string
          raised_by: string
          reason: string
        }[]
      }
      get_bulk_employee_workflows: {
        Args: {
          employee_ids: string[]
          p_review_period?: string
          p_review_year?: number
        }
        Returns: {
          employee_id: string
          stages: string[]
        }[]
      }
      get_cycle_months: {
        Args: {
          p_cycle_start?: string
          p_frequency: string
          p_month: string
          p_year: number
        }
        Returns: string[]
      }
      get_cycle_terminal_month: {
        Args: {
          p_frequency: string
          p_frequency_cycle_start?: string
          p_review_period: string
          p_review_year: number
        }
        Returns: string
      }
      get_direct_report_ids: {
        Args: { _manager_id: string }
        Returns: string[]
      }
      get_employee_workflow: {
        Args: {
          employee_uuid: string
          p_review_period?: string
          p_review_year?: number
        }
        Returns: Json
      }
      get_employee_workflow_info: {
        Args: {
          employee_uuid: string
          p_review_period?: string
          p_review_year?: number
        }
        Returns: {
          config_source: string
          display_name: string
          stages: Json
          template_id: string
          template_name: string
        }[]
      }
      get_kpi_accessible_user_ids: {
        Args: { p_kpi_id: string }
        Returns: string[]
      }
      get_kpi_journey_report: {
        Args: {
          p_department?: string
          p_limit?: number
          p_offset?: number
          p_period: string
          p_search?: string
          p_status?: string
          p_type?: string
          p_year: number
        }
        Returns: Json
      }
      get_profiles_for_audit_display: {
        Args: { p_user_ids: string[] }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      get_public_registry_view: {
        Args: { p_category_id?: string; p_search?: string }
        Returns: Json
      }
      get_recent_registry_audit: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          affected_definition_id: string
          category_id: string
          created_at: string
          id: string
          payload: Json
          performed_by: string
          performer_name: string
          primary_definition_id: string
          reason: string
        }[]
      }
      get_registry_coverage_stats: { Args: never; Returns: Json }
      get_registry_pending_suggestion_count: { Args: never; Returns: Json }
      get_safety_setting: { Args: { p_key: string }; Returns: Json }
      get_skip_level_manager: {
        Args: { employee_uuid: string }
        Returns: string
      }
      get_template_linked_counts: {
        Args: never
        Returns: {
          linked_count: number
          template_id: string
        }[]
      }
      get_unlinked_signatures: {
        Args: { p_limit?: number }
        Returns: {
          category_id: string
          category_name: string
          employee_count: number
          kpi_name: string
          kra_name: string
          last_seen: string
          occurrence_count: number
        }[]
      }
      get_user_access_profile_rights: {
        Args: { p_user_id: string }
        Returns: {
          can_add: boolean
          can_delete: boolean
          can_update: boolean
          can_view: boolean
          menu_key: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_any_safety_role: { Args: { _user_id: string }; Returns: boolean }
      has_capability: {
        Args: {
          _capability: string
          _scope_id?: string
          _scope_type?: Database["public"]["Enums"]["iac_scope_type"]
          _user_id: string
        }
        Returns: boolean
      }
      has_menu_access_override: {
        Args: { _menu_key: string; _user_id: string }
        Returns: boolean
      }
      has_report_access_override: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_safety_module_access: { Args: { _user_id: string }; Returns: boolean }
      has_safety_role: {
        Args: {
          _business_unit_id?: string
          _role: Database["public"]["Enums"]["safety_app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      iac_log: {
        Args: {
          _action: string
          _payload?: Json
          _target_id: string
          _target_type: string
        }
        Returns: undefined
      }
      iac_sweep_expired: { Args: never; Returns: number }
      is_canonical_enforcement_period: {
        Args: { p_period: string; p_year: number }
        Returns: boolean
      }
      is_data_owner_for_employee: {
        Args: { p_employee_id: string; p_owner_id: string }
        Returns: boolean
      }
      is_image_url: { Args: { p_url: string }; Returns: boolean }
      is_month_locked_for_frequency: {
        Args: { p_frequency: string; p_month: string; p_year: number }
        Returns: boolean
      }
      is_org_kpi_audit_employee: {
        Args: { _profile_id: string }
        Returns: boolean
      }
      is_period_locked: {
        Args: { _period_name: string; _review_year: number }
        Returns: boolean
      }
      is_permit_approver: {
        Args: { _permit_id: string; _uid: string }
        Returns: boolean
      }
      log_standardization_action: {
        Args: {
          p_action_type: string
          p_affected_row_count: number
          p_category_id: string
          p_definition_id: string
          p_payload: Json
        }
        Returns: string
      }
      lookup_synthetic_email_by_code: {
        Args: { p_client_ip?: string; p_code: string }
        Returns: string
      }
      mark_audit_reviewed: {
        Args: { p_run_id: string; p_summary?: string }
        Returns: Json
      }
      mark_overdue_assets: { Args: never; Returns: Json }
      mark_overdue_training_assignments: { Args: never; Returns: Json }
      merge_definitions: {
        Args: { p_drop_id: string; p_keep_id: string; p_reason?: string }
        Returns: Json
      }
      migrate_okv_on_scope_change: {
        Args: {
          p_category_id: string
          p_kpi_name: string
          p_kra_name: string
          p_new_scope: string
          p_old_scope: string
          p_review_period: string
          p_review_year: number
          p_triggered_by?: string
        }
        Returns: Json
      }
      month_name_to_index: { Args: { p_month: string }; Returns: number }
      normalize_kpi_text: { Args: { p: string }; Returns: string }
      normalize_kpi_text_value: { Args: { txt: string }; Returns: string }
      preview_org_kpi_propagation: {
        Args: { p_kpi_ids: string[] }
        Returns: Json
      }
      preview_split_definition: {
        Args: { p_move_alias_ids: string[]; p_source_id: string }
        Returns: Json
      }
      promote_signature_to_definition: {
        Args: {
          p_canonical_kpi?: string
          p_canonical_kra?: string
          p_category_id: string
          p_kpi_name: string
          p_kra_name: string
        }
        Returns: Json
      }
      propagate_org_kpi_value:
        | { Args: { p_is_na?: boolean; p_kpi_ratings: Json }; Returns: Json }
        | {
            Args: { p_is_na?: boolean; p_kpi_ratings: Json; p_remarks?: string }
            Returns: Json
          }
      reconcile_org_kpi_inheritance: {
        Args: { p_dry_run?: boolean }
        Returns: Json
      }
      reconcile_workflow_statuses: {
        Args: {
          p_dry_run?: boolean
          p_kpi_ids?: string[]
          p_performed_by?: string
          p_review_period?: string
          p_review_year?: number
        }
        Returns: Json
      }
      record_calibration: {
        Args: {
          p_asset_id: string
          p_certificate_url?: string
          p_next_due_at: string
          p_notes?: string
          p_performed_at: string
          p_performed_by_name?: string
        }
        Returns: Json
      }
      record_send_back_reason: {
        Args: { p_reason: string }
        Returns: undefined
      }
      refresh_safety_analytics: { Args: never; Returns: Json }
      repair_multimonth_workflow_drift_v5: {
        Args: { p_apply?: boolean }
        Returns: Json
      }
      repair_org_kpi_cycle_anchors: {
        Args: { p_dry_run?: boolean }
        Returns: Json
      }
      repair_sibling_frequency_drift_v5: {
        Args: { p_apply?: boolean; p_kpi_id?: string }
        Returns: Json
      }
      request_org_kpi_revision: {
        Args: { p_kpi_id: string; p_reason: string }
        Returns: Json
      }
      resolve_canonical_kpi: {
        Args: { p_category_id: string; p_kpi_name: string; p_kra_name: string }
        Returns: string
      }
      resolve_canonical_kpi_batch: {
        Args: { p_signatures: Json }
        Returns: {
          canonical_kpi_name: string
          canonical_kra_name: string
          category_id: string
          definition_id: string
          kpi_name: string
          kra_name: string
        }[]
      }
      resolve_cycle_anchor: {
        Args: { p_frequency: string; p_month_idx: number }
        Returns: string
      }
      resolve_terminal_period: {
        Args: {
          p_frequency: string
          p_period: string
          p_sub_frequency: string
          p_year: number
        }
        Returns: {
          terminal_period: string
          terminal_year: number
        }[]
      }
      reverse_standardization_action: {
        Args: { p_action_id: string }
        Returns: Json
      }
      review_drill: {
        Args: { p_drill_id: string; p_summary?: string }
        Returns: Json
      }
      review_note_role_can: {
        Args: { _action: string; _user_id: string }
        Returns: boolean
      }
      rpc_weightage_eligible_employees: {
        Args: { p_category_id?: string; p_fiscal_start_year: number }
        Returns: {
          employee_id: string
        }[]
      }
      rpc_weightage_variance_summary: {
        Args: {
          p_category_id?: string
          p_employee_ids: string[]
          p_fiscal_start_year: number
        }
        Returns: {
          acknowledged_count: number
          variance_count: number
        }[]
      }
      run_safety_sla_escalations: { Args: never; Returns: Json }
      scan_kpi_duplicate_groups: {
        Args: { p_fuzzy_threshold?: number; p_include_skipped?: boolean }
        Returns: Json
      }
      set_safety_setting: {
        Args: { p_description?: string; p_key: string; p_value: Json }
        Returns: Json
      }
      should_send_email: { Args: { p_user_id: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      split_definition: {
        Args: {
          p_keep_alias_ids: string[]
          p_move_alias_ids: string[]
          p_new_kpi_name: string
          p_new_kra_name: string
          p_reason?: string
          p_rename_source_kpi?: string
          p_rename_source_kra?: string
          p_source_id: string
        }
        Returns: Json
      }
      start_drill: { Args: { p_drill_id: string }; Returns: Json }
      start_training_attempt: {
        Args: { _assignment_id: string }
        Returns: Json
      }
      submit_audit_run: { Args: { p_run_id: string }; Returns: Json }
      submit_permit: { Args: { p_permit_id: string }; Returns: Json }
      submit_training_attempt: {
        Args: { _answers: Json; _attempt_id: string; _reading_seconds?: number }
        Returns: Json
      }
      suggest_alias_candidates: {
        Args: { p_limit?: number; p_min_similarity?: number }
        Returns: {
          canonical_kpi_name: string
          canonical_kra_name: string
          category_id: string
          category_name: string
          definition_id: string
          last_seen: string
          occurrence_count: number
          signature_id: string
          signature_kpi_name: string
          signature_kra_name: string
          similarity: number
        }[]
      }
      suggest_definition_merges: {
        Args: { p_limit?: number; p_min_similarity?: number }
        Returns: {
          category_id: string
          category_name: string
          left_alias_count: number
          left_id: string
          left_kpi_name: string
          left_kra_name: string
          left_linked_kpi_count: number
          right_alias_count: number
          right_id: string
          right_kpi_name: string
          right_kra_name: string
          right_linked_kpi_count: number
          similarity: number
        }[]
      }
      suspend_permit: {
        Args: { p_permit_id: string; p_reason: string }
        Returns: Json
      }
      transition_safety_incident: {
        Args: {
          p_assigned_to?: string
          p_incident_id: string
          p_notes?: string
          p_to_status: Database["public"]["Enums"]["safety_incident_status"]
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "employee"
        | "auditor"
        | "management"
        | "hr_pms"
        | "skip_level"
      iac_scope_type: "global" | "company" | "business_unit" | "department"
      kpi_status: "open" | "submitted" | "approved_by_manager" | "locked"
      observation_type: "positive" | "concern" | "neutral"
      pip_milestone_status: "pending" | "met" | "partially_met" | "not_met"
      pip_outcome: "improved" | "not_improved" | "escalated"
      pip_status:
        | "draft"
        | "pending_hr_approval"
        | "active"
        | "completed"
        | "extended"
        | "terminated"
      query_entity_type: "kra" | "kpi"
      query_status: "open" | "resolved" | "responded"
      rating_level: "red" | "yellow" | "green" | "blue"
      review_status:
        | "kra_set"
        | "self_review"
        | "manager_check"
        | "audit"
        | "approved"
        | "management_review"
        | "skip_level_check"
        | "hr_pms_review"
      safety_app_role:
        | "admin"
        | "safety_head"
        | "safety_officer"
        | "bu_head"
        | "manager"
        | "supervisor"
        | "worker"
        | "auditor"
      safety_asset_status: "active" | "under_maintenance" | "retired"
      safety_audit_answer: "yes" | "no" | "na"
      safety_audit_run_status: "draft" | "submitted" | "reviewed"
      safety_drill_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "reviewed"
        | "cancelled"
      safety_drill_type:
        | "fire"
        | "evacuation"
        | "spill"
        | "medical"
        | "chemical"
        | "security"
        | "earthquake"
        | "other"
      safety_emergency_contact_type:
        | "internal"
        | "external_agency"
        | "hospital"
        | "fire_brigade"
        | "police"
        | "environmental"
        | "other"
      safety_evidence_stage:
        | "report"
        | "assignment"
        | "investigation"
        | "rca"
        | "capa"
        | "verification"
      safety_incident_severity: "low" | "medium" | "high" | "critical"
      safety_incident_status:
        | "reported"
        | "assigned"
        | "investigation"
        | "rca"
        | "corrective_action"
        | "verification"
        | "closed"
        | "orphaned"
      safety_incident_type:
        | "near_miss"
        | "unsafe_act"
        | "unsafe_condition"
        | "accident"
        | "property_damage"
        | "environmental"
      safety_permit_status:
        | "draft"
        | "submitted"
        | "in_approval"
        | "approved"
        | "active"
        | "suspended"
        | "closed"
        | "rejected"
        | "expired"
      safety_permit_type:
        | "hot_work"
        | "confined_space"
        | "work_at_height"
        | "electrical"
        | "excavation"
        | "lifting"
        | "general"
      safety_training_status:
        | "pending"
        | "in_progress"
        | "passed"
        | "failed"
        | "overdue"
      tni_gap_type: "skill" | "knowledge" | "behavior" | "compliance"
      tni_priority: "high" | "medium" | "low"
      tni_status:
        | "identified"
        | "training_planned"
        | "in_progress"
        | "completed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "manager",
        "employee",
        "auditor",
        "management",
        "hr_pms",
        "skip_level",
      ],
      iac_scope_type: ["global", "company", "business_unit", "department"],
      kpi_status: ["open", "submitted", "approved_by_manager", "locked"],
      observation_type: ["positive", "concern", "neutral"],
      pip_milestone_status: ["pending", "met", "partially_met", "not_met"],
      pip_outcome: ["improved", "not_improved", "escalated"],
      pip_status: [
        "draft",
        "pending_hr_approval",
        "active",
        "completed",
        "extended",
        "terminated",
      ],
      query_entity_type: ["kra", "kpi"],
      query_status: ["open", "resolved", "responded"],
      rating_level: ["red", "yellow", "green", "blue"],
      review_status: [
        "kra_set",
        "self_review",
        "manager_check",
        "audit",
        "approved",
        "management_review",
        "skip_level_check",
        "hr_pms_review",
      ],
      safety_app_role: [
        "admin",
        "safety_head",
        "safety_officer",
        "bu_head",
        "manager",
        "supervisor",
        "worker",
        "auditor",
      ],
      safety_asset_status: ["active", "under_maintenance", "retired"],
      safety_audit_answer: ["yes", "no", "na"],
      safety_audit_run_status: ["draft", "submitted", "reviewed"],
      safety_drill_status: [
        "scheduled",
        "in_progress",
        "completed",
        "reviewed",
        "cancelled",
      ],
      safety_drill_type: [
        "fire",
        "evacuation",
        "spill",
        "medical",
        "chemical",
        "security",
        "earthquake",
        "other",
      ],
      safety_emergency_contact_type: [
        "internal",
        "external_agency",
        "hospital",
        "fire_brigade",
        "police",
        "environmental",
        "other",
      ],
      safety_evidence_stage: [
        "report",
        "assignment",
        "investigation",
        "rca",
        "capa",
        "verification",
      ],
      safety_incident_severity: ["low", "medium", "high", "critical"],
      safety_incident_status: [
        "reported",
        "assigned",
        "investigation",
        "rca",
        "corrective_action",
        "verification",
        "closed",
        "orphaned",
      ],
      safety_incident_type: [
        "near_miss",
        "unsafe_act",
        "unsafe_condition",
        "accident",
        "property_damage",
        "environmental",
      ],
      safety_permit_status: [
        "draft",
        "submitted",
        "in_approval",
        "approved",
        "active",
        "suspended",
        "closed",
        "rejected",
        "expired",
      ],
      safety_permit_type: [
        "hot_work",
        "confined_space",
        "work_at_height",
        "electrical",
        "excavation",
        "lifting",
        "general",
      ],
      safety_training_status: [
        "pending",
        "in_progress",
        "passed",
        "failed",
        "overdue",
      ],
      tni_gap_type: ["skill", "knowledge", "behavior", "compliance"],
      tni_priority: ["high", "medium", "low"],
      tni_status: [
        "identified",
        "training_planned",
        "in_progress",
        "completed",
      ],
    },
  },
} as const
