import SwiftUI

struct ForgotPasswordView: View {
    @Bindable var viewModel: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text("Reset Password")
                    .font(.title.bold())
                    .foregroundStyle(Color.sp.ink)

                Text("Enter your email address and we'll send you a link to reset your password.")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
                    .multilineTextAlignment(.center)

                TextField("Email", text: $viewModel.email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .padding()
                    .background(Color.sp.snow)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
                    .overlay(
                        RoundedRectangle(cornerRadius: SPDesign.Radius.sm)
                            .strokeBorder(Color.sp.silver, lineWidth: AppDesign.Border.thin)
                    )
                    .accessibilityLabel("Email address")

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.red)
                }

                Button {
                    Task { await viewModel.resetPassword() }
                } label: {
                    Group {
                        if viewModel.isLoading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Send Reset Link")
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.sp.primary)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
                    .font(SPTypography.cardTitle)
                }
                .disabled(viewModel.isLoading)
                .accessibilityLabel("Send password reset link")

                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)
            .background(Color.sp.surface)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Color.sp.primary)
                }
            }
            .alert("Check your email", isPresented: $viewModel.showResetPasswordSuccess) {
                Button("OK") { dismiss() }
            } message: {
                Text("We've sent a password reset link to your email address.")
            }
        }
    }
}
