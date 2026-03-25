import SwiftUI

struct BanterTabView: View {
    @Bindable var viewModel: BanterViewModel
    let authService: AuthService
    @State private var scrollProxy: ScrollViewProxy?
    @FocusState private var isTextFieldFocused: Bool

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(viewModel.messages) { message in
                        MessageBubble(
                            message: message,
                            isOwnMessage: message.userId == authService.appUser?.userId
                        )
                        .id(message.messageId)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    Divider()
                    HStack(spacing: 12) {
                        TextField("Message", text: $viewModel.messageText, axis: .vertical)
                            .focused($isTextFieldFocused)
                            .lineLimit(1...4)
                            .padding(10)
                            .background(.fill.tertiary)
                            .clipShape(RoundedRectangle(cornerRadius: 20))

                        Button {
                            Task {
                                if let userId = authService.appUser?.userId {
                                    await viewModel.sendMessage(userId: userId)
                                }
                            }
                        } label: {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.title2)
                                .foregroundColor(viewModel.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .secondary : .accentColor)
                        }
                        .disabled(viewModel.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isSending)
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                .background(.bar)
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
        .task {
            await viewModel.load()
        }
        .onDisappear {
            Task { await viewModel.cleanup() }
        }
    }
}

struct MessageBubble: View {
    let message: PoolMessage
    let isOwnMessage: Bool

