import Foundation
import Supabase
import Auth

/// Manages authentication state and operations using Supabase Auth.
@MainActor
@Observable
final class AuthService {
    private let supabase = SupabaseService.shared.client

    var currentUser: Auth.User?
    var appUser: AppUser?
    var isAuthenticated = false
    var isLoading = true
    var errorMessage: String?

    init() {
        Task {
            await listenForAuthChanges()
        }
        // Safety timeout — if auth state never fires, stop loading after 5 seconds
        Task {
            try? await Task.sleep(for: .seconds(2))
            if isLoading {
                print("[AuthService] Timeout — no auth event received, stopping loading")
                isLoading = false
            }
        }
    }

    // MARK: - Auth State Listener

    private func listenForAuthChanges() async {
        print("[AuthService] Starting auth state listener...")
        for await (event, session) in supabase.auth.authStateChanges {
            print("[AuthService] Auth event: \(event)")
            switch event {
            case .initialSession:
                if let session {
                    print("[AuthService] Initial session found for user: \(session.user.email ?? "unknown")")
                    currentUser = session.user
                    isAuthenticated = true
                    await fetchAppUser()
                } else {
                    print("[AuthService] No initial session — user not logged in")
                }
                isLoading = false

            case .signedIn:
                currentUser = session?.user
                isAuthenticated = true
                await fetchAppUser()

            case .signedOut:
                currentUser = nil
                appUser = nil
                isAuthenticated = false

            default:
                break
            }
        }
    }

    // MARK: - Sign Up

    func signUp(email: String, password: String, username: String, fullName: String) async throws {
        errorMessage = nil

        // Check username availability
        let existing: [AppUser] = try await supabase
            .from("users")
            .select()
            .eq("username", value: username)
            .execute()
            .value

        if !existing.isEmpty {
            throw AuthError.usernameAlreadyTaken
        }

        let response = try await supabase.auth.signUp(
            email: email,
            password: password,
            data: [
                "username": .string(username),
                "full_name": .string(fullName)
            ]
        )

        currentUser = response.user
    }

    // MARK: - Sign In

    func signIn(email: String, password: String) async throws {
        errorMessage = nil

        let session = try await supabase.auth.signIn(
            email: email,
            password: password
        )

        currentUser = session.user
        isAuthenticated = true
        await fetchAppUser()
    }

    // MARK: - Sign Out

    func signOut() async throws {
        // Unregister push token before signing out (best-effort)
        await PushNotificationService.shared.unregisterToken()
        try await supabase.auth.signOut()
        currentUser = nil
        appUser = nil
        isAuthenticated = false
    }

    // MARK: - Password Reset

    func resetPassword(email: String) async throws {
        try await supabase.auth.resetPasswordForEmail(
            email,
            redirectTo: URL(string: "\(Config.apiBaseURL)/auth/callback?next=/reset-password")
        )
    }

    // MARK: - Fetch App User Profile

    private func fetchAppUser() async {
        guard let authUserId = currentUser?.id.uuidString else { return }

        do {
            let users: [AppUser] = try await supabase
                .from("users")
                .select()
                .eq("auth_user_id", value: authUserId)
                .limit(1)
                .execute()
                .value

            appUser = users.first
        } catch {
            print("Failed to fetch app user: \(error)")
        }
    }
}

// MARK: - Custom Errors

enum AuthError: LocalizedError {
    case usernameAlreadyTaken

    var errorDescription: String? {
        switch self {
        case .usernameAlreadyTaken:
            return "This username is already taken. Please choose another."
        }
    }
}
