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
      business_units: {
        Row: {
          code: string | null
          created_at: string
          division_id: string | null
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          division_id?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          division_id?: string | null
          id?: string
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
      departments: {
        Row: {
          business_unit_id: string | null
          code: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          business_unit_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          business_unit_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
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
      divisions: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
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
      kpi_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          kpi_id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          performed_by: string
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
          performed_by: string
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
          performed_by?: string
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
      kpi_queries: {
        Row: {
          created_at: string
          entity_type: Database["public"]["Enums"]["query_entity_type"]
          evidence_url: string | null
          id: string
          kpi_id: string
          raised_by: string
          raised_to: string
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["query_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_type?: Database["public"]["Enums"]["query_entity_type"]
          evidence_url?: string | null
          id?: string
          kpi_id: string
          raised_by: string
          raised_to: string
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["query_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_type?: Database["public"]["Enums"]["query_entity_type"]
          evidence_url?: string | null
          id?: string
          kpi_id?: string
          raised_by?: string
          raised_to?: string
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["query_status"]
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
            referencedRelation: "profiles"
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
      kpis: {
        Row: {
          category_id: string
          created_at: string
          criteria: string | null
          employee_id: string
          frequency: string | null
          id: string
          kpi_name: string
          kra_name: string
          r0: string | null
          r1: string | null
          r2: string | null
          r3: string | null
          r4: string | null
          r5: string | null
          review_period: string | null
          review_year: number | null
          source_of_data: string | null
          status: Database["public"]["Enums"]["review_status"] | null
          target_value: number | null
          uom: string | null
          updated_at: string
          weightage: number | null
        }
        Insert: {
          category_id: string
          created_at?: string
          criteria?: string | null
          employee_id: string
          frequency?: string | null
          id?: string
          kpi_name: string
          kra_name: string
          r0?: string | null
          r1?: string | null
          r2?: string | null
          r3?: string | null
          r4?: string | null
          r5?: string | null
          review_period?: string | null
          review_year?: number | null
          source_of_data?: string | null
          status?: Database["public"]["Enums"]["review_status"] | null
          target_value?: number | null
          uom?: string | null
          updated_at?: string
          weightage?: number | null
        }
        Update: {
          category_id?: string
          created_at?: string
          criteria?: string | null
          employee_id?: string
          frequency?: string | null
          id?: string
          kpi_name?: string
          kra_name?: string
          r0?: string | null
          r1?: string | null
          r2?: string | null
          r3?: string | null
          r4?: string | null
          r5?: string | null
          review_period?: string | null
          review_year?: number | null
          source_of_data?: string | null
          status?: Database["public"]["Enums"]["review_status"] | null
          target_value?: number | null
          uom?: string | null
          updated_at?: string
          weightage?: number | null
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
            referencedRelation: "profiles"
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
          name: string
          weightage: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          weightage?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          weightage?: number
        }
        Relationships: []
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department_id: string | null
          designation: string | null
          email: string
          employee_code: string | null
          full_name: string | null
          id: string
          pms_grade: string | null
          reporting_manager_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email: string
          employee_code?: string | null
          full_name?: string | null
          id: string
          pms_grade?: string | null
          reporting_manager_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email?: string
          employee_code?: string | null
          full_name?: string | null
          id?: string
          pms_grade?: string | null
          reporting_manager_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_fk"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
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
      review_periods: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          period_name: string
          review_year: number
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          period_name: string
          review_year: number
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          period_name?: string
          review_year?: number
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
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
          auditor_rating: Database["public"]["Enums"]["rating_level"] | null
          auditor_remarks: string | null
          auditor_score: number | null
          final_rating: Database["public"]["Enums"]["rating_level"] | null
          final_score: number | null
          id: string
          is_na: boolean
          kpi_id: string
          kpi_status: Database["public"]["Enums"]["kpi_status"]
          management_achieved_value: number | null
          management_evidence_url: string | null
          management_rating: Database["public"]["Enums"]["rating_level"] | null
          management_remarks: string | null
          management_score: number | null
          manager_achieved_value: number | null
          manager_evidence_url: string | null
          manager_rating: Database["public"]["Enums"]["rating_level"] | null
          manager_remarks: string | null
          manager_score: number | null
          performance_review_id: string | null
          self_evidence_url: string | null
          self_rating: Database["public"]["Enums"]["rating_level"] | null
          self_remarks: string | null
          self_score: number | null
          submitted_at: string
          updated_at: string
        }
        Insert: {
          achieved_value?: number | null
          auditor_achieved_value?: number | null
          auditor_evidence_url?: string | null
          auditor_rating?: Database["public"]["Enums"]["rating_level"] | null
          auditor_remarks?: string | null
          auditor_score?: number | null
          final_rating?: Database["public"]["Enums"]["rating_level"] | null
          final_score?: number | null
          id?: string
          is_na?: boolean
          kpi_id: string
          kpi_status?: Database["public"]["Enums"]["kpi_status"]
          management_achieved_value?: number | null
          management_evidence_url?: string | null
          management_rating?: Database["public"]["Enums"]["rating_level"] | null
          management_remarks?: string | null
          management_score?: number | null
          manager_achieved_value?: number | null
          manager_evidence_url?: string | null
          manager_rating?: Database["public"]["Enums"]["rating_level"] | null
          manager_remarks?: string | null
          manager_score?: number | null
          performance_review_id?: string | null
          self_evidence_url?: string | null
          self_rating?: Database["public"]["Enums"]["rating_level"] | null
          self_remarks?: string | null
          self_score?: number | null
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          achieved_value?: number | null
          auditor_achieved_value?: number | null
          auditor_evidence_url?: string | null
          auditor_rating?: Database["public"]["Enums"]["rating_level"] | null
          auditor_remarks?: string | null
          auditor_score?: number | null
          final_rating?: Database["public"]["Enums"]["rating_level"] | null
          final_score?: number | null
          id?: string
          is_na?: boolean
          kpi_id?: string
          kpi_status?: Database["public"]["Enums"]["kpi_status"]
          management_achieved_value?: number | null
          management_evidence_url?: string | null
          management_rating?: Database["public"]["Enums"]["rating_level"] | null
          management_remarks?: string | null
          management_score?: number | null
          manager_achieved_value?: number | null
          manager_evidence_url?: string | null
          manager_rating?: Database["public"]["Enums"]["rating_level"] | null
          manager_remarks?: string | null
          manager_score?: number | null
          performance_review_id?: string | null
          self_evidence_url?: string | null
          self_rating?: Database["public"]["Enums"]["rating_level"] | null
          self_remarks?: string | null
          self_score?: number | null
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
      sub_branches: {
        Row: {
          code: string | null
          created_at: string
          department_id: string | null
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
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
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_period_locked: {
        Args: { _period_name: string; _review_year: number }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "employee" | "auditor" | "management"
      kpi_status: "open" | "submitted" | "approved_by_manager" | "locked"
      query_entity_type: "kra" | "kpi"
      query_status: "open" | "resolved"
      rating_level: "red" | "yellow" | "green" | "blue"
      review_status:
        | "kra_set"
        | "self_review"
        | "manager_check"
        | "audit"
        | "approved"
        | "management_review"
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
      app_role: ["admin", "manager", "employee", "auditor", "management"],
      kpi_status: ["open", "submitted", "approved_by_manager", "locked"],
      query_entity_type: ["kra", "kpi"],
      query_status: ["open", "resolved"],
      rating_level: ["red", "yellow", "green", "blue"],
      review_status: [
        "kra_set",
        "self_review",
        "manager_check",
        "audit",
        "approved",
        "management_review",
      ],
    },
  },
} as const
