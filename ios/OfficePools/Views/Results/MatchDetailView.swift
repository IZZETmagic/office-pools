import SwiftUI

struct MatchDetailView: View {
    let initialMatch: Match
    let authService: AuthService

    @State private var viewModel: MatchDetailViewModel

    init(match: Match, authService: AuthService) {
        self.initialMatch = match
        self.authService = authService
        self._viewModel = State(initialValue: MatchDetailViewModel(match: match))
    }

    @State private var headerHeight: CGFloat = 140
    @State private var sectionsAppeared = false

    /// Use viewModel.match for live-updating data
    private var match: Match { viewModel.match }
    private var isLive: Bool { match.status == "live" }
    private var isFinished: Bool { match.isCompleted || match.status == "completed" }

    var body: some View {
        ZStack(alignment: .top) {
            // MARK: - Scrollable Content (behind header)
            if viewModel.isLoading && viewModel.predictionInfos.isEmpty {
                ScrollView {
                    MatchDetailSkeletonView(isGroupMatch: match.groupLetter != nil)
                        .padding(.top, headerHeight + 16)
                        .padding(.bottom, 24)
                }
                .background(Color.sp.snow)
                .transition(.opacity)
            } else {
                ScrollView {
                    VStack(spacing: 16) {
                        matchInfo
                            .entranceAnimation(sectionsAppeared, delay: 0.0)
                        if !viewModel.groupStandings.isEmpty {
                            groupStandingsSection
                                .entranceAnimation(sectionsAppeared, delay: 0.05)
                        }
                        if let stats = viewModel.matchStats, stats.totalPredictions > 0 {
                            predictionStatsSection(stats)
                                .entranceAnimation(sectionsAppeared, delay: 0.10)
                        }
                        predictionsSection
                            .entranceAnimation(sectionsAppeared, delay: 0.15)
                    }
                    .padding(.top, headerHeight + 16)
                    .padding(.bottom, 24)
                }
                .background(Color.sp.snow)
                .transition(.opacity)
            }

            // MARK: - Fixed Header (floats on top with glass)
            matchHeader
        }
        .animation(.easeInOut(duration: 0.3), value: viewModel.isLoading)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let userId = authService.appUser?.userId {
                await viewModel.loadPredictions(userId: userId)
                await viewModel.subscribeToMatchUpdates()
                triggerEntranceAnimations()
            }
        }
        .onDisappear {
            Task { await viewModel.unsubscribeFromMatchUpdates() }
        }
        .refreshable {
            if let userId = authService.appUser?.userId {
                await viewModel.loadPredictions(userId: userId)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
    }

    private func triggerEntranceAnimations() {
        guard !sectionsAppeared else { return }
        withAnimation(.easeOut(duration: 0.45)) {
            sectionsAppeared = true
        }
    }

    // MARK: - Match Header (Fixed)

    private var matchHeader: some View {
        VStack(spacing: 10) {
            // Stage pill
            Text(shortStageLabel)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.sp.primary)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Color.sp.primary.opacity(0.1), in: Capsule())

            // Teams + Score/Time
            HStack(spacing: 0) {
                // Home team
                VStack(spacing: 6) {
                    flagView(url: match.homeTeam?.flagUrl, size: 56)
                    Text(match.homeDisplayName)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.sp.ink)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity)

                // Center: score or time
                VStack(spacing: 4) {
                    if isLive {
                        HStack(spacing: 6) {
                            Text("\(match.homeScoreFt ?? 0)")
                                .font(SPTypography.mono(size: 28, weight: .bold))
                                .foregroundStyle(Color.sp.ink)
                            Text("-")
                                .font(SPTypography.mono(size: 28, weight: .bold))
                                .foregroundStyle(Color.sp.slate)
                            Text("\(match.awayScoreFt ?? 0)")
                                .font(SPTypography.mono(size: 28, weight: .bold))
                                .foregroundStyle(Color.sp.ink)
                        }
                        HStack(spacing: 4) {
                            Circle()
                                .fill(Color.sp.red)
                                .frame(width: 6, height: 6)
                                .modifier(PulsingModifier())
                            Text("LIVE")
                                .font(.system(size: 11, weight: .bold, design: .rounded))
                                .foregroundStyle(Color.sp.red)
                        }
                    } else if isFinished {
                        HStack(spacing: 6) {
                            Text("\(match.homeScoreFt ?? 0)")
                                .font(SPTypography.mono(size: 28, weight: .bold))
                                .foregroundStyle(Color.sp.ink)
                            Text("-")
                                .font(SPTypography.mono(size: 28, weight: .bold))
                                .foregroundStyle(Color.sp.slate)
                            Text("\(match.awayScoreFt ?? 0)")
                                .font(SPTypography.mono(size: 28, weight: .bold))
                                .foregroundStyle(Color.sp.ink)
                        }
                        if let homePso = match.homeScorePso, let awayPso = match.awayScorePso {
                            Text("(\(homePso)-\(awayPso) PSO)")
                                .font(.system(size: 11, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.sp.primary)
                        }
                        Text("Full Time")
                            .font(.system(size: 10, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.sp.slate)
                    } else {
                        Text(formattedTime)
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.sp.ink)
                        Text(formattedShortDate)
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.sp.slate)
                    }
                }
                .frame(width: 100)

                // Away team
                VStack(spacing: 6) {
                    flagView(url: match.awayTeam?.flagUrl, size: 56)
                    Text(match.awayDisplayName)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.sp.ink)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 20)
        }
        .padding(.top, 12)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity)
        .background {
            ZStack {
                Color.sp.primary.opacity(0.08)
                    .background(.ultraThinMaterial)
            }
            .ignoresSafeArea(edges: .top)
        }
        .overlay(
            GeometryReader { geo in
                Color.clear
                    .onAppear { headerHeight = geo.size.height }
                    .onChange(of: geo.size.height) { _, newHeight in
                        headerHeight = newHeight
                    }
            }
        )
    }

    // MARK: - Match Info

    private var matchInfo: some View {
        VStack(spacing: 0) {
            infoRow(icon: "sportscourt", label: stageLabel)

            Rectangle()
                .fill(Color.sp.mist.opacity(0.5))
                .frame(height: 0.5)
                .padding(.horizontal, 14)

            infoRow(icon: "calendar", label: formattedDate)

            if let venue = match.venue, !venue.isEmpty {
                Rectangle()
                    .fill(Color.sp.mist.opacity(0.5))
                    .frame(height: 0.5)
                    .padding(.horizontal, 14)

                infoRow(icon: "mappin.and.ellipse", label: venue)
            }
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        .padding(.horizontal, 20)
    }

    private func infoRow(icon: String, label: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color.sp.slate)
                .frame(width: 24)
            Text(label)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.ink)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Group Standings

    private var groupStandingsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Group \(match.groupLetter ?? "") Standings")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sp.ink)
                .padding(.horizontal, 20)

            VStack(spacing: 0) {
                // Header row
                HStack(spacing: 0) {
                    Text("#")
                        .frame(width: 24, alignment: .center)
                    Text("Team")
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("P")
                        .frame(width: 28, alignment: .center)
                    Text("GD")
                        .frame(width: 34, alignment: .center)
                    Text("Pts")
                        .frame(width: 34, alignment: .center)
                }
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.sp.slate)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)

                Rectangle()
                    .fill(Color.sp.mist)
                    .frame(height: 0.5)
                    .padding(.horizontal, 12)

                // Team rows
                ForEach(Array(viewModel.groupStandings.enumerated()), id: \.element.id) { index, standing in
                    HStack(spacing: 0) {
                        Text("\(index + 1)")
                            .font(SPTypography.mono(size: 12, weight: .bold))
                            .foregroundStyle(standingPositionColor(index + 1))
                            .frame(width: 24, alignment: .center)

                        if let flagUrl = viewModel.teamFlags[standing.teamId] {
                            CachedAsyncImage(url: URL(string: flagUrl), width: 22, height: 15, cornerRadius: 3)
                                .padding(.trailing, 8)
                        }

                        Text(standing.teamName)
                            .font(.system(size: 13, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.sp.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        Text("\(standing.played)")
                            .font(SPTypography.mono(size: 12, weight: .medium))
                            .foregroundStyle(Color.sp.slate)
                            .frame(width: 28, alignment: .center)

                        Text(gdString(standing.goalDifference))
                            .font(SPTypography.mono(size: 12, weight: .medium))
                            .foregroundStyle(standing.goalDifference > 0 ? Color.sp.green : standing.goalDifference < 0 ? Color.sp.red : Color.sp.slate)
                            .frame(width: 34, alignment: .center)

                        Text("\(standing.points)")
                            .font(SPTypography.mono(size: 13, weight: .bold))
                            .foregroundStyle(Color.sp.ink)
                            .frame(width: 34, alignment: .center)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(standingRowBackground(index + 1))

                    if index < viewModel.groupStandings.count - 1 {
                        Rectangle()
                            .fill(Color.sp.mist.opacity(0.5))
                            .frame(height: 0.5)
                            .padding(.horizontal, 12)
                    }
                }
            }
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            .padding(.horizontal, 20)
        }
    }

    private func standingPositionColor(_ position: Int) -> Color {
        switch position {
        case 1, 2: return Color.sp.green
        case 3: return Color.sp.amber
        default: return Color.sp.slate
        }
    }

    private func standingRowBackground(_ position: Int) -> Color {
        switch position {
        case 1, 2: return Color.sp.green.opacity(0.04)
        case 3: return Color.sp.amber.opacity(0.04)
        default: return .clear
        }
    }

    private func gdString(_ gd: Int) -> String {
        if gd > 0 { return "+\(gd)" }
        return "\(gd)"
    }

    // MARK: - Prediction Stats Section

    private func predictionStatsSection(_ stats: MatchStatsResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("How Others Predicted")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sp.ink)
                .padding(.horizontal, 20)

            // Result distribution bar
            resultDistributionCard(stats)

            // Top predicted scores
            if !stats.topScores.isEmpty {
                topScoresCard(stats)
            }

            // Accuracy stats (only if match is completed)
            if stats.exactCorrectPct != nil || stats.resultCorrectPct != nil {
                accuracyCard(stats)
            }
        }
    }

    private func resultDistributionCard(_ stats: MatchStatsResponse) -> some View {
        VStack(spacing: 12) {
            // Total predictions count
            HStack {
                Text("\(stats.totalPredictions) predictions")
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.sp.slate)
                Spacer()
            }

            // Three-segment bar
            resultBar(stats)

            // Labels
            HStack {
                resultLabel(
                    match.homeTeam?.countryName ?? stats.homeTeam ?? "Home",
                    pct: stats.homeWinPct,
                    color: Color.sp.primary
                )
                Spacer()
                resultLabel("Draw", pct: stats.drawPct, color: Color.sp.slate)
                Spacer()
                resultLabel(
                    match.awayTeam?.countryName ?? stats.awayTeam ?? "Away",
                    pct: stats.awayWinPct,
                    color: Color.sp.red
                )
            }
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        .padding(.horizontal, 20)
    }

    private func resultBar(_ stats: MatchStatsResponse) -> some View {
        GeometryReader { geo in
            let width = geo.size.width
            let homeW = width * stats.homeWinPct
            let drawW = width * stats.drawPct
            let awayW = width * stats.awayWinPct

            HStack(spacing: 2) {
                if stats.homeWinPct > 0 {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.sp.primary)
                        .frame(width: max(homeW, 4))
                }
                if stats.drawPct > 0 {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.sp.slate.opacity(0.4))
                        .frame(width: max(drawW, 4))
                }
                if stats.awayWinPct > 0 {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.sp.red)
                        .frame(width: max(awayW, 4))
                }
            }
        }
        .frame(height: 8)
    }

    private func resultLabel(_ team: String, pct: Double, color: Color) -> some View {
        VStack(spacing: 2) {
            Text("\(Int(pct * 100))%")
                .font(SPTypography.mono(size: 20, weight: .bold))
                .foregroundStyle(color)
            Text(team)
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
                .lineLimit(1)
        }
    }

    private func topScoresCard(_ stats: MatchStatsResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Most Predicted Scores")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sp.ink)

            ForEach(stats.topScores.prefix(5)) { score in
                HStack {
                    Text("\(score.home) - \(score.away)")
                        .font(SPTypography.mono(size: 14, weight: .semibold))
                        .foregroundStyle(Color.sp.ink)

                    GeometryReader { geo in
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.sp.primary.opacity(0.15))
                            .frame(width: geo.size.width * score.pct)
                    }
                    .frame(height: 6)

                    Text("\(score.count)")
                        .font(SPTypography.mono(size: 11, weight: .medium))
                        .foregroundStyle(Color.sp.slate)
                        .frame(width: 28, alignment: .trailing)

                    Text("(\(Int(score.pct * 100))%)")
                        .font(.system(size: 10, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.sp.slate)
                        .frame(width: 36, alignment: .trailing)
                }
            }
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        .padding(.horizontal, 20)
    }

    private func accuracyCard(_ stats: MatchStatsResponse) -> some View {
        HStack(spacing: 16) {
            if let exactPct = stats.exactCorrectPct {
                accuracyStat("Exact Score", pct: exactPct, color: Color.sp.accent)
            }
            if let resultPct = stats.resultCorrectPct {
                accuracyStat("Correct Result", pct: resultPct, color: Color.sp.primary)
            }
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        .padding(.horizontal, 20)
    }

    private func accuracyStat(_ label: String, pct: Double, color: Color) -> some View {
        VStack(spacing: 4) {
            Text("\(Int(pct * 100))%")
                .font(SPTypography.mono(size: 24, weight: .bold))
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Predictions Section

    /// Group prediction infos by pool name, preserving order.
    private var groupedPredictions: [(poolName: String, entries: [MatchPredictionInfo])] {
        var order: [String] = []
        var grouped: [String: [MatchPredictionInfo]] = [:]
        for info in viewModel.predictionInfos {
            if grouped[info.poolName] == nil {
                order.append(info.poolName)
            }
            grouped[info.poolName, default: []].append(info)
        }
        return order.map { (poolName: $0, entries: grouped[$0]!) }
    }

    private var predictionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your Predictions")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sp.ink)
                .padding(.horizontal, 20)

            if viewModel.predictionInfos.isEmpty && !viewModel.isLoading {
                VStack(spacing: 10) {
                    Image(systemName: "sportscourt")
                        .font(.system(size: 32))
                        .foregroundStyle(Color.sp.silver)
                    Text("No predictions yet")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.sp.ink)
                    Text("Join a pool and make your prediction for this match")
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.sp.slate)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 20)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
                .padding(.horizontal, 20)
            } else if !viewModel.predictionInfos.isEmpty {
                ForEach(groupedPredictions, id: \.poolName) { group in
                    VStack(spacing: 0) {
                        // Pool name header
                        HStack {
                            Text(group.poolName)
                                .font(.system(size: 14, weight: .bold, design: .rounded))
                                .foregroundStyle(Color.sp.ink)
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 14)
                        .padding(.bottom, 10)

                        Rectangle()
                            .fill(Color.sp.mist)
                            .frame(height: 0.5)
                            .padding(.horizontal, 14)

                        // Entry rows
                        ForEach(Array(group.entries.enumerated()), id: \.element.id) { index, info in
                            predictionRow(info: info)

                            if index < group.entries.count - 1 {
                                Rectangle()
                                    .fill(Color.sp.mist.opacity(0.5))
                                    .frame(height: 0.5)
                                    .padding(.horizontal, 14)
                            }
                        }

                        Spacer().frame(height: 4)
                    }
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
                    .padding(.horizontal, 20)
                }
            }
        }
    }

    private var isKnockout: Bool {
        match.groupLetter == nil
    }

    private func predictionRow(info: MatchPredictionInfo) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            // Top line: entry name, then badge + points right-aligned
            HStack {
                Text(info.entryName)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.sp.ink)

                Spacer()

                if (isFinished || isLive), info.prediction != nil {
                    resultBadge(for: info)

                    // Prefer breakdown points (accounts for team mismatch) over client-calculated
                    let pts = info.breakdownPoints ?? info.matchPoints
                    if let pts = pts {
                        Text("+\(pts) pts")
                            .font(SPTypography.mono(size: 12, weight: .bold))
                            .foregroundStyle(pts > 0 ? Color.sp.green : Color.sp.slate)
                    }
                }
            }

            // Bottom line: teams and score, right-aligned
            if let pred = info.prediction {
                HStack(spacing: 4) {
                    Spacer()

                    if isKnockout {
                        Text(info.predictedHomeTeam ?? match.homeDisplayName)
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.sp.slate)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }

                    Text("\(pred.predictedHomeScore)")
                        .font(SPTypography.mono(size: 15, weight: .bold))
                        .foregroundStyle(Color.sp.ink)
                    Text("-")
                        .font(SPTypography.mono(size: 13, weight: .bold))
                        .foregroundStyle(Color.sp.mist)
                    Text("\(pred.predictedAwayScore)")
                        .font(SPTypography.mono(size: 15, weight: .bold))
                        .foregroundStyle(Color.sp.ink)

                    if isKnockout {
                        Text(info.predictedAwayTeam ?? match.awayDisplayName)
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.sp.slate)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }

                    if let homePso = pred.predictedHomePso, let awayPso = pred.predictedAwayPso {
                        Text("(\(homePso)-\(awayPso) PSO)")
                            .font(SPTypography.mono(size: 10, weight: .medium))
                            .foregroundStyle(Color.sp.primary)
                    }
                }
            } else {
                HStack {
                    Spacer()
                    Text("Not predicted")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.sp.silver)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 3)
                        .background(Color.sp.mist.opacity(0.5), in: Capsule())
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }


    // MARK: - Result Badge

    @ViewBuilder
    private func resultBadge(for info: MatchPredictionInfo) -> some View {
        let type = resultType(for: info)
        Text(type.label)
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(type.color.opacity(0.12), in: Capsule())
            .foregroundStyle(type.color)
    }

    private func resultType(for info: MatchPredictionInfo) -> (label: String, color: Color) {
        // For knockout matches with breakdown data, use the server's result type
        if let breakdownType = info.breakdownResultType, isKnockout {
            if let teamsMatch = info.teamsMatch, !teamsMatch {
                return ("Wrong Teams", Color.sp.amber)
            }
            return breakdownResultLabel(breakdownType)
        }

        // Fallback: client-side calculation
        guard let pred = info.prediction,
              let homeActual = match.homeScoreFt,
              let awayActual = match.awayScoreFt else {
            return ("Pending", Color.sp.amber)
        }

        let predHome = pred.predictedHomeScore
        let predAway = pred.predictedAwayScore

        if predHome == homeActual && predAway == awayActual {
            return ("Exact", Color.sp.accent)
        }

        let actualOutcome = homeActual == awayActual ? 0 : (homeActual > awayActual ? 1 : -1)
        let predOutcome = predHome == predAway ? 0 : (predHome > predAway ? 1 : -1)

        if actualOutcome == predOutcome {
            let actualGD = homeActual - awayActual
            let predGD = predHome - predAway
            if actualGD == predGD {
                return ("Winner+GD", Color.sp.green)
            }
            return ("Winner", Color.sp.primary)
        }

        return ("Miss", Color.sp.red)
    }

    private func breakdownResultLabel(_ type: String) -> (label: String, color: Color) {
        switch type {
        case "exact": return ("Exact", Color.sp.accent)
        case "winner_gd": return ("Winner+GD", Color.sp.green)
        case "winner": return ("Winner", Color.sp.primary)
        case "miss": return ("Miss", Color.sp.red)
        case "wrong_teams": return ("Wrong Teams", Color.sp.amber)
        default: return (type.capitalized, Color.sp.slate)
        }
    }

    // MARK: - Helpers

    private var shortStageLabel: String {
        if let group = match.groupLetter {
            return "Group \(group) · #\(match.matchNumber)"
        }
        switch match.stage {
        case "round_32", "round_of_32": return "R32 · #\(match.matchNumber)"
        case "round_16", "round_of_16": return "R16 · #\(match.matchNumber)"
        case "quarter_final": return "QF · #\(match.matchNumber)"
        case "semi_final": return "SF · #\(match.matchNumber)"
        case "third_place": return "3rd Place · #\(match.matchNumber)"
        case "final": return "Final · #\(match.matchNumber)"
        default: return "#\(match.matchNumber)"
        }
    }

    private var stageLabel: String {
        var label: String
        if let group = match.groupLetter {
            label = "Group \(group)"
        } else {
            switch match.stage {
            case "round_32", "round_of_32": label = "Round of 32"
            case "round_16", "round_of_16": label = "Round of 16"
            case "quarter_final": label = "Quarter Finals"
            case "semi_final": label = "Semi Finals"
            case "third_place": label = "Third Place"
            case "final": label = "Final"
            default: label = match.stage.replacingOccurrences(of: "_", with: " ").capitalized
            }
        }
        return "\(label) · Match #\(match.matchNumber)"
    }

    private var formattedDate: String {
        guard let date = match.parsedDate else { return match.matchDate }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMMM d 'at' h:mm a"
        return formatter.string(from: date)
    }

    private var formattedShortDate: String {
        guard let date = match.parsedDate else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }

    private var formattedTime: String {
        guard let date = match.parsedDate else { return "--:--" }
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    @ViewBuilder
    private func flagView(url: String?, size: CGFloat) -> some View {
        let width = size
        let height = size * 0.67
        if let flagUrl = url, let imageUrl = URL(string: flagUrl) {
            CachedAsyncImage(url: imageUrl, width: width, height: height, cornerRadius: 4)
        } else {
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.sp.mist)
                .frame(width: width, height: height)
        }
    }
}
