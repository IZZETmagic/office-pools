import SwiftUI
import UIKit

struct ProfileView: View {
    let authService: AuthService
    @Environment(AppDataStore.self) private var dataStore

    @State private var viewModel = ProfileViewModel()
    @State private var scrollOffset: CGFloat = 0
    @State private var sectionsAppeared = false
    @State private var ringsAnimated = false
    @State private var showSignOutAlert = false
    @AppStorage("sp_color_scheme") private var colorScheme: String = "system"

    var body: some View {
        VStack(spacing: 0) {
            headerSection

            ScrollView {
                VStack(spacing: 24) {
                    profileCard
                        .entranceAnimation(sectionsAppeared, delay: 0.0)

                    if viewModel.isLoading {
                        profileSkeletonStats
                            .transition(.opacity)
                    } else if viewModel.poolStats.isEmpty {
                        emptyStatsCard
                            .entranceAnimation(sectionsAppeared, delay: 0.05)
                            .transition(.opacity)
                    } else {
                        quickStatsRow
                            .entranceAnimation(sectionsAppeared, delay: 0.05)
                            .transition(.opacity)
                        ProfileStatsSection(
                            poolStats: viewModel.poolStats,
                            ringsAnimated: ringsAnimated
                        )
                        .entranceAnimation(sectionsAppeared, delay: 0.1)
                    }

                    accountSection
                        .entranceAnimation(sectionsAppeared, delay: 0.2)

                    securitySection
                        .entranceAnimation(sectionsAppeared, delay: 0.25)

                    appearanceSection
                        .entranceAnimation(sectionsAppeared, delay: 0.3)

                    pushNotificationSection
                        .entranceAnimation(sectionsAppeared, delay: 0.35)

                    notificationsSection
                        .entranceAnimation(sectionsAppeared, delay: 0.4)

                    dangerZoneSection
                        .entranceAnimation(sectionsAppeared, delay: 0.45)

                    versionFooter
                        .entranceAnimation(sectionsAppeared, delay: 0.5)
                }
                .padding(.top, 20)
                .padding(.bottom, 40)
                .background {
                    GeometryReader { geo in
                        Color.clear
                            .preference(
                                key: ProfileScrollOffsetKey.self,
                                value: -geo.frame(in: .named("profileScroll")).minY
                            )
                    }
                }
            }
            .coordinateSpace(name: "profileScroll")
            .onPreferenceChange(ProfileScrollOffsetKey.self) { value in
                scrollOffset = value
            }
        }
        .background(Color.sp.snow)
        .navigationBarHidden(true)
        .animation(.easeInOut(duration: 0.3), value: viewModel.isLoading)
        .task {
            // Derive stats from pre-loaded data — instant, no API calls
            viewModel.loadFromStore(dataStore)
            triggerEntranceAnimations()
            // Load notification prefs in background
            async let _ = viewModel.loadNotificationPrefs()
            // Delay ring animation for visual pop
            try? await Task.sleep(for: .milliseconds(400))
            withAnimation(.easeOut(duration: 0.8)) {
                ringsAnimated = true
            }
        }
        .refreshable {
            if let userId = authService.appUser?.userId {
                await dataStore.refresh(userId: userId)
                viewModel.loadFromStore(dataStore)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
        .sheet(isPresented: $viewModel.showPasswordSheet) {
            passwordSheet
        }
        .sheet(isPresented: $viewModel.showDeleteConfirmation) {
            deleteAccountSheet
        }
        .alert("Sign Out", isPresented: $showSignOutAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Sign Out", role: .destructive) {
                Task { try? await authService.signOut() }
            }
        } message: {
            Text("Are you sure you want to sign out?")
        }
    }

    private func triggerEntranceAnimations() {
        guard !sectionsAppeared else { return }
        withAnimation(.easeOut(duration: 0.45)) {
            sectionsAppeared = true
        }
    }

    // MARK: - Scroll Collapse

    private let collapseThreshold: CGFloat = 50

    private var collapseProgress: CGFloat {
        min(1, max(0, scrollOffset / collapseThreshold))
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4 * (1 - collapseProgress)) {
                    HStack(spacing: 0) {
                        Text("Your")
                            .font(SPTypography.pageTitle)
                            .foregroundStyle(Color.sp.ink)
                        Text("Profile")
                            .font(SPTypography.pageTitle)
                            .foregroundStyle(Color.sp.primary)
                    }

                    Text("Stats, settings & more")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                        .opacity(1 - collapseProgress)
                        .frame(maxHeight: collapseProgress < 1 ? nil : 0, alignment: .top)
                        .clipped()
                }

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 54 - (12 * collapseProgress))
            .padding(.bottom, 12)
        }
        .background(Color.sp.snow)
    }

    // MARK: - Profile Card

    private var profileCard: some View {
        HStack(spacing: 14) {
            // Avatar
            ZStack {
                Circle()
                    .fill(Color.sp.primary.opacity(0.12))
                    .frame(width: 56, height: 56)
                Text(initials)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.sp.primary)
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(authService.appUser?.fullName ?? "User")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.sp.ink)

                    if !viewModel.isLoading && viewModel.totalPoints > 0 {
                        Text("\(viewModel.totalPoints) pts")
                            .font(SPTypography.mono(size: 10, weight: .bold))
                            .foregroundStyle(Color.sp.primary)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Color.sp.primaryLight, in: Capsule())
                    }
                }
                Text("@\(authService.appUser?.username ?? "")")
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.sp.slate)
                if let createdAt = authService.appUser?.createdAt {
                    Text("Member since \(formatMemberSince(createdAt))")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.sp.slate)
                }
            }

            Spacer()
        }
        .padding(16)
        .background(Color.sp.surface)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        .padding(.horizontal, 20)
    }

    // MARK: - Quick Stats

    private var quickStatsRow: some View {
        HStack(spacing: 10) {
            statCard(
                title: "Pools",
                value: "\(dataStore.poolCards.count)",
                icon: "person.3.fill",
                gradient: [Color.sp.primary, Color.sp.primary.opacity(0.7)]
            )
            statCard(
                title: "Points",
                value: "\(viewModel.totalPoints)",
                icon: "bolt.fill",
                gradient: [Color.sp.accent, Color.sp.accent.opacity(0.7)]
            )
            statCard(
                title: "Predictions",
                value: "\(viewModel.totalPredictions)",
                icon: "checkmark.circle.fill",
                gradient: [Color.sp.green, Color.sp.green.opacity(0.7)]
            )
        }
        .padding(.horizontal, 20)
    }

    private func statCard(title: String, value: String, icon: String, gradient: [Color]) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(
                    LinearGradient(colors: gradient, startPoint: .top, endPoint: .bottom)
                )
            Text(value)
                .font(SPTypography.mono(size: 20, weight: .bold))
                .foregroundStyle(Color.sp.ink)
            Text(title)
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Color.sp.surface)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
    }

    // MARK: - Account Section

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Account")
                .font(SPTypography.sectionHeader)
                .foregroundStyle(Color.sp.ink)
                .padding(.horizontal, 20)

            VStack(spacing: 0) {
                if viewModel.isEditingProfile {
                    editableProfileContent
                } else {
                    readOnlyProfileContent
                }
            }
            .background(Color.sp.surface)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            .padding(.horizontal, 20)
        }
    }

    private var readOnlyProfileContent: some View {
        VStack(spacing: 0) {
            if let user = authService.appUser {
                accountRow(label: "Username", value: user.username)
                cardDivider
                accountRow(label: "Full Name", value: user.fullName)
                cardDivider
                accountRow(label: "Email", value: user.email)
                cardDivider

                HStack {
                    Spacer()
                    Button {
                        if let user = authService.appUser {
                            viewModel.startEditing(user: user)
                        }
                    } label: {
                        Text("Edit Profile")
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color.sp.primary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(Color.sp.primary.opacity(0.1), in: Capsule())
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
        }
    }

    private var editableProfileContent: some View {
        VStack(spacing: 0) {
            if let error = viewModel.profileError {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.sp.red)
                    Text(error)
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.sp.red)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.sp.redLight)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
                .padding(.horizontal, 14)
                .padding(.top, 10)
            }

            editField(label: "Username", text: $viewModel.editUsername) {
                usernameStatusView
            }
            .onChange(of: viewModel.editUsername) { _, _ in
                Task {
                    if let user = authService.appUser {
                        await viewModel.checkUsername(current: user.username)
                    }
                }
            }
            cardDivider
            editField(label: "Full Name", text: $viewModel.editFullName) { EmptyView() }
            cardDivider
            editField(label: "Email", text: $viewModel.editEmail) { EmptyView() }
            cardDivider

            HStack(spacing: 10) {
                Button {
                    if let user = authService.appUser {
                        viewModel.cancelEditing(user: user)
                    }
                } label: {
                    Text("Cancel")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.sp.slate)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(Color.sp.mist, in: Capsule())
                }
                Spacer()
                Button {
                    Task {
                        if let userId = authService.appUser?.userId {
                            await viewModel.saveProfile(userId: userId)
                        }
                    }
                } label: {
                    Group {
                        if viewModel.profileSaving {
                            ProgressView()
                                .tint(.white)
                                .scaleEffect(0.8)
                        } else {
                            Text("Save")
                                .font(.system(size: 13, weight: .semibold, design: .rounded))
                        }
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(
                        viewModel.usernameStatus == .taken ? Color.sp.primary.opacity(0.4) : Color.sp.primary,
                        in: Capsule()
                    )
                }
                .disabled(viewModel.profileSaving || viewModel.usernameStatus == .taken)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
    }

    @ViewBuilder
    private var usernameStatusView: some View {
        switch viewModel.usernameStatus {
        case .checking:
            ProgressView()
                .scaleEffect(0.6)
        case .available:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 14))
                .foregroundStyle(Color.sp.green)
        case .taken:
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 14))
                .foregroundStyle(Color.sp.red)
        case .idle:
            EmptyView()
        }
    }

    private func accountRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
                .frame(width: 76, alignment: .leading)
            Text(value)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.ink)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
    }

    private func editField<Trailing: View>(
        label: String,
        text: Binding<String>,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sp.slate)
                .tracking(0.5)
            HStack {
                TextField(label, text: text)
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.sp.ink)
                    .textInputAutocapitalization(label == "Email" ? .never : .words)
                    .keyboardType(label == "Email" ? .emailAddress : .default)
                    .autocorrectionDisabled()
                trailing()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Security Section

    private var securitySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Security")
                .font(SPTypography.sectionHeader)
                .foregroundStyle(Color.sp.ink)
                .padding(.horizontal, 20)

            Button {
                viewModel.showPasswordSheet = true
                viewModel.passwordError = nil
                viewModel.passwordSuccess = false
                viewModel.newPassword = ""
                viewModel.confirmPassword = ""
            } label: {
                HStack {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.sp.primary)
                        .frame(width: 32, height: 32)
                        .background(Color.sp.primaryLight)
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                    VStack(alignment: .leading, spacing: 1) {
                        Text("Change Password")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color.sp.ink)
                        Text("Update your account password")
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.sp.slate)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.sp.slate)
                }
                .padding(14)
                .background(Color.sp.surface)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            }
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Password Sheet

    private var passwordSheet: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if viewModel.passwordSuccess {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(Color.sp.green)
                        Text("Password Updated")
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.sp.ink)
                    }
                    Spacer()
                } else {
                    VStack(alignment: .leading, spacing: 16) {
                        if let error = viewModel.passwordError {
                            HStack(spacing: 6) {
                                Image(systemName: "exclamationmark.circle.fill")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Color.sp.red)
                                Text(error)
                                    .font(.system(size: 12, weight: .medium, design: .rounded))
                                    .foregroundStyle(Color.sp.red)
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.sp.redLight)
                            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("NEW PASSWORD")
                                .font(.system(size: 10, weight: .bold, design: .rounded))
                                .foregroundStyle(Color.sp.slate)
                                .tracking(0.5)
                            SecureField("At least 8 characters", text: $viewModel.newPassword)
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .padding(12)
                                .background(Color.sp.mist.opacity(0.5))
                                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("CONFIRM PASSWORD")
                                .font(.system(size: 10, weight: .bold, design: .rounded))
                                .foregroundStyle(Color.sp.slate)
                                .tracking(0.5)
                            SecureField("Re-enter password", text: $viewModel.confirmPassword)
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .padding(12)
                                .background(Color.sp.mist.opacity(0.5))
                                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                        }

                        Button {
                            Task { await viewModel.changePassword() }
                        } label: {
                            HStack {
                                if viewModel.passwordLoading {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("Update Password")
                                        .font(.system(size: 15, weight: .bold, design: .rounded))
                                }
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(
                                (viewModel.newPassword.isEmpty || viewModel.confirmPassword.isEmpty)
                                    ? Color.sp.primary.opacity(0.4)
                                    : Color.sp.primary,
                                in: RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                            )
                        }
                        .disabled(viewModel.passwordLoading || viewModel.newPassword.isEmpty || viewModel.confirmPassword.isEmpty)
                    }
                    .padding(20)
                    Spacer()
                }
            }
            .background(Color.sp.snow)
            .navigationTitle("Change Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { viewModel.showPasswordSheet = false }
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.sp.primary)
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Appearance

    private var appearanceSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Appearance")
                .font(SPTypography.sectionHeader)
                .foregroundStyle(Color.sp.ink)
                .padding(.horizontal, 20)

            HStack(spacing: 0) {
                appearanceOption("Light", value: "light", icon: "sun.max.fill")
                appearanceOption("System", value: "system", icon: "gear")
                appearanceOption("Dark", value: "dark", icon: "moon.fill")
            }
            .padding(4)
            .background(Color.sp.mist)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            .padding(.horizontal, 20)
        }
    }

    private func appearanceOption(_ label: String, value: String, icon: String) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                colorScheme = value
            }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                Text(label)
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
            }
            .foregroundStyle(colorScheme == value ? Color.sp.ink : Color.sp.slate)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(colorScheme == value ? Color.sp.surface : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
        }
    }

    // MARK: - Notifications

    private var pushNotificationSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Push Notifications")
                .font(SPTypography.sectionHeader)
                .foregroundStyle(Color.sp.ink)
                .padding(.horizontal, 20)

            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Image(systemName: "bell.badge.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color.sp.primary)
                        .frame(width: 32, height: 32)
                        .background(Color.sp.primaryLight)
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                    VStack(alignment: .leading, spacing: 1) {
                        Text("Push Notifications")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color.sp.ink)
                        Text(PushNotificationService.shared.isAuthorized
                             ? "Receiving push notifications"
                             : "Enable in Settings to receive alerts")
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.sp.slate)
                    }

                    Spacer()

                    if PushNotificationService.shared.isAuthorized {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Color.sp.primary)
                            .font(.system(size: 20))
                    } else {
                        Button("Enable") {
                            Task {
                                let granted = await PushNotificationService.shared.requestPermission()
                                if !granted {
                                    // Permission denied — open Settings
                                    if let url = URL(string: UIApplication.openSettingsURLString) {
                                        await UIApplication.shared.open(url)
                                    }
                                }
                            }
                        }
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.sp.primary)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
            }
            .background(Color.sp.surface)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            .padding(.horizontal, 20)
        }
    }

    private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Email Notifications")
                .font(SPTypography.sectionHeader)
                .foregroundStyle(Color.sp.ink)
                .padding(.horizontal, 20)

            VStack(spacing: 0) {
                if viewModel.notifLoading {
                    HStack {
                        ProgressView()
                            .scaleEffect(0.8)
                        Text("Loading preferences...")
                            .font(.system(size: 13, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.sp.slate)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                } else {
                    ForEach(Array(ProfileViewModel.notifOptions.enumerated()), id: \.element.key) { index, option in
                        notificationRow(option)

                        if index < ProfileViewModel.notifOptions.count - 1 {
                            Rectangle()
                                .fill(Color.sp.mist.opacity(0.5))
                                .frame(height: 0.5)
                                .padding(.horizontal, 14)
                        }
                    }
                }
            }
            .background(Color.sp.surface)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            .padding(.horizontal, 20)
        }
    }

    private func notificationRow(_ option: (key: String, label: String, desc: String)) -> some View {
        HStack(spacing: 12) {
            Image(systemName: notifIcon(option.key))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.sp.primary)
                .frame(width: 32, height: 32)
                .background(Color.sp.primaryLight)
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 1) {
                Text(option.label)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.sp.ink)
                Text(option.desc)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.sp.slate)
            }

            Spacer()

            if viewModel.notifUpdating == option.key {
                ProgressView()
                    .scaleEffect(0.7)
            } else {
                Toggle("", isOn: Binding(
                    get: { viewModel.notificationPrefs[option.key] ?? true },
                    set: { _ in
                        Task { await viewModel.toggleNotification(key: option.key) }
                    }
                ))
                .tint(Color.sp.primary)
                .labelsHidden()
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func notifIcon(_ key: String) -> String {
        switch key {
        case "POOL_ACTIVITY": return "person.3.fill"
        case "PREDICTIONS": return "target"
        case "MATCH_RESULTS": return "sportscourt.fill"
        case "LEADERBOARD": return "chart.bar.fill"
        case "ADMIN": return "gearshape.fill"
        case "COMMUNITY": return "bubble.left.and.bubble.right.fill"
        default: return "bell.fill"
        }
    }

    // MARK: - Danger Zone

    private var dangerZoneSection: some View {
        VStack(spacing: 12) {
            // Sign out
            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                showSignOutAlert = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.sp.red)
                        .frame(width: 32, height: 32)
                        .background(Color.sp.redLight)
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                    Text("Sign Out")
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.sp.red)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.sp.slate)
                }
                .padding(14)
                .background(Color.sp.surface)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            }
            .padding(.horizontal, 20)

            // Delete account
            Button {
                viewModel.showDeleteConfirmation = true
                viewModel.deleteConfirmText = ""
                viewModel.deleteError = nil
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "trash.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.sp.red)
                        .frame(width: 32, height: 32)
                        .background(Color.sp.redLight)
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                    VStack(alignment: .leading, spacing: 1) {
                        Text("Delete Account")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color.sp.red)
                        Text("Permanently remove all data")
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.sp.slate)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.sp.slate)
                }
                .padding(14)
                .background(Color.sp.surface)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            }
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Delete Sheet

    private var deleteAccountSheet: some View {
        NavigationStack {
            VStack(spacing: 20) {
                // Warning banner
                VStack(alignment: .leading, spacing: 8) {
                    Text("This action is permanent:")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.sp.red)

                    VStack(alignment: .leading, spacing: 5) {
                        warningBullet("Delete all your predictions and scores")
                        warningBullet("Remove you from all pools")
                        warningBullet("Permanently delete your account")
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.sp.redLight)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))

                if let error = viewModel.deleteError {
                    HStack(spacing: 6) {
                        Image(systemName: "exclamationmark.circle.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(Color.sp.red)
                        Text(error)
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.sp.red)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.sp.redLight)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("TYPE YOUR USERNAME TO CONFIRM")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.sp.slate)
                        .tracking(0.5)
                    Text("Must type: \(authService.appUser?.username ?? "")")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.sp.slate)
                    TextField(authService.appUser?.username ?? "", text: $viewModel.deleteConfirmText)
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        .padding(12)
                        .background(Color.sp.mist.opacity(0.5))
                        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Button {
                    Task {
                        let success = await viewModel.deleteAccount()
                        if success { try? await authService.signOut() }
                    }
                } label: {
                    HStack {
                        if viewModel.deleteLoading {
                            ProgressView().tint(.white)
                        } else {
                            Text("Delete My Account")
                                .font(.system(size: 15, weight: .bold, design: .rounded))
                        }
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        viewModel.deleteConfirmText == authService.appUser?.username
                            ? Color.sp.red
                            : Color.sp.red.opacity(0.3),
                        in: RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                    )
                }
                .disabled(viewModel.deleteLoading || viewModel.deleteConfirmText != authService.appUser?.username)

                Spacer()
            }
            .padding(20)
            .background(Color.sp.snow)
            .navigationTitle("Delete Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") { viewModel.showDeleteConfirmation = false }
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.sp.primary)
                }
            }
        }
        .presentationDetents([.large])
    }

    private func warningBullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(Color.sp.red.opacity(0.5))
                .frame(width: 5, height: 5)
                .padding(.top, 6)
            Text(text)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.red.opacity(0.8))
        }
    }

    // MARK: - Version Footer

    private var versionFooter: some View {
        HStack {
            Text("SportPool")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.sp.slate)
            Spacer()
            Text("v1.0.0")
                .font(SPTypography.mono(size: 11, weight: .medium))
                .foregroundStyle(Color.sp.slate)
        }
        .padding(.horizontal, 36)
    }

    // MARK: - Empty Stats

    private var emptyStatsCard: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.sp.primary.opacity(0.08))
                    .frame(width: 64, height: 64)
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 26))
                    .foregroundStyle(Color.sp.primary.opacity(0.4))
            }

            Text("No stats yet")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sp.ink)

            Text("Join a pool to start tracking\nyour prediction performance")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .background(Color.sp.surface)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        .padding(.horizontal, 20)
    }

    // MARK: - Skeleton

    private var profileSkeletonStats: some View {
        VStack(spacing: 16) {
            HStack(spacing: 10) {
                ForEach(0..<3, id: \.self) { _ in
                    VStack(spacing: 8) {
                        SkeletonBlock(width: 20, height: 20)
                        SkeletonBlock(width: 40, height: 18)
                        SkeletonBlock(width: 50, height: 10)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.sp.surface)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
                }
            }
            .padding(.horizontal, 20)

            VStack(spacing: 0) {
                ForEach(0..<3, id: \.self) { i in
                    HStack {
                        SkeletonBlock(width: 120, height: 14)
                        Spacer()
                        SkeletonBlock(width: 50, height: 14)
                    }
                    .padding(16)
                    if i < 2 {
                        Rectangle()
                            .fill(Color.sp.mist.opacity(0.5))
                            .frame(height: 0.5)
                            .padding(.horizontal, 14)
                    }
                }
            }
            .background(Color.sp.surface)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            .padding(.horizontal, 20)
            .modifier(ShimmerModifier())
        }
    }

    // MARK: - Shared

    private var cardDivider: some View {
        Rectangle()
            .fill(Color.sp.mist.opacity(0.5))
            .frame(height: 0.5)
            .padding(.horizontal, 14)
    }

    private var initials: String {
        guard let user = authService.appUser else { return "?" }
        let parts = user.fullName.split(separator: " ")
        if parts.count >= 2 {
            return String(parts[0].prefix(1) + parts[1].prefix(1)).uppercased()
        }
        return String(user.fullName.prefix(2)).uppercased()
    }

    private func formatMemberSince(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: dateString) else { return "" }
        let display = DateFormatter()
        display.dateFormat = "MMMM yyyy"
        return display.string(from: date)
    }

}

// MARK: - Scroll Offset Preference Key

private struct ProfileScrollOffsetKey: PreferenceKey {
    nonisolated(unsafe) static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
