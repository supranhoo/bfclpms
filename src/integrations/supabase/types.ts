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
          enable_org_kpi_autopull: boolean
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
          enable_org_kpi_autopull?: boolean
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
          enable_org_kpi_autopull?: boolean
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
    }
    Functions: {
      aggregate_sub_period_scores: {
        Args: { p_kpi_id: string; p_month: string; p_year: number }
        Returns: number
      }
      backfill_late_joiner_org_kpis: {
        Args: { p_dry_run?: boolean }
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
      compute_org_kpi_score_for_kpi: {
        Args: { p_achieved: number; p_kpi_id: string }
        Returns: {
          rating: string
          score: number
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
      is_data_owner_for_employee: {
        Args: { p_employee_id: string; p_owner_id: string }
        Returns: boolean
      }
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
      month_name_to_index: { Args: { p_month: string }; Returns: number }
      preview_org_kpi_propagation: {
        Args: { p_kpi_ids: string[] }
        Returns: Json
      }
      propagate_org_kpi_value:
        | { Args: { p_is_na?: boolean; p_kpi_ratings: Json }; Returns: Json }
        | {
            Args: { p_is_na?: boolean; p_kpi_ratings: Json; p_remarks?: string }
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
      request_org_kpi_revision: {
        Args: { p_kpi_id: string; p_reason: string }
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
      tni_gap_type: "skill" | "knowledge" | "behavior"
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
      tni_gap_type: ["skill", "knowledge", "behavior"],
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
