import Foundation
import Supabase

/// Central Supabase client — singleton shared across the app.
/// Configure your Supabase URL and anon key in Config.swift before running.
@MainActor
final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient

    private init() {
        guard let url = URL(string: Config.supabaseURL) else {
            fatalError("[SupabaseService] Invalid Supabase URL: \(Config.supabaseURL)")
        }
        client = SupabaseClient(
            supabaseURL: url,
            supabaseKey: Config.supabaseAnonKey
        )
    }
}
