import SwiftUI

struct LoginView: View {
    @Bindable var viewModel: AuthViewModel
    @State private var showSignUp = false
    @State private var showForgotPassword = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                // Logo / Title
                VStack(spacing: 8) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(Color.sp.primary)
                        .accessibilityHidden(true)

                    Text("Office Pools")
                        .font(.largeTitle.bold())
                        .foregroundStyle(Color.sp.ink)

                    Text("Predict. Compete. Win.")
                        .font(.subheadline)
                        .foregroundStyle(Color.sp.slate)
                }

                Spacer()

                // Form
                VStack(spacing: 16) {
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

                    SecureField("Password", text: $viewModel.password)
                        .textContentType(.password)
                        .padding()
                        .background(Color.sp.snow)
                        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: SPDesign.Radius.sm)
                                .strokeBorder(Color.sp.silver, lineWidth: AppDesign.Border.thin)
                        )
                        .accessibilityLabel("Password")

                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(SPTypography.detail)
                            .foregroundStyle(Color.sp.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        Task { await viewModel.signIn() }
                    } label: {
                        Group {
                            if viewModel.isLoading {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Text("Sign In")
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
                    .accessibilityLabel("Sign in")

                    Button("Forgot password?") {
                        showForgotPassword = true
                    }
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.primary)
                }

                Spacer()

                // Sign up link
                HStack {
                    Text("Don't have an account?")
                        .foregroundStyle(Color.sp.slate)
                    Button("Sign Up") {
                        showSignUp = true
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.sp.primary)
                }
                .font(SPTypography.body)
            }
            .padding(.horizontal, 24)
            .background(Color.sp.surface)
            .navigationDestination(isPresented: $showSignUp) {
                SignUpView(viewModel: viewModel)
            }
            .sheet(isPresented: $showForgotPassword) {
                ForgotPasswordView(viewModel: viewModel)
            }
        }
    }
}
