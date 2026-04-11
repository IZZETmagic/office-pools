import SwiftUI

struct BanterTabView: View {
    @Bindable var viewModel: BanterViewModel
    let authService: AuthService
    var leaderboardEntries: [LeaderboardEntryData] = []
    @State private var scrollProxy: ScrollViewProxy?
    @FocusState private var isTextFieldFocused: Bool

    private var mentionMembers: [LeaderboardEntryData] {
        viewModel.filteredMentionMembers(from: leaderboardEntries, currentUserId: authService.appUser?.userId)
    }

    private var memberLookup: [String: LeaderboardEntryData] {
        Dictionary(leaderboardEntries.map { ($0.userId, $0) }, uniquingKeysWith: { first, _ in first })
    }

    private func senderInitials(for userId: String) -> String {
        guard let entry = memberLookup[userId] else { return "?" }
        let parts = entry.fullName.split(separator: " ")
        let first = parts.first.map { String($0.prefix(1)) } ?? ""
        let last = parts.count > 1 ? (parts.last.map { String($0.prefix(1)) } ?? "") : ""
        return (first + last).uppercased()
    }

    private func parseDate(_ dateString: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: dateString) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: dateString)
    }

    private func shouldShowDateHeader(at index: Int) -> Bool {
        let messages = viewModel.messages
        guard let currentDate = parseDate(messages[index].createdAt) else { return false }
        if index == 0 { return true }
        guard let previousDate = parseDate(messages[index - 1].createdAt) else { return true }
        // Show header if different day or 5+ minute gap
        if !Calendar.current.isDate(currentDate, inSameDayAs: previousDate) { return true }
        return currentDate.timeIntervalSince(previousDate) >= 300
    }

    private func dateHeaderText(for dateString: String) -> String {
        guard let date = parseDate(dateString) else { return "" }
        let calendar = Calendar.current
        let timeFormatter = DateFormatter()
        timeFormatter.timeStyle = .short

        if calendar.isDateInToday(date) {
            return "Today \(timeFormatter.string(from: date))"
        } else if calendar.isDateInYesterday(date) {
            return "Yesterday \(timeFormatter.string(from: date))"
        } else {
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "MMM d"
            return "\(dateFormatter.string(from: date)) \(timeFormatter.string(from: date))"
        }
    }

    /// Show sender name on the first message in a consecutive run from the same user.
    private func isFirstInGroup(at index: Int) -> Bool {
        let messages = viewModel.messages
        if index == 0 { return true }
        if messages[index - 1].userId != messages[index].userId { return true }
        if shouldShowDateHeader(at: index) { return true }
        return false
    }

    /// Show avatar on the last message in a consecutive run from the same user.
    private func isLastInGroup(at index: Int) -> Bool {
        let messages = viewModel.messages
        if index == messages.count - 1 { return true }
        if messages[index + 1].userId != messages[index].userId { return true }
        if shouldShowDateHeader(at: index + 1) { return true }
        return false
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(Array(viewModel.messages.enumerated()), id: \.element.messageId) { index, message in
                        VStack(spacing: 2) {
                            if shouldShowDateHeader(at: index) {
                                Text(dateHeaderText(for: message.createdAt))
                                    .font(SPTypography.detail)
                                    .foregroundStyle(Color.sp.slate)
                                    .padding(.top, index == 0 ? 0 : 8)
                                    .padding(.bottom, 4)
                            }

                            MessageBubble(
                                message: message,
                                isOwnMessage: message.userId == authService.appUser?.userId,
                                senderName: memberLookup[message.userId]?.fullName ?? "",
                                senderInitials: senderInitials(for: message.userId),
                                showSenderName: isFirstInGroup(at: index),
                                showSenderAvatar: isLastInGroup(at: index)
                            )
                        }
                        .id(message.messageId)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    Divider()

                    // Mention autocomplete dropdown
                    if viewModel.mentionQuery != nil && !mentionMembers.isEmpty {
                        MentionDropdown(
                            members: mentionMembers,
                            selectedIndex: viewModel.selectedMentionIndex,
                            onSelect: { member in
                                viewModel.insertMention(member: member)
                            }
                        )
                        .padding(.horizontal)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    HStack(spacing: 12) {
                        TextField("Message", text: $viewModel.messageText, axis: .vertical)
                            .focused($isTextFieldFocused)
                            .lineLimit(1...12)
                            .font(SPTypography.body)
                            .padding(10)
                            .background(Color.sp.mist)
                            .clipShape(RoundedRectangle(cornerRadius: 20))
                            .onChange(of: viewModel.messageText) {
                                viewModel.updateMentionQuery(text: viewModel.messageText)
                            }

                        Button {
                            Task {
                                if let userId = authService.appUser?.userId {
                                    await viewModel.sendMessage(userId: userId, leaderboardEntries: leaderboardEntries)
                                }
                            }
                        } label: {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.title2)
                                .foregroundColor(viewModel.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Color.sp.silver : Color.sp.primary)
                        }
                        .disabled(viewModel.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isSending)
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                .background(Color.sp.surface)
            }
            .onAppear { scrollProxy = proxy }
            .onChange(of: viewModel.messages.count) {
                if let lastId = viewModel.messages.last?.messageId {
                    withAnimation {
                        proxy.scrollTo(lastId, anchor: .bottom)
                    }
                }
            }
            .onChange(of: isTextFieldFocused) {
                if isTextFieldFocused, let lastId = viewModel.messages.last?.messageId {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        withAnimation {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
            }
        }
        .onAppear {
            Task { await viewModel.load() }
        }
    }
}

struct MessageBubble: View {
    let message: PoolMessage
    let isOwnMessage: Bool
    var senderName: String = ""
    var senderInitials: String = ""
    var showSenderName: Bool = true
    var showSenderAvatar: Bool = true

    /// Build an AttributedString that highlights @mentions.
    private func mentionHighlightedContent() -> AttributedString {
        let content = message.content
        var result = AttributedString(content)

        // Find all @username patterns and style them
        let pattern = #"@(\w+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return result }
        let nsString = content as NSString
        let matches = regex.matches(in: content, range: NSRange(location: 0, length: nsString.length))

        for match in matches {
            guard let swiftRange = Range(match.range, in: content),
                  let attrRange = Range(swiftRange, in: result) else { continue }
            result[attrRange].font = .body.bold()
            result[attrRange].foregroundColor = isOwnMessage ? Color.sp.accent : Color.sp.primary
        }

        return result
    }

    private var quickActionType: QuickActionType? {
        // Primary: check messageType from database
        switch message.messageType {
        case .predictionShare: return .prediction
        case .badgeFlex: return .badges
        case .standingsDrop: return .standings
        default: break
        }
        // Fallback: check content prefix for old messages stored as type "text"
        let content = message.content
        if content.hasPrefix("🎯") { return .prediction }
        if content.hasPrefix("🏆") { return .badges }
        if content.hasPrefix("📊") { return .standings }
        return nil
    }

    var body: some View {
        if let actionType = quickActionType {
            richCard(actionType)
        } else {
            standardBubble
        }
    }

    // MARK: - Sender Avatar

    private var senderAvatar: some View {
        Text(senderInitials)
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: 28, height: 28)
            .background(Color.sp.slate)
            .clipShape(Circle())
    }

    private var senderNameLabel: some View {
        Text(senderName)
            .font(SPTypography.detail)
            .foregroundStyle(Color.sp.slate)
    }

    // MARK: - Standard Text Bubble

    private var standardBubble: some View {
        HStack {
            if isOwnMessage { Spacer(minLength: 60) }

            VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 4) {
                if !isOwnMessage && !senderName.isEmpty && showSenderName {
                    senderNameLabel
                        .padding(.leading, 36)
                }

                HStack(alignment: .bottom, spacing: 6) {
                    if !isOwnMessage {
                        if showSenderAvatar && !senderInitials.isEmpty {
                            senderAvatar
                        } else {
                            Color.clear.frame(width: 28, height: 28)
                        }
                    }

                    Text(mentionHighlightedContent())
                        .font(SPTypography.body)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(isOwnMessage ? Color.sp.primary : Color.sp.mist)
                        .foregroundStyle(isOwnMessage ? .white : Color.sp.ink)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
            }

            if !isOwnMessage { Spacer(minLength: 60) }
        }
    }

    // MARK: - Rich Card

    private func richCard(_ type: QuickActionType) -> some View {
        VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 4) {
            if !isOwnMessage && !senderName.isEmpty && showSenderName {
                senderNameLabel
                    .padding(.leading, 36)
            }
            HStack(alignment: .bottom, spacing: 6) {
                if !isOwnMessage {
                    if showSenderAvatar && !senderInitials.isEmpty {
                        senderAvatar
                    } else {
                        Color.clear.frame(width: 28, height: 28)
                    }
                }
            VStack(spacing: 0) {
                // Card header
                HStack(spacing: 8) {
                    Image(systemName: type.icon)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(type.accentColor.gradient)
                        .clipShape(RoundedRectangle(cornerRadius: 7))

                    Text(type.title)
                        .spCaption()
                        .foregroundStyle(type.accentColor)

                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.top, 12)
                .padding(.bottom, 8)

                Divider()
                    .padding(.horizontal, 14)

                // Card body — parse and display content
                richCardBody(type)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
            }
            .background(Color.sp.surface)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
            .spCardShadow()
            .frame(maxWidth: 300)
            }
        }
        .frame(maxWidth: .infinity, alignment: isOwnMessage ? .trailing : .leading)
    }

    @ViewBuilder
    private func richCardBody(_ type: QuickActionType) -> some View {
        switch type {
        case .prediction:
            predictionCardBody
        case .badges:
            badgesCardBody
        case .standings:
            standingsCardBody
        }
    }

    // MARK: - Prediction Card Body

    private var predictionCardBody: some View {
        let data = parsePredictionData()

        return VStack(spacing: 10) {
            // Match info header
            HStack {
                Text("Match \(data.matchNum) · \(data.stage)")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)
                Spacer()
                predictionOutcomeBadge(data.outcome)
            }

            // Teams + scores
            HStack(spacing: 0) {
                // Home team
                VStack(spacing: 4) {
                    predictionFlagView(url: data.homeFlagUrl, size: 36)
                    Text(data.homeName)
                        .font(SPTypography.detail)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity)

                // Scores column
                VStack(spacing: 4) {
                    // Actual score (larger)
                    Text("\(data.actualHome) - \(data.actualAway)")
                        .font(SPTypography.mono(size: 22, weight: .bold))

                    // Predicted score (smaller, below)
                    Text("\(data.predHome) - \(data.predAway)")
                        .font(SPTypography.mono(size: 11))
                        .foregroundStyle(Color.sp.slate)
                }
                .frame(width: 70)

                // Away team
                VStack(spacing: 4) {
                    predictionFlagView(url: data.awayFlagUrl, size: 36)
                    Text(data.awayName)
                        .font(SPTypography.detail)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    // MARK: - Prediction Data Parser

    private struct PredictionCardData {
        let matchNum: String
        let stage: String
        let homeName: String
        let awayName: String
        let actualHome: String
        let actualAway: String
        let predHome: String
        let predAway: String
        let outcome: String
        let homeFlagUrl: String
        let awayFlagUrl: String
    }

    private func parsePredictionData() -> PredictionCardData {
        // Primary: from metadata
        if case .predictionShare(let meta) = message.parsedMetadata {
            return PredictionCardData(
                matchNum: "\(meta.matchNumber)",
                stage: meta.stage,
                homeName: meta.homeTeamName,
                awayName: meta.awayTeamName,
                actualHome: "\(meta.actualHome)",
                actualAway: "\(meta.actualAway)",
                predHome: "\(meta.predictedHome)",
                predAway: "\(meta.predictedAway)",
                outcome: meta.outcome,
                homeFlagUrl: meta.homeFlagUrl ?? "",
                awayFlagUrl: meta.awayFlagUrl ?? ""
            )
        }
        // Fallback: parse from content string
        let content = message.content
        let stripped = content.hasPrefix("🎯 ") ? String(content.dropFirst(2)) : content
        let parts = stripped.components(separatedBy: "|")
        return PredictionCardData(
            matchNum: parts.count > 0 ? parts[0].trimmingCharacters(in: .whitespaces) : "",
            stage: parts.count > 1 ? parts[1] : "",
            homeName: parts.count > 2 ? parts[2] : "Home",
            awayName: parts.count > 3 ? parts[3] : "Away",
            actualHome: parts.count > 6 ? parts[6] : "0",
            actualAway: parts.count > 7 ? parts[7] : "0",
            predHome: parts.count > 8 ? parts[8] : "0",
            predAway: parts.count > 9 ? parts[9] : "0",
            outcome: parts.count > 10 ? parts[10] : "miss",
            homeFlagUrl: parts.count > 11 ? parts[11] : "",
            awayFlagUrl: parts.count > 12 ? parts[12] : ""
        )
    }

    private func predictionOutcomeBadge(_ outcome: String) -> some View {
        let (label, icon, color): (String, String, Color) = {
            switch outcome {
            case "exact": return ("EXACT", "star.fill", Color.sp.accent)
            case "correct": return ("CORRECT", "checkmark", Color.sp.green)
            default: return ("MISS", "xmark", Color.sp.red)
            }
        }()

        return Label(label, systemImage: icon)
            .font(.system(size: 9, weight: .heavy, design: .rounded))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
    }

    @ViewBuilder
    private func predictionFlagView(url: String, size: CGFloat) -> some View {
        let width = size
        let height = size * 0.67
        if !url.isEmpty, let imageUrl = URL(string: url) {
            CachedAsyncImage(url: imageUrl, width: width, height: height, cornerRadius: 3)
        } else {
            RoundedRectangle(cornerRadius: 3)
                .fill(Color.sp.mist)
                .frame(width: width, height: height)
        }
    }

    // MARK: - Badges Card Body

    private var badgesCardBody: some View {
        // Primary: from metadata
        if case .badgeFlex(let meta) = message.parsedMetadata {
            return AnyView(badgesFromMetadata(meta))
        }
        // Fallback: parse from content string
        let content = message.content
        let isIndividual = content.contains("Flexing a badge")
        return AnyView(Group {
            if isIndividual {
                individualBadgeBodyLegacy(content)
            } else {
                allBadgesBodyLegacy(content)
            }
        })
    }

    // MARK: - Badges from Metadata

    private func badgesFromMetadata(_ meta: BadgeFlexMetadata) -> some View {
        let isIndividual = meta.badges.count == 1

        return Group {
            if isIndividual, let badge = meta.badges.first {
                VStack(spacing: 8) {
                    Image(systemName: badgeIcon(badge.id))
                        .font(.largeTitle)
                        .foregroundStyle(badgeRarityColor(badge.rarity))
                        .frame(width: 56, height: 56)
                        .background(badgeRarityColor(badge.rarity).opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 12))

                    Text(badge.name)
                        .font(SPTypography.cardTitle)
                        .foregroundStyle(Color.sp.ink)

                    Text(badge.rarity.uppercased())
                        .font(.system(size: 9, weight: .heavy, design: .rounded))
                        .foregroundStyle(badgeRarityColor(badge.rarity))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(badgeRarityColor(badge.rarity).opacity(0.12))
                        .clipShape(Capsule())

                    Text("+\(badge.xpBonus) XP")
                        .font(SPTypography.mono(size: 12, weight: .semibold))
                        .foregroundStyle(Color.sp.slate)
                }
                .frame(maxWidth: .infinity)
            } else {
                VStack(spacing: 10) {
                    HStack(spacing: 12) {
                        Text("\(meta.level)")
                            .font(SPTypography.mono(size: 24, weight: .bold))
                            .foregroundStyle(Color.sp.primary)
                            .frame(width: 44, height: 44)
                            .background(Color.sp.primaryLight)
                            .clipShape(RoundedRectangle(cornerRadius: 10))

                        VStack(alignment: .leading, spacing: 2) {
                            Text(meta.levelName)
                                .font(SPTypography.cardTitle)
                                .foregroundStyle(Color.sp.ink)
                            Text("\(meta.badges.count) badge\(meta.badges.count != 1 ? "s" : "") earned")
                                .font(SPTypography.detail)
                                .foregroundStyle(Color.sp.slate)
                        }
                        Spacer()
                    }

                    Divider()

                    VStack(spacing: 6) {
                        ForEach(Array(meta.badges.enumerated()), id: \.offset) { _, badge in
                            HStack(spacing: 8) {
                                Image(systemName: badgeIcon(badge.id))
                                    .font(SPTypography.detail)
                                    .foregroundStyle(badgeRarityColor(badge.rarity))
                                    .frame(width: 22, height: 22)
                                    .background(badgeRarityColor(badge.rarity).opacity(0.1))
                                    .clipShape(RoundedRectangle(cornerRadius: 5))

                                Text(badge.name)
                                    .font(SPTypography.body)
                                    .foregroundStyle(Color.sp.ink)

                                Spacer()

                                Text(badge.rarity.uppercased())
                                    .font(.system(size: 8, weight: .heavy, design: .rounded))
                                    .foregroundStyle(badgeRarityColor(badge.rarity))
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(badgeRarityColor(badge.rarity).opacity(0.12))
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Legacy Badge Parsing (for old messages without metadata)

    private func individualBadgeBodyLegacy(_ content: String) -> some View {
        let afterDash = content.components(separatedBy: " — ").dropFirst().joined(separator: " — ")
        let parts = afterDash.components(separatedBy: "|")
        let name = parts.count > 0 ? parts[0] : "Badge"
        let rarity = parts.count > 1 ? parts[1] : "Common"
        let condition = parts.count > 2 ? parts[2] : ""
        let xpBonus = parts.count > 3 ? parts[3] : "0"
        let id = parts.count > 4 ? parts[4] : ""

        return VStack(spacing: 8) {
            Image(systemName: badgeIcon(id))
                .font(.largeTitle)
                .foregroundStyle(badgeRarityColor(rarity))
                .frame(width: 56, height: 56)
                .background(badgeRarityColor(rarity).opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 12))

            Text(name)
                .font(SPTypography.cardTitle)
                .foregroundStyle(Color.sp.ink)

            Text(rarity.uppercased())
                .font(.system(size: 9, weight: .heavy, design: .rounded))
                .foregroundStyle(badgeRarityColor(rarity))
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(badgeRarityColor(rarity).opacity(0.12))
                .clipShape(Capsule())

            if !condition.isEmpty {
                Text(condition)
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)
                    .multilineTextAlignment(.center)
            }

            Text("+\(xpBonus) XP")
                .font(SPTypography.mono(size: 12, weight: .semibold))
                .foregroundStyle(Color.sp.slate)
        }
        .frame(maxWidth: .infinity)
    }

    private func allBadgesBodyLegacy(_ content: String) -> some View {
        let lines = content.components(separatedBy: "\n")
        let mainLine = lines.first ?? content
        let parsed = parseBadgeContentLegacy(mainLine)

        let badgeLines = lines.dropFirst().compactMap { line -> (name: String, rarity: String, id: String)? in
            let parts = line.components(separatedBy: "|")
            guard parts.count >= 2 else { return nil }
            let id = parts.count >= 3 ? parts[2] : ""
            return (parts[0], parts[1], id)
        }

        return VStack(spacing: 10) {
            HStack(spacing: 12) {
                Text("\(parsed.level)")
                    .font(SPTypography.mono(size: 24, weight: .bold))
                    .foregroundStyle(Color.sp.primary)
                    .frame(width: 44, height: 44)
                    .background(Color.sp.primaryLight)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 2) {
                    Text(parsed.levelName)
                        .font(SPTypography.cardTitle)
                        .foregroundStyle(Color.sp.ink)
                    Text("\(parsed.badgeCount) badge\(parsed.badgeCount != 1 ? "s" : "") earned")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                }
                Spacer()
            }

            if !badgeLines.isEmpty {
                Divider()

                VStack(spacing: 6) {
                    ForEach(Array(badgeLines.enumerated()), id: \.offset) { _, badge in
                        HStack(spacing: 8) {
                            Image(systemName: badgeIcon(badge.id))
                                .font(SPTypography.detail)
                                .foregroundStyle(badgeRarityColor(badge.rarity))
                                .frame(width: 22, height: 22)
                                .background(badgeRarityColor(badge.rarity).opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 5))

                            Text(badge.name)
                                .font(SPTypography.body)
                                .foregroundStyle(Color.sp.ink)

                            Spacer()

                            Text(badge.rarity.uppercased())
                                .font(.system(size: 8, weight: .heavy, design: .rounded))
                                .foregroundStyle(badgeRarityColor(badge.rarity))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(badgeRarityColor(badge.rarity).opacity(0.12))
                                .clipShape(Capsule())
                        }
                    }
                }
            }
        }
    }

    private func parseBadgeContentLegacy(_ content: String) -> (level: Int, levelName: String, badgeCount: Int) {
        let pattern = #"Level (\d+) (.+?) with (\d+) badge"#
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(in: content, range: NSRange(content.startIndex..., in: content)) {
            let level = Int(content[Range(match.range(at: 1), in: content)!]) ?? 0
            let name = String(content[Range(match.range(at: 2), in: content)!])
            let badges = Int(content[Range(match.range(at: 3), in: content)!]) ?? 0
            return (level, name, badges)
        }
        return (0, "Unknown", 0)
    }

    // MARK: - Standings Card Body

    private var standingsCardBody: some View {
        let senderUserId = message.userId
        let entries: [(name: String, points: Int, userId: String, rank: Int)]

        // Primary: from metadata
        if case .standingsDrop(let meta) = message.parsedMetadata {
            entries = meta.entries.map { ($0.fullName, $0.points, $0.userId, $0.rank) }
        } else {
            // Fallback: parse from content string
            let lines = message.content.components(separatedBy: "\n")
            entries = lines.dropFirst().enumerated().compactMap { idx, line in
                let parts = line.components(separatedBy: "|")
                guard parts.count >= 2 else { return nil }
                let name = parts[0]
                let points = Int(parts[1]) ?? 0
                let userId = parts.count >= 3 ? parts[2] : ""
                return (name, points, userId, idx + 1)
            }
        }

        return VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(entries.enumerated()), id: \.offset) { idx, entry in
                let isSender = entry.userId == senderUserId
                let isLeader = idx == 0
                let displayRank = entry.rank >= 900 ? idx + 1 : entry.rank

                HStack(spacing: 10) {
                    Text("\(displayRank)")
                        .font(SPTypography.mono(size: 11, weight: .bold))
                        .foregroundStyle(isLeader ? .white : Color.sp.slate)
                        .frame(width: 24, height: 24)
                        .background(isLeader ? Color.sp.primary.gradient : Color.clear.gradient)
                        .clipShape(Circle())

                    Text(entry.name)
                        .font(isLeader ? SPTypography.cardTitle : SPTypography.body)
                        .foregroundStyle(isSender ? Color.sp.primary : Color.sp.ink)

                    Spacer()

                    Text("\(entry.points) pts")
                        .font(isLeader ? SPTypography.mono(size: 14, weight: .semibold) : SPTypography.mono(size: 12))
                        .foregroundStyle(isLeader ? Color.sp.primary : Color.sp.slate)
                }
                .padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(isSender ? Color.sp.primaryLight : Color.clear)
                        .padding(.horizontal, -4)
                )
            }
        }
    }

    // MARK: - Badge Helpers

    private func badgeIcon(_ id: String) -> String {
        switch id {
        case "sharpshooter": return "scope"
        case "oracle": return "eye.fill"
        case "dark_horse": return "hare.fill"
        case "ice_breaker": return "snowflake"
        case "on_fire": return "flame.fill"
        case "top_dog": return "crown.fill"
        case "globe_trotter": return "globe"
        case "lightning_rod": return "bolt.fill"
        case "stadium_regular": return "building.columns.fill"
        case "showtime": return "sparkles"
        case "grand_finale": return "trophy.fill"
        case "legend": return "star.fill"
        default: return "star.fill"
        }
    }

    private func badgeRarityColor(_ rarity: String) -> Color {
        switch rarity {
        case "Common": return .gray
        case "Uncommon": return .green
        case "Rare": return .blue
        case "Very Rare": return .purple
        case "Legendary": return .yellow
        default: return .gray
        }
    }

}

// MARK: - Quick Action Type

enum QuickActionType {
    case prediction, badges, standings

    var icon: String {
        switch self {
        case .prediction: return "target"
        case .badges: return "trophy.fill"
        case .standings: return "chart.bar.fill"
        }
    }

    var title: String {
        switch self {
        case .prediction: return "Prediction"
        case .badges: return "Badge Flex"
        case .standings: return "Standings"
        }
    }

    var accentColor: Color {
        switch self {
        case .prediction: return Color.sp.accent
        case .badges: return Color.sp.primary
        case .standings: return Color.sp.green
        }
    }
}
