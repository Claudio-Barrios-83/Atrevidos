/**
 * This file was automatically generated.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source SQL schema
 * and run `supabase gen types typescript --project-id ynkhwsbeeythmkgjjsmoo > src/lib/database.types.ts`
 */

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
          cover_url: string | null
          location: string | null
          website: string | null
          date_of_birth: string | null
          gender: string | null
          political_orientation: string[] | null
          interests: string[] | null
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
          cover_url?: string | null
          location?: string | null
          website?: string | null
          date_of_birth?: string | null
          gender?: string | null
          political_orientation?: string[] | null
          interests?: string[] | null
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
          cover_url?: string | null
          location?: string | null
          website?: string | null
          date_of_birth?: string | null
          gender?: string | null
          political_orientation?: string[] | null
          interests?: string[] | null
          is_verified?: boolean
          is_active?: boolean
          last_active_at?: string | null
          created_at?: string
          updated_at?: string
        }
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
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}