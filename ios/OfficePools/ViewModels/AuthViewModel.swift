import Foundation

/// View model for login and signup screens.
@MainActor
@Observable
final class AuthViewModel {
    var email = ""
    var password = ""
    var username = ""
    var fullName = ""
    var isLoading = false
    var errorMessage: String?
    var showResetPasswordSuccess = false

    private let authService: AuthService

    init(authService: AuthService) {
        self.authService = authService
    }

    func signIn() async {
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "Please fill in all fields."
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            try await authService.signIn(email: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func signUp() async {
        guard !email.isEmpty, !password.isEmpty, !username.isEmpty, !fullName.isEmpty else {
            errorMessage = "Please fill in all fields."
            return
        }

        guard password.count >= 6 else {
            errorMessage = "Password must be at least 6 characters."
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            try await authService.signUp(
                email: email,
                password: password,
                username: username,
                fullName: fullName
            )
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func resetPassword() async {
        guard !email.isEmpty else {
            errorMessage = "Please enter your email address."
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            try await authService.resetPassword(email: email)
            showResetPasswordSuccess = true
        } catch {
            print("[AuthViewModel] Password reset error: \(error)")
            errorMessage = "Error sending recovery email. Please try again."
        }

        isLoading = false
    }
}
