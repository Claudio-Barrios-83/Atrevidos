// Supabase types
export interface Profile {
	id: string;
	username: string;
	full_name?: string;
	avatar_url?: string;
	bio?: string;
	political_orientation?: string;
	is_anonymous?: boolean;
	created_at: string;
	updated_at: string;
}

export interface Post {
	id: string;
	user_id: string;
	content: string;
	visibility: 'public' | 'followers' | 'private';
	is_anonymous: boolean;
	media_urls: string[];
	likes_count: number;
	comments_count: number;
	created_at: string;
	updated_at: string;
}

export interface Comment {
	id: string;
	post_id: string;
	user_id: string;
	content: string;
	parent_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface Like {
	id: string;
	post_id: string;
	user_id: string;
	created_at: string;
}

export interface Follow {
	id: string;
	follower_id: string;
	following_id: string;
	created_at: string;
}

export interface Media {
	url: string;
	type: 'image' | 'video';
	uploaded_at: string;
}