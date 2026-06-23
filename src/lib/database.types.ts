export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string | null
          bio: string | null
          avatar_url: string | null
          gallery_urls: string[]
          cover_url: string | null
          location: string | null
          website: string | null
          date_of_birth: string | null
          gender: string | null
          political_orientation: string[] | null
          interests: string[] | null
          relationship_intent: 'amistad' | 'citas' | 'relacion_seria' | 'conocer_personas' | 'aun_explorando' | null
          relationship_preferences: string | null
          consent_acknowledged: boolean
          age_confirmed: boolean
          onboarding_completed_at: string | null
          is_verified: boolean
          is_active: boolean
          last_active_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          display_name?: string | null
          bio?: string | null
          avatar_url?: string | null
          gallery_urls?: string[]
          cover_url?: string | null
          location?: string | null
          website?: string | null
          date_of_birth?: string | null
          gender?: string | null
          political_orientation?: string[] | null
          interests?: string[] | null
          relationship_intent?: 'amistad' | 'citas' | 'relacion_seria' | 'conocer_personas' | 'aun_explorando' | null
          relationship_preferences?: string | null
          consent_acknowledged?: boolean
          age_confirmed?: boolean
          onboarding_completed_at?: string | null
          is_verified?: boolean
          is_active?: boolean
          last_active_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          display_name?: string | null
          bio?: string | null
          avatar_url?: string | null
          gallery_urls?: string[]
          cover_url?: string | null
          location?: string | null
          website?: string | null
          date_of_birth?: string | null
          gender?: string | null
          political_orientation?: string[] | null
          interests?: string[] | null
          relationship_intent?: 'amistad' | 'citas' | 'relacion_seria' | 'conocer_personas' | 'aun_explorando' | null
          relationship_preferences?: string | null
          consent_acknowledged?: boolean
          age_confirmed?: boolean
          onboarding_completed_at?: string | null
          is_verified?: boolean
          is_active?: boolean
          last_active_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          id: string
          user_id: string
          content: string
          image_urls: string[] | null
          video_url: string | null
          is_anonymous: boolean
          visibility: 'public' | 'followers' | 'private'
          like_count: number
          comment_count: number
          share_count: number
          is_pinned: boolean
          is_archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          content: string
          image_urls?: string[] | null
          video_url?: string | null
          is_anonymous?: boolean
          visibility?: 'public' | 'followers' | 'private'
          like_count?: number
          comment_count?: number
          share_count?: number
          is_pinned?: boolean
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          content?: string
          image_urls?: string[] | null
          video_url?: string | null
          is_anonymous?: boolean
          visibility?: 'public' | 'followers' | 'private'
          like_count?: number
          comment_count?: number
          share_count?: number
          is_pinned?: boolean
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          id: string
          user_id: string
          post_id: string
          reaction_type: 'like' | 'love' | 'like-liberal' | 'agreement'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          post_id: string
          reaction_type?: 'like' | 'love' | 'like-liberal' | 'agreement'
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          post_id?: string
          reaction_type?: 'like' | 'love' | 'like-liberal' | 'agreement'
          created_at?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          id: string
          user_id: string
          post_id: string
          parent_comment_id: string | null
          content: string
          is_edited: boolean
          like_count: number
          is_hidden: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          post_id: string
          parent_comment_id?: string | null
          content: string
          is_edited?: boolean
          like_count?: number
          is_hidden?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          post_id?: string
          parent_comment_id?: string | null
          content?: string
          is_edited?: boolean
          like_count?: number
          is_hidden?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          id: string
          user_id: string
          target_user_id: string
          match_type: 'like' | 'super-like' | 'block'
          is_mutual: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          target_user_id: string
          match_type?: 'like' | 'super-like' | 'block'
          is_mutual?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          target_user_id?: string
          match_type?: 'like' | 'super-like' | 'block'
          is_mutual?: boolean
          created_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          id: string
          reporter_id: string
          target_type: 'user' | 'post' | 'comment' | 'message'
          target_id: string
          category: 'spam' | 'harassment' | 'hate_speech' | 'false_info' | 'inappropriate_content' | 'other'
          reason: string
          status: 'pending' | 'under_review' | 'resolved' | 'dismissed' | null
          reviewed_by: string | null
          reviewed_at: string | null
          resolution_notes: string | null
          is_action_taken: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          reporter_id: string
          target_type: 'user' | 'post' | 'comment' | 'message'
          target_id: string
          category: 'spam' | 'harassment' | 'hate_speech' | 'false_info' | 'inappropriate_content' | 'other'
          reason: string
          status?: 'pending' | 'under_review' | 'resolved' | 'dismissed' | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          resolution_notes?: string | null
          is_action_taken?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          reporter_id?: string
          target_type?: 'user' | 'post' | 'comment' | 'message'
          target_id?: string
          category?: 'spam' | 'harassment' | 'hate_speech' | 'false_info' | 'inappropriate_content' | 'other'
          reason?: string
          status?: 'pending' | 'under_review' | 'resolved' | 'dismissed' | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          resolution_notes?: string | null
          is_action_taken?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
