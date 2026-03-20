import SwiftUI

struct ProfileView: View {
    let authService: AuthService

    var body: some View {
        List {
            Section {
                if let user = authService.appUser {
                    HStack(spacing: 16) {
                        Image(systemName: "person.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.accent)

                        VStack(alignment: .leading, spacing: 4) {
                            Text(user.fullName)
                                .font(.headline)
                            Text("@\(user.username)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Text(user.email)
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .padding(.vertical, 8)
                }
            }

            Section("Account") {
                Button("Sign Out", role: .destructive) {
                    Task { try? await authService.signOut() }
                }
            }

            Section("About") {
                LabeledContent("Version", value: "1.0.0")
            }
        }
        .navigationTitle("Profile")
    }
}
