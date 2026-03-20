import Foundation

/// App configuration — stores Supabase credentials and API base URL.
///
/// IMPORTANT: Do not commit real values. Update locally after cloning.
enum Config {
    /// Your Supabase project URL (e.g. "https://xxxx.supabase.co")
    static let supabaseURL = "YOUR_SUPABASE_URL"

    /// Your Supabase anonymous/publishable key
    static let supabaseAnonKey = "YOUR_SUPABASE_ANON_KEY"

    /// Base URL for your Next.js API routes (for server-side endpoints not yet migrated)
    /// e.g. "https://your-app.vercel.app" or "http://localhost:3000" for dev
    static let apiBaseURL = "YOUR_API_BASE_URL"
}
