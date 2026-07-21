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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_edited: boolean | null
          is_hidden: boolean | null
          like_count: number | null
          parent_comment_id: string | null
          post_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_edited?: boolean | null
          is_hidden?: boolean | null
          like_count?: number | null
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_edited?: boolean | null
          is_hidden?: boolean | null
          like_count?: number | null
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          last_read_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_read_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_read_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "user_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_group: boolean | null
          last_message_at: string | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_group?: boolean | null
          last_message_at?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_group?: boolean | null
          last_message_at?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          reaction_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          reaction_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          reaction_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string | null
          id: string
          is_mutual: boolean | null
          match_type: string | null
          target_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_mutual?: boolean | null
          match_type?: string | null
          target_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_mutual?: boolean | null
          match_type?: string | null
          target_user_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          media_type: string | null
          media_url: string | null
          read_at: string | null
          reply_to_id: string | null
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          media_type?: string | null
          media_url?: string | null
          read_at?: string | null
          reply_to_id?: string | null
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          media_type?: string | null
          media_url?: string | null
          read_at?: string | null
          reply_to_id?: string | null
          sender_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "user_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          comment_count: number | null
          content: string
          created_at: string | null
          id: string
          image_urls: string[] | null
          is_anonymous: boolean | null
          is_archived: boolean | null
          is_pinned: boolean | null
          like_count: number | null
          share_count: number | null
          updated_at: string | null
          user_id: string
          video_url: string | null
          visibility: string | null
        }
        Insert: {
          comment_count?: number | null
          content: string
          created_at?: string | null
          id?: string
          image_urls?: string[] | null
          is_anonymous?: boolean | null
          is_archived?: boolean | null
          is_pinned?: boolean | null
          like_count?: number | null
          share_count?: number | null
          updated_at?: string | null
          user_id: string
          video_url?: string | null
          visibility?: string | null
        }
        Update: {
          comment_count?: number | null
          content?: string
          created_at?: string | null
          id?: string
          image_urls?: string[] | null
          is_anonymous?: boolean | null
          is_archived?: boolean | null
          is_pinned?: boolean | null
          like_count?: number | null
          share_count?: number | null
          updated_at?: string | null
          user_id?: string
          video_url?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_confirmed: boolean
          avatar_url: string | null
          bio: string | null
          consent_acknowledged: boolean
          cover_url: string | null
          created_at: string | null
          date_of_birth: string | null
          display_name: string | null
          gallery_urls: string[]
          gender: string | null
          id: string
          interests: string[] | null
          is_active: boolean | null
          is_verified: boolean | null
          last_active_at: string | null
          location: string | null
          onboarding_completed_at: string | null
          political_orientation: string[] | null
          relationship_intent: string | null
          relationship_preferences: string | null
          updated_at: string | null
          username: string
          website: string | null
        }
        Insert: {
          age_confirmed?: boolean
          avatar_url?: string | null
          bio?: string | null
          consent_acknowledged?: boolean
          cover_url?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          gallery_urls?: string[]
          gender?: string | null
          id: string
          interests?: string[] | null
          is_active?: boolean | null
          is_verified?: boolean | null
          last_active_at?: string | null
          location?: string | null
          onboarding_completed_at?: string | null
          political_orientation?: string[] | null
          relationship_intent?: string | null
          relationship_preferences?: string | null
          updated_at?: string | null
          username: string
          website?: string | null
        }
        Update: {
          age_confirmed?: boolean
          avatar_url?: string | null
          bio?: string | null
          consent_acknowledged?: boolean
          cover_url?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          gallery_urls?: string[]
          gender?: string | null
          id?: string
          interests?: string[] | null
          is_active?: boolean | null
          is_verified?: boolean | null
          last_active_at?: string | null
          location?: string | null
          onboarding_completed_at?: string | null
          political_orientation?: string[] | null
          relationship_intent?: string | null
          relationship_preferences?: string | null
          updated_at?: string | null
          username?: string
          website?: string | null
        }
        Relationships: []
      }
      report_history: {
        Row: {
          action_taken: string
          created_at: string | null
          id: string
          notes: string | null
          performed_by: string | null
          report_id: string
        }
        Insert: {
          action_taken: string
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          report_id: string
        }
        Update: {
          action_taken?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_history_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_history_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          category: Database["public"]["Enums"]["report_category"]
          created_at: string | null
          id: string
          is_action_taken: boolean | null
          reason: string
          reporter_id: string
          resolution_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["report_status"] | null
          target_id: string
          target_type: string
          updated_at: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["report_category"]
          created_at?: string | null
          id?: string
          is_action_taken?: boolean | null
          reason: string
          reporter_id: string
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          target_id: string
          target_type: string
          updated_at?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["report_category"]
          created_at?: string | null
          id?: string
          is_action_taken?: boolean | null
          reason?: string
          reporter_id?: string
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          target_id?: string
          target_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          plan: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          plan?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          plan?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user_conversations: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string | null
          is_group: boolean | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_sender: string | null
          last_message_time: string | null
          name: string | null
          unread_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_access_conversation: {
        Args: { conversation_uuid: string; requesting_user?: string }
        Returns: boolean
      }
      can_manage_group_participants: {
        Args: { conversation_uuid: string; requesting_user?: string }
        Returns: boolean
      }
      can_update_own_participation: {
        Args: {
          conversation_uuid: string
          participant_created_at: string
          participant_is_active: boolean
          participant_role: string
          participant_user: string
          participant_uuid: string
          requesting_user?: string
        }
        Returns: boolean
      }
      cancel_mock_subscription: {
        Args: { target_user_id: string }
        Returns: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          plan: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
      }
      create_conversation_for_match: {
        Args: { user1: string; user2: string }
        Returns: string
      }
      has_active_direct_match: {
        Args: { user1: string; user2: string }
        Returns: boolean
      }
      has_active_subscription: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      has_block_between_users: {
        Args: { user1: string; user2: string }
        Returns: boolean
      }
      is_valid_direct_conversation: {
        Args: { conversation_uuid: string; requesting_user?: string }
        Returns: boolean
      }
      search_users: {
        Args: { search_term: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          username: string
        }[]
      }
      start_mock_subscription_checkout: {
        Args: { target_user_id: string }
        Returns: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          plan: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
      }
      upsert_subscription_status: {
        Args: {
          new_current_period_end: string
          new_provider: string
          new_provider_customer_id: string
          new_provider_subscription_id: string
          new_status: Database["public"]["Enums"]["subscription_status"]
          target_user_id: string
        }
        Returns: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          plan: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
      }
    }
    Enums: {
      report_category:
        | "spam"
        | "harassment"
        | "hate_speech"
        | "false_info"
        | "inappropriate_content"
        | "other"
      report_status: "pending" | "under_review" | "resolved" | "dismissed"
      subscription_status: "inactive" | "active" | "past_due" | "canceled"
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
      report_category: [
        "spam",
        "harassment",
        "hate_speech",
        "false_info",
        "inappropriate_content",
        "other",
      ],
      report_status: ["pending", "under_review", "resolved", "dismissed"],
      subscription_status: ["inactive", "active", "past_due", "canceled"],
    },
  },
} as const
