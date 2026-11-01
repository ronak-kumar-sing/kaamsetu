export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string;
          updated_at: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          data: NonNullable<Json>;
          entity_id: string | null;
          entity_type: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
        };
        Relationships: [];
      };
      kyc_verifications: {
        Row: {
          created_at: string;
          doc_type: Database['public']['Enums']['kyc_doc_type'];
          id: string;
          id_hash: string;
          id_last4: string;
          provider: string;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database['public']['Enums']['kyc_status'];
          storage_path: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          doc_type: Database['public']['Enums']['kyc_doc_type'];
          id?: string;
          id_hash: string;
          id_last4: string;
          provider?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['kyc_status'];
          storage_path: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          doc_type?: Database['public']['Enums']['kyc_doc_type'];
          id?: string;
          id_hash?: string;
          id_last4?: string;
          provider?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['kyc_status'];
          storage_path?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'kyc_verifications_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'kyc_verifications_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'kyc_verifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'kyc_verifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      milestone_status_history: {
        Row: {
          actor_id: string | null;
          actor_kind: Database['public']['Enums']['milestone_actor_kind'];
          created_at: string;
          from_status: Database['public']['Enums']['milestone_status'];
          id: string;
          milestone_id: string;
          note: string | null;
          to_status: Database['public']['Enums']['milestone_status'];
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          actor_kind: Database['public']['Enums']['milestone_actor_kind'];
          created_at?: string;
          from_status: Database['public']['Enums']['milestone_status'];
          id?: string;
          milestone_id: string;
          note?: string | null;
          to_status: Database['public']['Enums']['milestone_status'];
        };
        Update: {
          actor_id?: string | null;
          actor_kind?: Database['public']['Enums']['milestone_actor_kind'];
          created_at?: string;
          from_status?: Database['public']['Enums']['milestone_status'];
          id?: string;
          milestone_id?: string;
          note?: string | null;
          to_status?: Database['public']['Enums']['milestone_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'milestone_status_history_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'milestone_status_history_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'milestone_status_history_milestone_id_fkey';
            columns: ['milestone_id'];
            isOneToOne: false;
            referencedRelation: 'milestones';
            referencedColumns: ['id'];
          },
        ];
      };
      milestone_transitions: {
        Row: {
          actor_kind: Database['public']['Enums']['milestone_actor_kind'];
          created_at: string;
          from_status: Database['public']['Enums']['milestone_status'];
          to_status: Database['public']['Enums']['milestone_status'];
        };
        ComputedFields: never;
        Insert: {
          actor_kind: Database['public']['Enums']['milestone_actor_kind'];
          created_at?: string;
          from_status: Database['public']['Enums']['milestone_status'];
          to_status: Database['public']['Enums']['milestone_status'];
        };
        Update: {
          actor_kind?: Database['public']['Enums']['milestone_actor_kind'];
          created_at?: string;
          from_status?: Database['public']['Enums']['milestone_status'];
          to_status?: Database['public']['Enums']['milestone_status'];
        };
        Relationships: [];
      };
      milestones: {
        Row: {
          acceptance_criteria: string;
          amount_paise: number;
          approved_at: string | null;
          created_at: string;
          deliverable: string;
          due_date: string;
          id: string;
          position: number;
          project_id: string;
          released_at: string | null;
          revision_count: number;
          started_at: string | null;
          status: Database['public']['Enums']['milestone_status'];
          submitted_at: string | null;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          acceptance_criteria?: string;
          amount_paise: number;
          approved_at?: string | null;
          created_at?: string;
          deliverable?: string;
          due_date: string;
          id?: string;
          position: number;
          project_id: string;
          released_at?: string | null;
          revision_count?: number;
          started_at?: string | null;
          status?: Database['public']['Enums']['milestone_status'];
          submitted_at?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          acceptance_criteria?: string;
          amount_paise?: number;
          approved_at?: string | null;
          created_at?: string;
          deliverable?: string;
          due_date?: string;
          id?: string;
          position?: number;
          project_id?: string;
          released_at?: string | null;
          revision_count?: number;
          started_at?: string | null;
          status?: Database['public']['Enums']['milestone_status'];
          submitted_at?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'milestones_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      portfolio_items: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          kind: Database['public']['Enums']['portfolio_kind'];
          profile_id: string;
          sort_order: number;
          storage_path: string | null;
          title: string;
          updated_at: string;
          url: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          kind: Database['public']['Enums']['portfolio_kind'];
          profile_id: string;
          sort_order?: number;
          storage_path?: string | null;
          title: string;
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['portfolio_kind'];
          profile_id?: string;
          sort_order?: number;
          storage_path?: string | null;
          title?: string;
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'portfolio_items_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'portfolio_items_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profile_skills: {
        Row: {
          created_at: string;
          profile_id: string;
          skill_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          profile_id: string;
          skill_id: string;
        };
        Update: {
          created_at?: string;
          profile_id?: string;
          skill_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profile_skills_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_skills_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_skills_skill_id_fkey';
            columns: ['skill_id'];
            isOneToOne: false;
            referencedRelation: 'skills';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          availability: Database['public']['Enums']['availability_status'];
          avatar_path: string | null;
          bio: string | null;
          city: string | null;
          created_at: string;
          email: string | null;
          email_verified: boolean;
          full_name: string | null;
          headline: string | null;
          hourly_rate_paise: number | null;
          id: string;
          is_flagged: boolean;
          kyc_verified: boolean;
          languages: string[];
          onboarding_completed_at: string | null;
          phone: string | null;
          phone_verified: boolean;
          portfolio_verified: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          availability?: Database['public']['Enums']['availability_status'];
          avatar_path?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          email?: string | null;
          email_verified?: boolean;
          full_name?: string | null;
          headline?: string | null;
          hourly_rate_paise?: number | null;
          id: string;
          is_flagged?: boolean;
          kyc_verified?: boolean;
          languages?: string[];
          onboarding_completed_at?: string | null;
          phone?: string | null;
          phone_verified?: boolean;
          portfolio_verified?: boolean;
          updated_at?: string;
        };
        Update: {
          availability?: Database['public']['Enums']['availability_status'];
          avatar_path?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          email?: string | null;
          email_verified?: boolean;
          full_name?: string | null;
          headline?: string | null;
          hourly_rate_paise?: number | null;
          id?: string;
          is_flagged?: boolean;
          kyc_verified?: boolean;
          languages?: string[];
          onboarding_completed_at?: string | null;
          phone?: string | null;
          phone_verified?: boolean;
          portfolio_verified?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_invites: {
        Row: {
          created_at: string;
          expires_at: string;
          freelancer_id: string | null;
          id: string;
          invited_by: string;
          phone_e164: string | null;
          project_id: string;
          responded_at: string | null;
          status: Database['public']['Enums']['invite_status'];
          token: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expires_at?: string;
          freelancer_id?: string | null;
          id?: string;
          invited_by: string;
          phone_e164?: string | null;
          project_id: string;
          responded_at?: string | null;
          status?: Database['public']['Enums']['invite_status'];
          token: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          freelancer_id?: string | null;
          id?: string;
          invited_by?: string;
          phone_e164?: string | null;
          project_id?: string;
          responded_at?: string | null;
          status?: Database['public']['Enums']['invite_status'];
          token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_invites_freelancer_id_fkey';
            columns: ['freelancer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_invites_freelancer_id_fkey';
            columns: ['freelancer_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_invites_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      project_members: {
        Row: {
          active: boolean;
          joined_at: string;
          left_at: string | null;
          member_role: Database['public']['Enums']['project_member_role'];
          project_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          joined_at?: string;
          left_at?: string | null;
          member_role: Database['public']['Enums']['project_member_role'];
          project_id: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          joined_at?: string;
          left_at?: string | null;
          member_role?: Database['public']['Enums']['project_member_role'];
          project_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_members_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      project_skills: {
        Row: {
          created_at: string;
          project_id: string;
          skill_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          project_id: string;
          skill_id: string;
        };
        Update: {
          created_at?: string;
          project_id?: string;
          skill_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_skills_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_skills_skill_id_fkey';
            columns: ['skill_id'];
            isOneToOne: false;
            referencedRelation: 'skills';
            referencedColumns: ['id'];
          },
        ];
      };
      projects: {
        Row: {
          awarded_at: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          category: string;
          checkin_cadence_days: number;
          city: string | null;
          client_id: string;
          created_at: string;
          deposit_required: boolean;
          description: string;
          freelancer_id: string | null;
          id: string;
          is_remote: boolean;
          is_takeover: boolean;
          published_at: string | null;
          revision_limit: number;
          source_project_id: string | null;
          status: Database['public']['Enums']['project_status'];
          title: string;
          total_paise: number;
          updated_at: string;
          visibility: Database['public']['Enums']['project_visibility'];
        };
        ComputedFields: never;
        Insert: {
          awarded_at?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          category: string;
          checkin_cadence_days?: number;
          city?: string | null;
          client_id: string;
          created_at?: string;
          deposit_required?: boolean;
          description: string;
          freelancer_id?: string | null;
          id?: string;
          is_remote?: boolean;
          is_takeover?: boolean;
          published_at?: string | null;
          revision_limit?: number;
          source_project_id?: string | null;
          status?: Database['public']['Enums']['project_status'];
          title: string;
          total_paise?: number;
          updated_at?: string;
          visibility?: Database['public']['Enums']['project_visibility'];
        };
        Update: {
          awarded_at?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          category?: string;
          checkin_cadence_days?: number;
          city?: string | null;
          client_id?: string;
          created_at?: string;
          deposit_required?: boolean;
          description?: string;
          freelancer_id?: string | null;
          id?: string;
          is_remote?: boolean;
          is_takeover?: boolean;
          published_at?: string | null;
          revision_limit?: number;
          source_project_id?: string | null;
          status?: Database['public']['Enums']['project_status'];
          title?: string;
          total_paise?: number;
          updated_at?: string;
          visibility?: Database['public']['Enums']['project_visibility'];
        };
        Relationships: [
          {
            foreignKeyName: 'projects_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projects_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projects_freelancer_id_fkey';
            columns: ['freelancer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projects_freelancer_id_fkey';
            columns: ['freelancer_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projects_source_project_id_fkey';
            columns: ['source_project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      proposals: {
        Row: {
          cover_note: string;
          created_at: string;
          decided_at: string | null;
          freelancer_id: string;
          id: string;
          milestone_edits: Json | null;
          project_id: string;
          proposed_total_paise: number;
          rejection_reason: string | null;
          status: Database['public']['Enums']['proposal_status'];
          timeline_days: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cover_note: string;
          created_at?: string;
          decided_at?: string | null;
          freelancer_id: string;
          id?: string;
          milestone_edits?: Json | null;
          project_id: string;
          proposed_total_paise: number;
          rejection_reason?: string | null;
          status?: Database['public']['Enums']['proposal_status'];
          timeline_days: number;
          updated_at?: string;
        };
        Update: {
          cover_note?: string;
          created_at?: string;
          decided_at?: string | null;
          freelancer_id?: string;
          id?: string;
          milestone_edits?: Json | null;
          project_id?: string;
          proposed_total_paise?: number;
          rejection_reason?: string | null;
          status?: Database['public']['Enums']['proposal_status'];
          timeline_days?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'proposals_freelancer_id_fkey';
            columns: ['freelancer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'proposals_freelancer_id_fkey';
            columns: ['freelancer_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'proposals_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      push_tokens: {
        Row: {
          created_at: string;
          id: string;
          platform: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          platform: string;
          token: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          platform?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      skills: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          name: string;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          category: string;
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      submissions: {
        Row: {
          attachment_paths: string[];
          created_at: string;
          id: string;
          links: string[];
          milestone_id: string;
          note: string | null;
          submitted_by: string;
        };
        ComputedFields: never;
        Insert: {
          attachment_paths?: string[];
          created_at?: string;
          id?: string;
          links?: string[];
          milestone_id: string;
          note?: string | null;
          submitted_by: string;
        };
        Update: {
          attachment_paths?: string[];
          created_at?: string;
          id?: string;
          links?: string[];
          milestone_id?: string;
          note?: string | null;
          submitted_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'submissions_milestone_id_fkey';
            columns: ['milestone_id'];
            isOneToOne: false;
            referencedRelation: 'milestones';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'submissions_submitted_by_fkey';
            columns: ['submitted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'submissions_submitted_by_fkey';
            columns: ['submitted_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          role: Database['public']['Enums']['app_role'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          role: Database['public']['Enums']['app_role'];
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database['public']['Enums']['app_role'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      public_profiles: {
        Row: {
          availability: Database['public']['Enums']['availability_status'];
          avatar_path: string | null;
          bio: string | null;
          city: string | null;
          created_at: string;
          email_verified: boolean;
          full_name: string | null;
          headline: string | null;
          hourly_rate_paise: number | null;
          id: string;
          kyc_verified: boolean;
          languages: string[];
          onboarding_completed_at: string | null;
          phone_verified: boolean;
          portfolio_verified: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          availability?: Database['public']['Enums']['availability_status'] | null;
          avatar_path?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string | null;
          email_verified?: boolean | null;
          full_name?: string | null;
          headline?: string | null;
          hourly_rate_paise?: number | null;
          id?: string | null;
          kyc_verified?: boolean | null;
          languages?: string[] | null;
          onboarding_completed_at?: string | null;
          phone_verified?: boolean | null;
          portfolio_verified?: boolean | null;
          updated_at?: string | null;
        };
        Update: {
          availability?: Database['public']['Enums']['availability_status'] | null;
          avatar_path?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string | null;
          email_verified?: boolean | null;
          full_name?: string | null;
          headline?: string | null;
          hourly_rate_paise?: number | null;
          id?: string | null;
          kyc_verified?: boolean | null;
          languages?: string[] | null;
          onboarding_completed_at?: string | null;
          phone_verified?: boolean | null;
          portfolio_verified?: boolean | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      _clean_text: {
        Args: {
          p_field: string;
          p_max: number;
          p_min: number;
          p_required?: boolean;
          p_value: string;
        };
        Returns: string;
      };
      _expire_project_invites: { Args: Record<PropertyKey, never>; Returns: number };
      _json_bigint: {
        Args: {
          p_field: string;
          p_max: number;
          p_min: number;
          p_required?: boolean;
          p_value: Json;
        };
        Returns: number;
      };
      _json_bool: {
        Args: { p_default: boolean; p_field: string; p_value: Json };
        Returns: boolean;
      };
      _json_date: { Args: { p_field: string; p_value: Json }; Returns: string };
      _json_uuid_array: {
        Args: { p_field: string; p_max: number; p_value: Json };
        Returns: string[];
      };
      _lock_milestone: {
        Args: { p_milestone_id: string };
        Returns: {
          acceptance_criteria: string;
          amount_paise: number;
          approved_at: string | null;
          created_at: string;
          deliverable: string;
          due_date: string;
          id: string;
          position: number;
          project_id: string;
          released_at: string | null;
          revision_count: number;
          started_at: string | null;
          status: Database['public']['Enums']['milestone_status'];
          submitted_at: string | null;
          title: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'milestones';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      _parse_milestone_plan: {
        Args: { p_full: boolean; p_items: Json };
        Returns: {
          acceptance_criteria: string;
          amount_paise: number;
          deliverable: string;
          due_date: string;
          pos: number;
          title: string;
        }[];
      };
      _search_pattern: { Args: { p_query: string }; Returns: string };
      _transition_milestone: {
        Args: {
          p_actor_id: string;
          p_actor_kind: Database['public']['Enums']['milestone_actor_kind'];
          p_milestone_id: string;
          p_note?: string;
          p_to: Database['public']['Enums']['milestone_status'];
        };
        Returns: undefined;
      };
      can_access_project_file: { Args: { p_name: string; p_write: boolean }; Returns: boolean };
      can_view_milestone_activity: { Args: { p_milestone_id: string }; Returns: boolean };
      can_view_project: { Args: { p_project_id: string }; Returns: boolean };
      get_profile_private: {
        Args: { p_user_id?: string };
        Returns: Database['public']['CompositeTypes']['profile_private'][];
        SetofOptions: {
          from: '*';
          to: 'profile_private';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      has_project_invite: { Args: { p_project_id: string }; Returns: boolean };
      has_role: { Args: { p_role: Database['public']['Enums']['app_role'] }; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_project_client: { Args: { p_project_id: string }; Returns: boolean };
      is_project_member: { Args: { p_project_id: string }; Returns: boolean };
      milestone_cap_pct: { Args: { p_count: number }; Returns: number };
      my_roles: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Enums']['app_role'][];
      };
      my_verified_phone: { Args: Record<PropertyKey, never>; Returns: string };
      rpc_accept_proposal: {
        Args: { p_apply_milestone_edits: boolean; p_proposal_id: string };
        Returns: undefined;
      };
      rpc_admin_flag_user: {
        Args: { p_flagged: boolean; p_reason: string; p_user_id: string };
        Returns: undefined;
      };
      rpc_admin_review_kyc: {
        Args: { p_approve: boolean; p_kyc_id: string; p_reason?: string };
        Returns: Database['public']['Enums']['kyc_status'];
      };
      rpc_admin_set_role: {
        Args: {
          p_grant: boolean;
          p_role: Database['public']['Enums']['app_role'];
          p_user_id: string;
        };
        Returns: Database['public']['Enums']['app_role'][];
      };
      rpc_approve_milestone: { Args: { p_milestone_id: string }; Returns: undefined };
      rpc_cancel_project: { Args: { p_project_id: string; p_reason: string }; Returns: undefined };
      rpc_complete_onboarding: { Args: Record<PropertyKey, never>; Returns: string };
      rpc_create_invite: {
        Args: { p_freelancer_id?: string; p_phone?: string; p_project_id: string };
        Returns: {
          invite_id: string;
          token: string;
        }[];
      };
      rpc_publish_project: { Args: { p_project_id: string }; Returns: undefined };
      rpc_register_push_token: { Args: { p_platform: string; p_token: string }; Returns: string };
      rpc_reject_proposal: {
        Args: { p_proposal_id: string; p_reason: string };
        Returns: undefined;
      };
      rpc_request_revision: {
        Args: { p_milestone_id: string; p_note: string };
        Returns: undefined;
      };
      rpc_resolve_invite: {
        Args: { p_token: string };
        Returns: {
          client_name: string;
          invite_id: string;
          project_id: string;
          project_title: string;
          status: Database['public']['Enums']['invite_status'];
        }[];
      };
      rpc_respond_invite: {
        Args: { p_accept?: boolean; p_invite_id?: string; p_token?: string };
        Returns: string;
      };
      rpc_revoke_invite: { Args: { p_invite_id: string }; Returns: undefined };
      rpc_save_project_draft: {
        Args: { p_milestones?: Json; p_project?: Json; p_project_id?: string };
        Returns: string;
      };
      rpc_search_freelancers: {
        Args: {
          p_city?: string;
          p_cursor?: string;
          p_limit?: number;
          p_query?: string;
          p_skill_ids?: string[];
        };
        Returns: {
          availability: Database['public']['Enums']['availability_status'];
          avatar_path: string;
          bio: string;
          city: string;
          created_at: string;
          email_verified: boolean;
          full_name: string;
          headline: string;
          hourly_rate_paise: number;
          id: string;
          kyc_verified: boolean;
          languages: string[];
          onboarding_completed_at: string;
          phone_verified: boolean;
          portfolio_verified: boolean;
          skill_ids: string[];
          updated_at: string;
        }[];
      };
      rpc_search_projects: {
        Args: {
          p_category?: string;
          p_city?: string;
          p_cursor?: string;
          p_limit?: number;
          p_max_paise?: number;
          p_min_paise?: number;
          p_query?: string;
          p_skill_ids?: string[];
          p_takeover_only?: boolean;
        };
        Returns: {
          category: string;
          checkin_cadence_days: number;
          city: string;
          client_city: string;
          client_id: string;
          client_name: string;
          created_at: string;
          deposit_required: boolean;
          description: string;
          id: string;
          is_remote: boolean;
          is_takeover: boolean;
          milestone_count: number;
          published_at: string;
          revision_limit: number;
          skill_ids: string[];
          source_project_id: string;
          status: Database['public']['Enums']['project_status'];
          title: string;
          total_paise: number;
          updated_at: string;
          visibility: Database['public']['Enums']['project_visibility'];
        }[];
      };
      rpc_set_my_roles: {
        Args: { p_roles: Database['public']['Enums']['app_role'][] };
        Returns: Database['public']['Enums']['app_role'][];
      };
      rpc_start_milestone: { Args: { p_milestone_id: string }; Returns: undefined };
      rpc_submit_milestone: {
        Args: {
          p_attachment_paths: string[];
          p_links: string[];
          p_milestone_id: string;
          p_note: string;
        };
        Returns: string;
      };
      rpc_submit_proposal: {
        Args: {
          p_cover_note: string;
          p_milestone_edits?: Json;
          p_project_id: string;
          p_proposed_total_paise: number;
          p_timeline_days: number;
        };
        Returns: string;
      };
      rpc_unregister_push_token: { Args: { p_token: string }; Returns: boolean };
      rpc_withdraw_proposal: { Args: { p_proposal_id: string }; Returns: undefined };
      text_array_items_between: {
        Args: { p_items: string[]; p_max: number; p_min: number };
        Returns: boolean;
      };
      validate_milestone_plan: {
        Args: { p_amounts: number[]; p_due_dates: string[] };
        Returns: string;
      };
      write_audit: {
        Args: { p_action: string; p_data?: Json; p_entity_id: string; p_entity_type: string };
        Returns: string;
      };
    };
    Enums: {
      app_role: 'client' | 'freelancer' | 'admin';
      availability_status: 'available' | 'busy' | 'unavailable';
      invite_status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
      kyc_doc_type: 'pan' | 'aadhaar';
      kyc_status: 'pending' | 'approved' | 'rejected';
      milestone_actor_kind: 'client' | 'freelancer' | 'system' | 'admin';
      milestone_status:
        | 'draft'
        | 'funded'
        | 'in_progress'
        | 'submitted'
        | 'revision_requested'
        | 'approved'
        | 'released'
        | 'disputed'
        | 'refunded'
        | 'partially_released'
        | 'abandoned'
        | 'reassigned';
      portfolio_kind: 'link' | 'file' | 'image';
      project_member_role: 'client' | 'freelancer';
      project_status: 'draft' | 'open' | 'awarded' | 'in_progress' | 'completed' | 'cancelled';
      project_visibility: 'public' | 'invite_only';
      proposal_status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
    };
    CompositeTypes: {
      profile_private: {
        id: string | null;
        phone: string | null;
        email: string | null;
        is_flagged: boolean | null;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ['client', 'freelancer', 'admin'],
      availability_status: ['available', 'busy', 'unavailable'],
      invite_status: ['pending', 'accepted', 'declined', 'revoked', 'expired'],
      kyc_doc_type: ['pan', 'aadhaar'],
      kyc_status: ['pending', 'approved', 'rejected'],
      milestone_actor_kind: ['client', 'freelancer', 'system', 'admin'],
      milestone_status: [
        'draft',
        'funded',
        'in_progress',
        'submitted',
        'revision_requested',
        'approved',
        'released',
        'disputed',
        'refunded',
        'partially_released',
        'abandoned',
        'reassigned',
      ],
      portfolio_kind: ['link', 'file', 'image'],
      project_member_role: ['client', 'freelancer'],
      project_status: ['draft', 'open', 'awarded', 'in_progress', 'completed', 'cancelled'],
      project_visibility: ['public', 'invite_only'],
      proposal_status: ['pending', 'accepted', 'rejected', 'withdrawn'],
    },
  },
} as const;
