import Foundation
import Supabase

/// Central Supabase client — singleton shared across the app.
/// Configure your Supabase URL and anon key in Config.swift before running.
@MainActor
final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: URL(string: Config.supabaseURL)!,
            supabaseKey: Config.supabaseAnonKey
        )
    }
}
