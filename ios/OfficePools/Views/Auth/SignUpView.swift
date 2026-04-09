import SwiftUI

struct SignUpView: View {
    @Bindable var viewModel: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 24) {
            Text("Create Account")
                .font(.title.bold())
                .foregroundStyle(Color.sp.ink)

            VStack(spacing: 16) {
                authField("Full Name", text: $viewModel.fullName, contentType: .name)
                    .accessibilityLabel("Full name")

                authField("Username", text: $viewModel.username, contentType: .username)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .accessibilityLabel("Username")

                authField("Email", text: $viewModel.email, contentType: .emailAddress)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .accessibilityLabel("Email address")

                SecureField("Password (min 6 characters)", text: $viewModel.password)
                    .textContentType(.newPassword)
                    .padding()
                    .background(Color.sp.snow)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
                    .overlay(
                        RoundedRectangle(cornerRadius: SPDesign.Radius.sm)
                            .strokeBorder(Color.sp.silver, lineWidth: AppDesign.Border.thin)
                    )
                    .accessibilityLabel("Password, minimum 6 characters")

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    Task { await viewModel.signUp() }
                } label: {
                    Group {
                        if viewModel.isLoading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Create Account")
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
                .accessibilityLabel("Create account")
            }

            Spacer()
        }
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .background(Color.sp.surface)
        .navigationBarBackButtonHidden(false)
    }

    private func authField(_ placeholder: String, text: Binding<String>, contentType: UITextContentType) -> some View {
        TextField(placeholder, text: text)
            .textContentType(contentType)
            .padding()
            .background(Color.sp.snow)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: SPDesign.Radius.sm)
                    .strokeBorder(Color.sp.silver, lineWidth: AppDesign.Border.thin)
            )
    }
}
