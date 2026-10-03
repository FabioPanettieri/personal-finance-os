/**
 * Tipi del database per il client Supabase.
 *
 * Sottoinsieme scritto a mano delle sole tabelle usate finora, allineato a
 * supabase/migrations/20261003000001_schema.sql. Va sostituito integralmente
 * con l'output di `supabase gen types typescript` appena esiste un database
 * collegato (Sprint 2): non estenderlo a mano oltre lo stretto necessario.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          base_currency: string
          locale: string
          timezone: string
          week_starts_on: number
          theme: 'system' | 'light' | 'dark'
          ai_categorization_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: {
          display_name?: string | null
          base_currency?: string
          locale?: string
          timezone?: string
          week_starts_on?: number
          theme?: 'system' | 'light' | 'dark'
          ai_categorization_enabled?: boolean
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
