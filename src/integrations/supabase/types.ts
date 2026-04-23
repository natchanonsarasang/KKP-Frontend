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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      call_attempts: {
        Row: {
          ai_category: string | null
          attempt_number: number
          audio_url: string | null
          call_duration: number | null
          call_list_item_id: string
          call_outcome: string | null
          call_record_id: string | null
          conversation_log: string | null
          created_at: string
          error_reason: string | null
          id: string
          picked_up: boolean | null
          status: string
          user_id: string
        }
        Insert: {
          ai_category?: string | null
          attempt_number?: number
          audio_url?: string | null
          call_duration?: number | null
          call_list_item_id: string
          call_outcome?: string | null
          call_record_id?: string | null
          conversation_log?: string | null
          created_at?: string
          error_reason?: string | null
          id?: string
          picked_up?: boolean | null
          status?: string
          user_id: string
        }
        Update: {
          ai_category?: string | null
          attempt_number?: number
          audio_url?: string | null
          call_duration?: number | null
          call_list_item_id?: string
          call_outcome?: string | null
          call_record_id?: string | null
          conversation_log?: string | null
          created_at?: string
          error_reason?: string | null
          id?: string
          picked_up?: boolean | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_attempts_call_list_item_id_fkey"
            columns: ["call_list_item_id"]
            isOneToOne: false
            referencedRelation: "call_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_attempts_call_record_id_fkey"
            columns: ["call_record_id"]
            isOneToOne: false
            referencedRelation: "call_records"
            referencedColumns: ["id"]
          },
        ]
      }
      call_list_items: {
        Row: {
          ai_category: string | null
          call_outcome: string | null
          call_record_id: string | null
          called_at: string | null
          created_at: string
          debtor_id: string
          id: string
          next_retry_at: string | null
          notes: string | null
          phone_number: string | null
          picked_up: boolean | null
          retry_count: number
          scheduled_at: string | null
          status: string
          template_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ai_category?: string | null
          call_outcome?: string | null
          call_record_id?: string | null
          called_at?: string | null
          created_at?: string
          debtor_id: string
          id?: string
          next_retry_at?: string | null
          notes?: string | null
          phone_number?: string | null
          picked_up?: boolean | null
          retry_count?: number
          scheduled_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ai_category?: string | null
          call_outcome?: string | null
          call_record_id?: string | null
          called_at?: string | null
          created_at?: string
          debtor_id?: string
          id?: string
          next_retry_at?: string | null
          notes?: string | null
          phone_number?: string | null
          picked_up?: boolean | null
          retry_count?: number
          scheduled_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_list_items_call_record_id_fkey"
            columns: ["call_record_id"]
            isOneToOne: false
            referencedRelation: "call_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_list_items_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "debtors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_list_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "call_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_list_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      call_records: {
        Row: {
          amount: string | null
          appointment_date: string | null
          appointment_time: string | null
          botnoi_call_id: string | null
          call_duration: number | null
          created_at: string
          due_date: string | null
          id: string
          phone_number: string
          result_data: Json | null
          status: string | null
          template_id: string | null
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          amount?: string | null
          appointment_date?: string | null
          appointment_time?: string | null
          botnoi_call_id?: string | null
          call_duration?: number | null
          created_at?: string
          due_date?: string | null
          id?: string
          phone_number: string
          result_data?: Json | null
          status?: string | null
          template_id?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          amount?: string | null
          appointment_date?: string | null
          appointment_time?: string | null
          botnoi_call_id?: string | null
          call_duration?: number | null
          created_at?: string
          due_date?: string | null
          id?: string
          phone_number?: string
          result_data?: Json | null
          status?: string | null
          template_id?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_records_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "call_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      call_sessions: {
        Row: {
          completed_at: string | null
          completed_calls: number
          confirmed_calls: number
          created_at: string
          error_message: string | null
          failed_calls: number
          id: string
          settings: Json | null
          started_at: string
          status: string
          tokens_used: number
          total_calls: number
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_calls?: number
          confirmed_calls?: number
          created_at?: string
          error_message?: string | null
          failed_calls?: number
          id?: string
          settings?: Json | null
          started_at?: string
          status?: string
          tokens_used?: number
          total_calls?: number
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          completed_calls?: number
          confirmed_calls?: number
          created_at?: string
          error_message?: string | null
          failed_calls?: number
          id?: string
          settings?: Json | null
          started_at?: string
          status?: string
          tokens_used?: number
          total_calls?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      call_templates: {
        Row: {
          confirm_message: string
          created_at: string
          decline_message: string
          fallback_message: string
          id: string
          is_system_default: boolean
          message: string
          org_name: string
          speaker_id: string
          template_id: string | null
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          confirm_message: string
          created_at?: string
          decline_message: string
          fallback_message: string
          id?: string
          is_system_default?: boolean
          message: string
          org_name?: string
          speaker_id?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          confirm_message?: string
          created_at?: string
          decline_message?: string
          fallback_message?: string
          id?: string
          is_system_default?: boolean
          message?: string
          org_name?: string
          speaker_id?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      call_tokens: {
        Row: {
          created_at: string
          id: string
          tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      debtors: {
        Row: {
          accept_count: number
          auto_call_enabled: boolean
          call_answered: boolean | null
          call_outcome: string | null
          contact_attempts: number
          created_at: string
          due_date: string | null
          id: string
          is_blocked: boolean
          last_contact_at: string | null
          last_name: string | null
          last_response: string | null
          name: string | null
          next_follow_up: string | null
          not_picked_up_count: number
          notes: string | null
          other_count: number
          phone_number: string
          picked_up_count: number
          reject_count: number
          status: string
          successful_contacts: number
          total_debt: number
          updated_at: string
          user_id: string | null
          variables: Json | null
          workspace_id: string | null
        }
        Insert: {
          accept_count?: number
          auto_call_enabled?: boolean
          call_answered?: boolean | null
          call_outcome?: string | null
          contact_attempts?: number
          created_at?: string
          due_date?: string | null
          id?: string
          is_blocked?: boolean
          last_contact_at?: string | null
          last_name?: string | null
          last_response?: string | null
          name?: string | null
          next_follow_up?: string | null
          not_picked_up_count?: number
          notes?: string | null
          other_count?: number
          phone_number: string
          picked_up_count?: number
          reject_count?: number
          status?: string
          successful_contacts?: number
          total_debt?: number
          updated_at?: string
          user_id?: string | null
          variables?: Json | null
          workspace_id?: string | null
        }
        Update: {
          accept_count?: number
          auto_call_enabled?: boolean
          call_answered?: boolean | null
          call_outcome?: string | null
          contact_attempts?: number
          created_at?: string
          due_date?: string | null
          id?: string
          is_blocked?: boolean
          last_contact_at?: string | null
          last_name?: string | null
          last_response?: string | null
          name?: string | null
          next_follow_up?: string | null
          not_picked_up_count?: number
          notes?: string | null
          other_count?: number
          phone_number?: string
          picked_up_count?: number
          reject_count?: number
          status?: string
          successful_contacts?: number
          total_debt?: number
          updated_at?: string
          user_id?: string | null
          variables?: Json | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debtors_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_tokens: {
        Args: { p_amount: number; p_user_id: string }
        Returns: number
      }
      deduct_call_token: { Args: { p_user_id: string }; Returns: boolean }
      deduct_tokens: {
        Args: { p_amount: number; p_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_access: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: boolean
      }
      sum_debtor_variable: {
        Args: { p_key: string; p_user_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
