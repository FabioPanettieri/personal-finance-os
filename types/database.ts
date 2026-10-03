// File GENERATO da `npm run db:types` (supabase gen types typescript --local). Non modificare a mano.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      account_types: {
        Row: {
          code: string
          is_investment: boolean
          is_liquid: boolean
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          is_investment: boolean
          is_liquid: boolean
          label: string
          sort_order?: number
        }
        Update: {
          code?: string
          is_investment?: boolean
          is_liquid?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      accounts: {
        Row: {
          account_type: string
          color: string | null
          created_at: string
          currency: string
          default_bank_profile: Database['public']['Enums']['bank_profile'] | null
          icon: string | null
          id: string
          initial_balance_cents: number
          initial_balance_on: string | null
          institution: string | null
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type: string
          color?: string | null
          created_at?: string
          currency?: string
          default_bank_profile?: Database['public']['Enums']['bank_profile'] | null
          icon?: string | null
          id?: string
          initial_balance_cents?: number
          initial_balance_on?: string | null
          institution?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_type?: string
          color?: string | null
          created_at?: string
          currency?: string
          default_bank_profile?: Database['public']['Enums']['bank_profile'] | null
          icon?: string | null
          id?: string
          initial_balance_cents?: number
          initial_balance_on?: string | null
          institution?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'accounts_account_type_fkey'
            columns: ['account_type']
            isOneToOne: false
            referencedRelation: 'account_types'
            referencedColumns: ['code']
          },
        ]
      }
      audit_logs: {
        Row: {
          action: Database['public']['Enums']['audit_action']
          changed_fields: string[] | null
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string
        }
        Insert: {
          action: Database['public']['Enums']['audit_action']
          changed_fields?: string[] | null
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id: string
        }
        Update: {
          action?: Database['public']['Enums']['audit_action']
          changed_fields?: string[] | null
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string
        }
        Relationships: []
      }
      budget_categories: {
        Row: {
          amount_cents: number
          budget_id: string
          category_id: string
          id: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          budget_id: string
          category_id: string
          id?: string
          user_id?: string
        }
        Update: {
          amount_cents?: number
          budget_id?: string
          category_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'budget_categories_budget_id_user_id_fkey'
            columns: ['budget_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'budgets'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'budget_categories_category_id_user_id_fkey'
            columns: ['category_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'transaction_categories'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      budgets: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          is_active: boolean
          name: string
          period: Database['public']['Enums']['budget_period']
          starts_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          is_active?: boolean
          name: string
          period?: Database['public']['Enums']['budget_period']
          starts_on: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          is_active?: boolean
          name?: string
          period?: Database['public']['Enums']['budget_period']
          starts_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categorization_rules: {
        Row: {
          account_id: string | null
          amount_max_cents: number | null
          amount_min_cents: number | null
          confidence: number
          created_at: string
          direction: string
          hit_count: number
          id: string
          is_active: boolean
          last_matched_at: string | null
          match_field: string
          match_type: Database['public']['Enums']['rule_match_type']
          name: string
          origin: Database['public']['Enums']['rule_origin']
          pattern: string
          priority: number
          set_business_id: string | null
          set_category_id: string | null
          set_income_source_id: string | null
          set_nature: Database['public']['Enums']['transaction_nature'] | null
          set_type: Database['public']['Enums']['transaction_type'] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount_max_cents?: number | null
          amount_min_cents?: number | null
          confidence?: number
          created_at?: string
          direction?: string
          hit_count?: number
          id?: string
          is_active?: boolean
          last_matched_at?: string | null
          match_field?: string
          match_type?: Database['public']['Enums']['rule_match_type']
          name: string
          origin?: Database['public']['Enums']['rule_origin']
          pattern: string
          priority?: number
          set_business_id?: string | null
          set_category_id?: string | null
          set_income_source_id?: string | null
          set_nature?: Database['public']['Enums']['transaction_nature'] | null
          set_type?: Database['public']['Enums']['transaction_type'] | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          amount_max_cents?: number | null
          amount_min_cents?: number | null
          confidence?: number
          created_at?: string
          direction?: string
          hit_count?: number
          id?: string
          is_active?: boolean
          last_matched_at?: string | null
          match_field?: string
          match_type?: Database['public']['Enums']['rule_match_type']
          name?: string
          origin?: Database['public']['Enums']['rule_origin']
          pattern?: string
          priority?: number
          set_business_id?: string | null
          set_category_id?: string | null
          set_income_source_id?: string | null
          set_nature?: Database['public']['Enums']['transaction_nature'] | null
          set_type?: Database['public']['Enums']['transaction_type'] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'categorization_rules_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'account_balances'
            referencedColumns: ['account_id', 'user_id']
          },
          {
            foreignKeyName: 'categorization_rules_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'categorization_rules_set_business_id_user_id_fkey'
            columns: ['set_business_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'categorization_rules_set_category_id_user_id_fkey'
            columns: ['set_category_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'transaction_categories'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'categorization_rules_set_income_source_id_user_id_fkey'
            columns: ['set_income_source_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'income_sources'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      goal_accounts: {
        Row: {
          account_id: string
          goal_id: string
          share_bps: number
          user_id: string
        }
        Insert: {
          account_id: string
          goal_id: string
          share_bps?: number
          user_id?: string
        }
        Update: {
          account_id?: string
          goal_id?: string
          share_bps?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'goal_accounts_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'account_balances'
            referencedColumns: ['account_id', 'user_id']
          },
          {
            foreignKeyName: 'goal_accounts_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'goal_accounts_goal_id_user_id_fkey'
            columns: ['goal_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'goals'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      goals: {
        Row: {
          achieved_at: string | null
          color: string | null
          created_at: string
          current_amount_cents: number
          deadline: string | null
          icon: string | null
          id: string
          is_archived: boolean
          name: string
          sort_order: number
          target_amount_cents: number
          tracking: Database['public']['Enums']['goal_tracking']
          updated_at: string
          user_id: string
        }
        Insert: {
          achieved_at?: string | null
          color?: string | null
          created_at?: string
          current_amount_cents?: number
          deadline?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          name: string
          sort_order?: number
          target_amount_cents: number
          tracking?: Database['public']['Enums']['goal_tracking']
          updated_at?: string
          user_id?: string
        }
        Update: {
          achieved_at?: string | null
          color?: string | null
          created_at?: string
          current_amount_cents?: number
          deadline?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          sort_order?: number
          target_amount_cents?: number
          tracking?: Database['public']['Enums']['goal_tracking']
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_files: {
        Row: {
          created_at: string
          detected_delimiter: string | null
          detected_encoding: string | null
          header: Json | null
          id: string
          import_id: string
          original_filename: string
          sha256: string
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detected_delimiter?: string | null
          detected_encoding?: string | null
          header?: Json | null
          id?: string
          import_id: string
          original_filename: string
          sha256: string
          size_bytes: number
          storage_path: string
          user_id?: string
        }
        Update: {
          created_at?: string
          detected_delimiter?: string | null
          detected_encoding?: string | null
          header?: Json | null
          id?: string
          import_id?: string
          original_filename?: string
          sha256?: string
          size_bytes?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'import_files_import_id_user_id_fkey'
            columns: ['import_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'imports'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      import_profiles: {
        Row: {
          amount_mode: string
          bank_profile: Database['public']['Enums']['bank_profile']
          column_map: NonNullable<Json>
          created_at: string
          date_format: string
          decimal_separator: string
          delimiter: string | null
          encoding: string
          has_header: boolean
          id: string
          is_default: boolean
          name: string
          skip_rows: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_mode?: string
          bank_profile: Database['public']['Enums']['bank_profile']
          column_map: NonNullable<Json>
          created_at?: string
          date_format: string
          decimal_separator?: string
          delimiter?: string | null
          encoding?: string
          has_header?: boolean
          id?: string
          is_default?: boolean
          name: string
          skip_rows?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount_mode?: string
          bank_profile?: Database['public']['Enums']['bank_profile']
          column_map?: NonNullable<Json>
          created_at?: string
          date_format?: string
          decimal_separator?: string
          delimiter?: string | null
          encoding?: string
          has_header?: boolean
          id?: string
          is_default?: boolean
          name?: string
          skip_rows?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_rows: {
        Row: {
          amount_cents: number | null
          booked_on: string | null
          categorization_confidence: number | null
          categorization_method: Database['public']['Enums']['categorization_method']
          categorization_rule_id: string | null
          counterparty: string | null
          created_at: string
          currency: string | null
          description: string | null
          duplicate_of_transaction_id: string | null
          errors: NonNullable<Json>
          fingerprint: string | null
          id: string
          import_id: string
          proposed_business_id: string | null
          proposed_category_id: string | null
          proposed_income_source_id: string | null
          proposed_nature: Database['public']['Enums']['transaction_nature'] | null
          proposed_type: Database['public']['Enums']['transaction_type'] | null
          raw: NonNullable<Json>
          row_index: number
          status: Database['public']['Enums']['import_row_status']
          transaction_id: string | null
          transfer_candidate_id: string | null
          updated_at: string
          user_id: string
          value_on: string | null
        }
        Insert: {
          amount_cents?: number | null
          booked_on?: string | null
          categorization_confidence?: number | null
          categorization_method?: Database['public']['Enums']['categorization_method']
          categorization_rule_id?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          duplicate_of_transaction_id?: string | null
          errors?: NonNullable<Json>
          fingerprint?: string | null
          id?: string
          import_id: string
          proposed_business_id?: string | null
          proposed_category_id?: string | null
          proposed_income_source_id?: string | null
          proposed_nature?: Database['public']['Enums']['transaction_nature'] | null
          proposed_type?: Database['public']['Enums']['transaction_type'] | null
          raw: NonNullable<Json>
          row_index: number
          status?: Database['public']['Enums']['import_row_status']
          transaction_id?: string | null
          transfer_candidate_id?: string | null
          updated_at?: string
          user_id?: string
          value_on?: string | null
        }
        Update: {
          amount_cents?: number | null
          booked_on?: string | null
          categorization_confidence?: number | null
          categorization_method?: Database['public']['Enums']['categorization_method']
          categorization_rule_id?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          duplicate_of_transaction_id?: string | null
          errors?: NonNullable<Json>
          fingerprint?: string | null
          id?: string
          import_id?: string
          proposed_business_id?: string | null
          proposed_category_id?: string | null
          proposed_income_source_id?: string | null
          proposed_nature?: Database['public']['Enums']['transaction_nature'] | null
          proposed_type?: Database['public']['Enums']['transaction_type'] | null
          raw?: NonNullable<Json>
          row_index?: number
          status?: Database['public']['Enums']['import_row_status']
          transaction_id?: string | null
          transfer_candidate_id?: string | null
          updated_at?: string
          user_id?: string
          value_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'import_rows_categorization_rule_id_user_id_fkey'
            columns: ['categorization_rule_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'categorization_rules'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'import_rows_duplicate_of_transaction_id_user_id_fkey'
            columns: ['duplicate_of_transaction_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'transactions'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'import_rows_import_id_user_id_fkey'
            columns: ['import_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'imports'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'import_rows_proposed_business_id_user_id_fkey'
            columns: ['proposed_business_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'import_rows_proposed_category_id_user_id_fkey'
            columns: ['proposed_category_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'transaction_categories'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'import_rows_proposed_income_source_id_user_id_fkey'
            columns: ['proposed_income_source_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'income_sources'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'import_rows_transaction_id_user_id_fkey'
            columns: ['transaction_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'transactions'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'import_rows_transfer_candidate_id_user_id_fkey'
            columns: ['transfer_candidate_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'transactions'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      imports: {
        Row: {
          account_id: string
          bank_profile: Database['public']['Enums']['bank_profile']
          committed_at: string | null
          created_at: string
          error_message: string | null
          expense_cents: number
          id: string
          import_profile_id: string | null
          income_cents: number
          period_end: string | null
          period_start: string | null
          rows_duplicate: number
          rows_imported: number
          rows_invalid: number
          rows_new: number
          rows_possible_duplicate: number
          rows_total: number
          status: Database['public']['Enums']['import_status']
          transfer_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          bank_profile: Database['public']['Enums']['bank_profile']
          committed_at?: string | null
          created_at?: string
          error_message?: string | null
          expense_cents?: number
          id?: string
          import_profile_id?: string | null
          income_cents?: number
          period_end?: string | null
          period_start?: string | null
          rows_duplicate?: number
          rows_imported?: number
          rows_invalid?: number
          rows_new?: number
          rows_possible_duplicate?: number
          rows_total?: number
          status?: Database['public']['Enums']['import_status']
          transfer_cents?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string
          bank_profile?: Database['public']['Enums']['bank_profile']
          committed_at?: string | null
          created_at?: string
          error_message?: string | null
          expense_cents?: number
          id?: string
          import_profile_id?: string | null
          income_cents?: number
          period_end?: string | null
          period_start?: string | null
          rows_duplicate?: number
          rows_imported?: number
          rows_invalid?: number
          rows_new?: number
          rows_possible_duplicate?: number
          rows_total?: number
          status?: Database['public']['Enums']['import_status']
          transfer_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'imports_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'account_balances'
            referencedColumns: ['account_id', 'user_id']
          },
          {
            foreignKeyName: 'imports_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'imports_import_profile_id_user_id_fkey'
            columns: ['import_profile_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'import_profiles'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      income_sources: {
        Row: {
          business_id: string | null
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          business_id?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'income_sources_business_id_user_id_fkey'
            columns: ['business_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      instruments: {
        Row: {
          asset_class: string
          created_at: string
          currency: string
          id: string
          isin: string | null
          name: string
          symbol: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_class?: string
          created_at?: string
          currency?: string
          id?: string
          isin?: string | null
          name: string
          symbol?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          asset_class?: string
          created_at?: string
          currency?: string
          id?: string
          isin?: string | null
          name?: string
          symbol?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      investment_accounts: {
        Row: {
          account_id: string
          broker: string | null
          created_at: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          broker?: string | null
          created_at?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string
          broker?: string | null
          created_at?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'investment_accounts_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: true
            referencedRelation: 'account_balances'
            referencedColumns: ['account_id', 'user_id']
          },
          {
            foreignKeyName: 'investment_accounts_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: true
            referencedRelation: 'accounts'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      investment_plans: {
        Row: {
          account_id: string
          amount_cents: number
          created_at: string
          day_of_month: number | null
          ends_on: string | null
          frequency: string
          id: string
          instrument_id: string | null
          is_active: boolean
          name: string
          starts_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          created_at?: string
          day_of_month?: number | null
          ends_on?: string | null
          frequency?: string
          id?: string
          instrument_id?: string | null
          is_active?: boolean
          name: string
          starts_on: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          created_at?: string
          day_of_month?: number | null
          ends_on?: string | null
          frequency?: string
          id?: string
          instrument_id?: string | null
          is_active?: boolean
          name?: string
          starts_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'investment_plans_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'investment_accounts'
            referencedColumns: ['account_id', 'user_id']
          },
          {
            foreignKeyName: 'investment_plans_instrument_id_user_id_fkey'
            columns: ['instrument_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'instruments'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      investment_transactions: {
        Row: {
          account_id: string
          amount_cents: number
          cash_transaction_id: string | null
          created_at: string
          description: string | null
          fees_cents: number
          fingerprint: string
          id: string
          import_id: string | null
          instrument_id: string | null
          kind: Database['public']['Enums']['investment_tx_kind']
          original_description: string | null
          plan_id: string | null
          price: number | null
          price_currency: string | null
          quantity: number | null
          source: Database['public']['Enums']['transaction_source']
          taxes_cents: number
          trade_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          cash_transaction_id?: string | null
          created_at?: string
          description?: string | null
          fees_cents?: number
          fingerprint: string
          id?: string
          import_id?: string | null
          instrument_id?: string | null
          kind: Database['public']['Enums']['investment_tx_kind']
          original_description?: string | null
          plan_id?: string | null
          price?: number | null
          price_currency?: string | null
          quantity?: number | null
          source?: Database['public']['Enums']['transaction_source']
          taxes_cents?: number
          trade_on: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          cash_transaction_id?: string | null
          created_at?: string
          description?: string | null
          fees_cents?: number
          fingerprint?: string
          id?: string
          import_id?: string | null
          instrument_id?: string | null
          kind?: Database['public']['Enums']['investment_tx_kind']
          original_description?: string | null
          plan_id?: string | null
          price?: number | null
          price_currency?: string | null
          quantity?: number | null
          source?: Database['public']['Enums']['transaction_source']
          taxes_cents?: number
          trade_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'investment_transactions_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'investment_accounts'
            referencedColumns: ['account_id', 'user_id']
          },
          {
            foreignKeyName: 'investment_transactions_cash_transaction_id_user_id_fkey'
            columns: ['cash_transaction_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'transactions'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'investment_transactions_import_id_user_id_fkey'
            columns: ['import_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'imports'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'investment_transactions_instrument_id_user_id_fkey'
            columns: ['instrument_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'instruments'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'investment_transactions_plan_id_user_id_fkey'
            columns: ['plan_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'investment_plans'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      investment_valuations: {
        Row: {
          account_id: string
          created_at: string
          id: string
          instrument_id: string | null
          market_value_cents: number
          source: string
          user_id: string
          valued_on: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          instrument_id?: string | null
          market_value_cents: number
          source?: string
          user_id?: string
          valued_on: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          instrument_id?: string | null
          market_value_cents?: number
          source?: string
          user_id?: string
          valued_on?: string
        }
        Relationships: [
          {
            foreignKeyName: 'investment_valuations_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'investment_accounts'
            referencedColumns: ['account_id', 'user_id']
          },
          {
            foreignKeyName: 'investment_valuations_instrument_id_user_id_fkey'
            columns: ['instrument_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'instruments'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      monthly_snapshots: {
        Row: {
          computed_at: string
          expense_cents: number
          income_cents: number
          invested_cents: number
          month: string
          net_savings_cents: number
          net_worth_cents: number | null
          user_id: string
        }
        Insert: {
          computed_at?: string
          expense_cents: number
          income_cents: number
          invested_cents: number
          month: string
          net_savings_cents: number
          net_worth_cents?: number | null
          user_id?: string
        }
        Update: {
          computed_at?: string
          expense_cents?: number
          income_cents?: number
          invested_cents?: number
          month?: string
          net_savings_cents?: number
          net_worth_cents?: number | null
          user_id?: string
        }
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          breakdown: NonNullable<Json>
          created_at: string
          id: string
          invested_cents: number
          liquid_cents: number
          snapshot_on: string
          source: string
          total_cents: number
          user_id: string
        }
        Insert: {
          breakdown?: NonNullable<Json>
          created_at?: string
          id?: string
          invested_cents: number
          liquid_cents: number
          snapshot_on: string
          source?: string
          total_cents: number
          user_id?: string
        }
        Update: {
          breakdown?: NonNullable<Json>
          created_at?: string
          id?: string
          invested_cents?: number
          liquid_cents?: number
          snapshot_on?: string
          source?: string
          total_cents?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_categorization_enabled: boolean
          base_currency: string
          created_at: string
          display_name: string | null
          id: string
          locale: string
          theme: string
          timezone: string
          updated_at: string
          week_starts_on: number
        }
        Insert: {
          ai_categorization_enabled?: boolean
          base_currency?: string
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
          theme?: string
          timezone?: string
          updated_at?: string
          week_starts_on?: number
        }
        Update: {
          ai_categorization_enabled?: boolean
          base_currency?: string
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
          theme?: string
          timezone?: string
          updated_at?: string
          week_starts_on?: number
        }
        Relationships: []
      }
      transaction_categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          is_system: boolean
          kind: Database['public']['Enums']['category_kind']
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          kind: Database['public']['Enums']['category_kind']
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          kind?: Database['public']['Enums']['category_kind']
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'transaction_categories_parent_id_user_id_fkey'
            columns: ['parent_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'transaction_categories'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount_cents: number
          booked_on: string
          business_id: string | null
          categorization_confidence: number | null
          categorization_method: Database['public']['Enums']['categorization_method']
          categorization_rule_id: string | null
          category_id: string | null
          counterparty: string | null
          created_at: string
          currency: string
          description: string
          fingerprint: string
          id: string
          import_id: string | null
          income_source_id: string | null
          is_categorized: boolean
          is_transfer: boolean | null
          nature: Database['public']['Enums']['transaction_nature']
          notes: string | null
          original_amount_cents: number | null
          original_currency: string | null
          original_description: string
          source: Database['public']['Enums']['transaction_source']
          transfer_group_id: string | null
          type: Database['public']['Enums']['transaction_type']
          updated_at: string
          user_id: string
          value_on: string | null
        }
        Insert: {
          account_id: string
          amount_cents: number
          booked_on: string
          business_id?: string | null
          categorization_confidence?: number | null
          categorization_method?: Database['public']['Enums']['categorization_method']
          categorization_rule_id?: string | null
          category_id?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string
          description: string
          fingerprint: string
          id?: string
          import_id?: string | null
          income_source_id?: string | null
          is_categorized?: boolean
          is_transfer?: never
          nature: Database['public']['Enums']['transaction_nature']
          notes?: string | null
          original_amount_cents?: number | null
          original_currency?: string | null
          original_description: string
          source?: Database['public']['Enums']['transaction_source']
          transfer_group_id?: string | null
          type: Database['public']['Enums']['transaction_type']
          updated_at?: string
          user_id?: string
          value_on?: string | null
        }
        Update: {
          account_id?: string
          amount_cents?: number
          booked_on?: string
          business_id?: string | null
          categorization_confidence?: number | null
          categorization_method?: Database['public']['Enums']['categorization_method']
          categorization_rule_id?: string | null
          category_id?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string
          description?: string
          fingerprint?: string
          id?: string
          import_id?: string | null
          income_source_id?: string | null
          is_categorized?: boolean
          is_transfer?: never
          nature?: Database['public']['Enums']['transaction_nature']
          notes?: string | null
          original_amount_cents?: number | null
          original_currency?: string | null
          original_description?: string
          source?: Database['public']['Enums']['transaction_source']
          transfer_group_id?: string | null
          type?: Database['public']['Enums']['transaction_type']
          updated_at?: string
          user_id?: string
          value_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'transactions_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'account_balances'
            referencedColumns: ['account_id', 'user_id']
          },
          {
            foreignKeyName: 'transactions_account_id_user_id_fkey'
            columns: ['account_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'transactions_business_id_user_id_fkey'
            columns: ['business_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'transactions_categorization_rule_id_user_id_fkey'
            columns: ['categorization_rule_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'categorization_rules'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'transactions_category_id_user_id_fkey'
            columns: ['category_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'transaction_categories'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'transactions_import_id_user_id_fkey'
            columns: ['import_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'imports'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'transactions_income_source_id_user_id_fkey'
            columns: ['income_source_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'income_sources'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'transactions_transfer_group_id_user_id_fkey'
            columns: ['transfer_group_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'transfer_groups'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      transfer_groups: {
        Row: {
          confidence: number | null
          created_at: string
          detected_by: string
          id: string
          kind: Database['public']['Enums']['transfer_kind']
          note: string | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          detected_by: string
          id?: string
          kind: Database['public']['Enums']['transfer_kind']
          note?: string | null
          user_id?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          detected_by?: string
          id?: string
          kind?: Database['public']['Enums']['transfer_kind']
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      yearly_snapshots: {
        Row: {
          computed_at: string
          expense_cents: number
          income_cents: number
          invested_cents: number
          net_savings_cents: number
          net_worth_cents: number | null
          user_id: string
          year: number
        }
        Insert: {
          computed_at?: string
          expense_cents: number
          income_cents: number
          invested_cents: number
          net_savings_cents: number
          net_worth_cents?: number | null
          user_id?: string
          year: number
        }
        Update: {
          computed_at?: string
          expense_cents?: number
          income_cents?: number
          invested_cents?: number
          net_savings_cents?: number
          net_worth_cents?: number | null
          user_id?: string
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          balance_cents: number | null
          currency: string | null
          last_transaction_on: string | null
          transaction_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      seed_default_data: { Args: { p_user_id: string }; Returns: undefined }
    }
    Enums: {
      audit_action: 'insert' | 'update' | 'delete'
      bank_profile: 'ing' | 'revolut' | 'trade_republic' | 'generic'
      budget_period: 'monthly' | 'yearly'
      categorization_method: 'none' | 'rule' | 'learned' | 'ai' | 'manual'
      category_kind: 'income' | 'expense' | 'transfer' | 'investment'
      goal_tracking: 'manual' | 'linked_accounts'
      import_row_status: 'new' | 'duplicate' | 'possible_duplicate' | 'invalid' | 'skipped' | 'imported'
      import_status: 'pending' | 'preview' | 'committed' | 'failed' | 'cancelled' | 'rolled_back'
      investment_tx_kind: 'buy' | 'sell' | 'dividend' | 'interest' | 'fee' | 'tax' | 'deposit' | 'withdrawal'
      rule_match_type: 'contains' | 'equals' | 'starts_with' | 'regex'
      rule_origin: 'system' | 'user' | 'learned'
      transaction_nature: 'personal' | 'business' | 'investment' | 'transfer'
      transaction_source: 'csv_import' | 'manual'
      transaction_type: 'income' | 'expense' | 'transfer' | 'investment' | 'refund'
      transfer_kind: 'internal' | 'investment'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_action: ['insert', 'update', 'delete'],
      bank_profile: ['ing', 'revolut', 'trade_republic', 'generic'],
      budget_period: ['monthly', 'yearly'],
      categorization_method: ['none', 'rule', 'learned', 'ai', 'manual'],
      category_kind: ['income', 'expense', 'transfer', 'investment'],
      goal_tracking: ['manual', 'linked_accounts'],
      import_row_status: ['new', 'duplicate', 'possible_duplicate', 'invalid', 'skipped', 'imported'],
      import_status: ['pending', 'preview', 'committed', 'failed', 'cancelled', 'rolled_back'],
      investment_tx_kind: ['buy', 'sell', 'dividend', 'interest', 'fee', 'tax', 'deposit', 'withdrawal'],
      rule_match_type: ['contains', 'equals', 'starts_with', 'regex'],
      rule_origin: ['system', 'user', 'learned'],
      transaction_nature: ['personal', 'business', 'investment', 'transfer'],
      transaction_source: ['csv_import', 'manual'],
      transaction_type: ['income', 'expense', 'transfer', 'investment', 'refund'],
      transfer_kind: ['internal', 'investment'],
    },
  },
} as const