    private var quickActionType: QuickActionType? {
        let content = message.content
        if content.hasPrefix("🎯") { return .prediction }
        if content.hasPrefix("✓") { return .prediction }
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

    // MARK: - Standard Text Bubble

    private var standardBubble: some View {
        HStack {
            if isOwnMessage { Spacer(minLength: 60) }

            VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .font(.subheadline)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(isOwnMessage ? Color.accentColor : Color(.systemGray5))
                    .foregroundStyle(isOwnMessage ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                Text(formatTime(message.createdAt))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            if !isOwnMessage { Spacer(minLength: 60) }
        }
    }

    // MARK: - Rich Card

    private func richCard(_ type: QuickActionType) -> some View {
        VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 6) {
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
                        .font(.caption.weight(.bold))
                        .foregroundStyle(type.accentColor)
                        .textCase(.uppercase)

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
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(0.06), radius: 6, y: 3)
            .frame(maxWidth: 300)

            Text(formatTime(message.createdAt))
                .font(.caption2)
                .foregroundStyle(.tertiary)
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
        // Parse: "🎯 Nailed it! France 2 - 1 Germany — exact score!"
        // or "✓ Called it! France 2 - 1 Germany"
        // or "France 2 - 1 Germany — missed this one"
        let content = message.content
        let isExact = content.hasPrefix("🎯")
        let isCorrect = content.hasPrefix("✓")
        let parsed = parsePredictionContent(content)

        return VStack(spacing: 10) {
            // Teams + score row
            HStack(spacing: 0) {
                Text(parsed.homeTeam)
                    .font(.subheadline.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)

                VStack(spacing: 2) {
                    Text(parsed.score)
                        .font(.title2.weight(.bold).monospacedDigit())
                }
                .frame(width: 60)

                Text(parsed.awayTeam)
                    .font(.subheadline.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }

            // Outcome badge
            HStack {
                Spacer()
                if isExact {
                    Label("EXACT", systemImage: "star.fill")
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color.orange.opacity(0.12))
                        .clipShape(Capsule())
                } else if isCorrect {
                    Label("CORRECT", systemImage: "checkmark")
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(.green)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color.green.opacity(0.12))
                        .clipShape(Capsule())
                } else {
                    Label("MISS", systemImage: "xmark")
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(.red)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color.red.opacity(0.12))
                        .clipShape(Capsule())
                }
                Spacer()
            }

            // User-added text (lines after the first)
            let lines = content.components(separatedBy: "\n")
            if lines.count > 1 {
                Text(lines.dropFirst().joined(separator: "\n"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func parsePredictionContent(_ content: String) -> (homeTeam: String, score: String, awayTeam: String) {
        // Strip emoji prefix and known phrases
        let firstLine = content.components(separatedBy: "\n").first ?? content
        var cleaned = firstLine
        for prefix in ["🎯 Nailed it! ", "✓ Called it! ", "🎯 ", "✓ "] {
            if cleaned.hasPrefix(prefix) {
                cleaned = String(cleaned.dropFirst(prefix.count))
                break
            }
        }
        // Remove trailing phrases
        for suffix in [" — exact score!", " — missed this one"] {
            if cleaned.hasSuffix(suffix) {
                cleaned = String(cleaned.dropLast(suffix.count))
            }
        }

        // Parse "TeamA X - Y TeamB"
        let pattern = #"^(.+?)\s+(\d+\s*-\s*\d+)\s+(.+)$"#
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(in: cleaned, range: NSRange(cleaned.startIndex..., in: cleaned)) {
            let home = String(cleaned[Range(match.range(at: 1), in: cleaned)!])
            let score = String(cleaned[Range(match.range(at: 2), in: cleaned)!])
            let away = String(cleaned[Range(match.range(at: 3), in: cleaned)!])
            return (home, score, away)
        }

        return ("", "", cleaned)
    }

    // MARK: - Badges Card Body

    private var badgesCardBody: some View {
        // Parse: "🏆 Flexing my badges — Level 7 Scout with 6 badges!"
        let content = message.content
        let lines = content.components(separatedBy: "\n")
        let mainLine = lines.first ?? content
        let parsed = parseBadgeContent(mainLine)

        return VStack(spacing: 10) {
            // Level display
            HStack(spacing: 12) {
                Text("\(parsed.level)")
                    .font(.title.weight(.bold))
                    .foregroundStyle(.purple)
                    .frame(width: 44, height: 44)
                    .background(Color.purple.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 2) {
                    Text(parsed.levelName)
                        .font(.subheadline.weight(.bold))
                    Text("\(parsed.badgeCount) badge\(parsed.badgeCount != 1 ? "s" : "") earned")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }

            // User-added text
            if lines.count > 1 {
                Text(lines.dropFirst().joined(separator: "\n"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func parseBadgeContent(_ content: String) -> (level: Int, levelName: String, badgeCount: Int) {
        // "🏆 Flexing my badges — Level 7 Scout with 6 badges!"
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
        // Parse: "📊 Current standings — Leader leads with X pts!\n2. Name (pts), 3. Name (pts)"
        let lines = message.content.components(separatedBy: "\n")
        let parsed = parseStandingsContent(message.content)

        return VStack(alignment: .leading, spacing: 8) {
            // Leader row
            if let leader = parsed.first {
                HStack(spacing: 10) {
                    Text("1")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(Color.blue.gradient)
                        .clipShape(Circle())

                    Text(leader.name)
                        .font(.subheadline.weight(.bold))

                    Spacer()

                    Text("\(leader.points) pts")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.blue)
                }
            }

            // Runners-up
            ForEach(Array(parsed.dropFirst().enumerated()), id: \.offset) { idx, entry in
                HStack(spacing: 10) {
                    Text("\(idx + 2)")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .frame(width: 24, height: 24)

                    Text(entry.name)
                        .font(.caption)

                    Spacer()

                    Text("\(entry.points) pts")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }

            // User-added text (lines beyond the standings data)
            let extraLines = lines.dropFirst(parsed.isEmpty ? 0 : min(2, lines.count))
            if !extraLines.isEmpty {
                let extraText = extraLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                if !extraText.isEmpty {
                    Text(extraText)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func parseStandingsContent(_ content: String) -> [(name: String, points: Int)] {
        var results: [(name: String, points: Int)] = []
        let lines = content.components(separatedBy: "\n")

        // First line: "📊 Current standings — Leader leads with X pts!"
        if let firstLine = lines.first {
            let pattern = #"— (.+?) leads with (\d+) pts"#
            if let regex = try? NSRegularExpression(pattern: pattern),
               let match = regex.firstMatch(in: firstLine, range: NSRange(firstLine.startIndex..., in: firstLine)) {
                let name = String(firstLine[Range(match.range(at: 1), in: firstLine)!])
                let points = Int(firstLine[Range(match.range(at: 2), in: firstLine)!]) ?? 0
                results.append((name, points))
            }
        }

        // Second line: "2. Name (pts), 3. Name (pts), ..."
        if lines.count > 1 {
            let runnersLine = lines[1]
            let pattern = #"\d+\.\s+(.+?)\s+\((\d+)\)"#
            if let regex = try? NSRegularExpression(pattern: pattern) {
                let matches = regex.matches(in: runnersLine, range: NSRange(runnersLine.startIndex..., in: runnersLine))
                for match in matches {
                    let name = String(runnersLine[Range(match.range(at: 1), in: runnersLine)!])
                    let points = Int(runnersLine[Range(match.range(at: 2), in: runnersLine)!]) ?? 0
                    results.append((name, points))
                }
            }
        }

        return results
    }

    // MARK: - Helpers

    private func formatTime(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: dateString) else {
            formatter.formatOptions = [.withInternetDateTime]
            guard let date = formatter.date(from: dateString) else { return "" }
            return timeString(date)
        }
        return timeString(date)
    }

    private func timeString(_ date: Date) -> String {
        let tf = DateFormatter()
        tf.timeStyle = .short
        return tf.string(from: date)
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
        case .prediction: return .orange
        case .badges: return .purple
        case .standings: return .blue
        }
    }
}
