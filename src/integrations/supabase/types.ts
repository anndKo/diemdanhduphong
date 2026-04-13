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
      account_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          device_hash: string
          email: string
          id: string
          ip_address: string | null
          phone: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          device_hash: string
          email: string
          id?: string
          ip_address?: string | null
          phone?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          device_hash?: string
          email?: string
          id?: string
          ip_address?: string | null
          phone?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          bonus_points: number | null
          class_id: string
          created_at: string
          group_number: string
          id: string
          name: string
          photo_url: string | null
          student_code: string
          week_number: number
        }
        Insert: {
          bonus_points?: number | null
          class_id: string
          created_at?: string
          group_number: string
          id?: string
          name: string
          photo_url?: string | null
          student_code: string
          week_number?: number
        }
        Update: {
          bonus_points?: number | null
          class_id?: string
          created_at?: string
          group_number?: string
          id?: string
          name?: string
          photo_url?: string | null
          student_code?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_codes: {
        Row: {
          class_id: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          status: string
          used_at: string | null
          used_by_code: string | null
          used_by_group: string | null
          used_by_name: string | null
          week_number: number | null
        }
        Insert: {
          class_id: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          used_at?: string | null
          used_by_code?: string | null
          used_by_group?: string | null
          used_by_name?: string | null
          week_number?: number | null
        }
        Update: {
          class_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          used_at?: string | null
          used_by_code?: string | null
          used_by_group?: string | null
          used_by_name?: string | null
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bonus_codes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          admin_latitude: number | null
          admin_longitude: number | null
          advanced_verification: boolean | null
          attendance_duration_minutes: number | null
          attendance_started_at: string | null
          bonus_points_enabled: boolean | null
          code: string
          created_at: string
          created_by: string | null
          current_week: number | null
          id: string
          name: string
          weeks_count: number
        }
        Insert: {
          admin_latitude?: number | null
          admin_longitude?: number | null
          advanced_verification?: boolean | null
          attendance_duration_minutes?: number | null
          attendance_started_at?: string | null
          bonus_points_enabled?: boolean | null
          code: string
          created_at?: string
          created_by?: string | null
          current_week?: number | null
          id?: string
          name: string
          weeks_count?: number
        }
        Update: {
          admin_latitude?: number | null
          admin_longitude?: number | null
          advanced_verification?: boolean | null
          attendance_duration_minutes?: number | null
          attendance_started_at?: string | null
          bonus_points_enabled?: boolean | null
          code?: string
          created_at?: string
          created_by?: string | null
          current_week?: number | null
          id?: string
          name?: string
          weeks_count?: number
        }
        Relationships: []
      }
      deleted_attendance_records: {
        Row: {
          bonus_points: number | null
          class_id: string
          deleted_at: string
          deleted_by: string | null
          group_number: string
          id: string
          name: string
          original_created_at: string
          original_id: string
          photo_url: string | null
          student_code: string
          week_number: number
        }
        Insert: {
          bonus_points?: number | null
          class_id: string
          deleted_at?: string
          deleted_by?: string | null
          group_number: string
          id?: string
          name: string
          original_created_at: string
          original_id: string
          photo_url?: string | null
          student_code: string
          week_number?: number
        }
        Update: {
          bonus_points?: number | null
          class_id?: string
          deleted_at?: string
          deleted_by?: string | null
          group_number?: string
          id?: string
          name?: string
          original_created_at?: string
          original_id?: string
          photo_url?: string | null
          student_code?: string
          week_number?: number
        }
        Relationships: []
      }
      device_blocks: {
        Row: {
          block_count: number
          blocked_until: string | null
          created_at: string
          device_hash: string
          id: string
          is_permanent: boolean
          reason: string | null
          updated_at: string
        }
        Insert: {
          block_count?: number
          blocked_until?: string | null
          created_at?: string
          device_hash: string
          id?: string
          is_permanent?: boolean
          reason?: string | null
          updated_at?: string
        }
        Update: {
          block_count?: number
          blocked_until?: string | null
          created_at?: string
          device_hash?: string
          id?: string
          is_permanent?: boolean
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      device_fingerprints: {
        Row: {
          created_at: string
          device_hash: string
          id: string
          ip_address: string | null
          raw_components: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_hash: string
          id?: string
          ip_address?: string | null
          raw_components?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_hash?: string
          id?: string
          ip_address?: string | null
          raw_components?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      face_images: {
        Row: {
          created_at: string
          face_descriptor: Json | null
          file_size: number | null
          id: string
          image_url: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          face_descriptor?: Json | null
          file_size?: number | null
          id?: string
          image_url: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          face_descriptor?: Json | null
          file_size?: number | null
          id?: string
          image_url?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      guides: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          image_urls: Json | null
          sort_order: number
          title: string
          video_urls: Json | null
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          image_urls?: Json | null
          sort_order?: number
          title: string
          video_urls?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          image_urls?: Json | null
          sort_order?: number
          title?: string
          video_urls?: Json | null
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          behavior_data: Json | null
          created_at: string
          device_hash: string
          email: string | null
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          behavior_data?: Json | null
          created_at?: string
          device_hash: string
          email?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          behavior_data?: Json | null
          created_at?: string
          device_hash?: string
          email?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      password_reset_requests: {
        Row: {
          created_at: string
          device_hash: string
          email: string
          id: string
          phone: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          device_hash: string
          email: string
          id?: string
          phone?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          device_hash?: string
          email?: string
          id?: string
          phone?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      protection_password_attempts: {
        Row: {
          attempt_count: number
          blocked_until: string | null
          created_at: string
          device_hash: string
          id: string
          ip_address: string | null
          last_attempt_at: string | null
        }
        Insert: {
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string
          device_hash: string
          id?: string
          ip_address?: string | null
          last_attempt_at?: string | null
        }
        Update: {
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string
          device_hash?: string
          id?: string
          ip_address?: string | null
          last_attempt_at?: string | null
        }
        Relationships: []
      }
      protection_passwords: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          password_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          password_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          password_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          device_hash: string | null
          id: string
          ip_address: string | null
          risk_score: number | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          device_hash?: string | null
          id?: string
          ip_address?: string | null
          risk_score?: number | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          device_hash?: string | null
          id?: string
          ip_address?: string | null
          risk_score?: number | null
        }
        Relationships: []
      }
      student_warnings: {
        Row: {
          class_id: string
          created_at: string
          group_number: string | null
          id: string
          photo_url: string | null
          reason: string | null
          student_code: string
          student_name: string
          week_number: number | null
        }
        Insert: {
          class_id: string
          created_at?: string
          group_number?: string | null
          id?: string
          photo_url?: string | null
          reason?: string | null
          student_code: string
          student_name: string
          week_number?: number | null
        }
        Update: {
          class_id?: string
          created_at?: string
          group_number?: string | null
          id?: string
          photo_url?: string | null
          reason?: string | null
          student_code?: string
          student_name?: string
          week_number?: number | null
        }
        Relationships: []
      }
      students: {
        Row: {
          class_id: string
          created_at: string
          group_number: string
          id: string
          name: string
          student_code: string
        }
        Insert: {
          class_id: string
          created_at?: string
          group_number: string
          id?: string
          name: string
          student_code: string
        }
        Update: {
          class_id?: string
          created_at?: string
          group_number?: string
          id?: string
          name?: string
          student_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_disable_protection_password: {
        Args: { target_email: string }
        Returns: boolean
      }
      disable_protection_password: { Args: never; Returns: boolean }
      is_protection_password_enabled: { Args: never; Returns: boolean }
      set_protection_password: {
        Args: { p_password: string }
        Returns: boolean
      }
      verify_protection_password: {
        Args: { p_password: string }
        Returns: boolean
      }
      verify_protection_password_raw: {
        Args: { p_hash: string; p_password: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
