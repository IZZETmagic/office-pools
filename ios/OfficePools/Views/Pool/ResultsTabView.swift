import SwiftUI

// MARK: - Convenience Init (no header)

extension ResultsTabView where HeaderContent == EmptyView {
    init(matches: [Match]) {
        self.matches = matches
        self.headerContent = EmptyView()
    }
}

// MARK: - Filter Mode

enum FilterMode: String, CaseIterable {
    case date = "Date"
    case round = "Round"
    case team = "Team"
    case group = "Group"
}

// MARK: - Section Model

struct MatchSection: Identifiable {
    let id: String
    let label: String
    let matches: [Match]
}

// MARK: - Match Date Extension

extension Match {
    var parsedDate: Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = f.date(from: matchDate) { return date }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: matchDate)
    }
}

// MARK: - Results Tab View

struct ResultsTabView<HeaderContent: View>: View {
    let matches: [Match]
    let headerContent: HeaderContent

    init(matches: [Match], @ViewBuilder headerContent: () -> HeaderContent) {
        self.matches = matches
        self.headerContent = headerContent()
    }

    private var hasHeader: Bool {
        HeaderContent.self != EmptyView.self
    }

    @State private var filterMode: FilterMode = .date
    @State private var showingTeamPicker = false
    @State private var showingGroupPicker = false
    @State private var selectedTeamId: String?
    @State private var selectedTeamName: String?
    @State private var selectedGroupLetter: String?

    // MARK: - Computed Sections

    private var sections: [MatchSection] {
        switch filterMode {
        case .date:
            return dateSections(from: matches)
        case .round:
            return roundSections(from: matches)
        case .team:
            let filtered = selectedTeamId == nil ? matches : matches.filter {
                $0.homeTeamId == selectedTeamId || $0.awayTeamId == selectedTeamId
            }
            return dateSections(from: filtered)
        case .group:
            let filtered = selectedGroupLetter == nil ? matches.filter { $0.stage == "group" } : matches.filter {
                $0.groupLetter == selectedGroupLetter
            }
            return dateSections(from: filtered)
        }
    }

    private func dateSections(from matchList: [Match]) -> [MatchSection] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: matchList) { match -> Date in
            if let date = match.parsedDate {
                return calendar.startOfDay(for: date)
            }
            return Date.distantPast
        }

        return grouped.keys.sorted().map { dayStart in
            let dayMatches = grouped[dayStart]!.sorted { a, b in
                (a.parsedDate ?? .distantPast) < (b.parsedDate ?? .distantPast)
            }
            return MatchSection(
                id: dayStart.timeIntervalSince1970.description,
                label: dayLabel(for: dayStart),
                matches: dayMatches
            )
        }
    }

    private func roundSections(from matchList: [Match]) -> [MatchSection] {
        let roundOrder: [(keys: [String], label: String)] = [
            (["group"], "Group Stage"),
            (["round_32", "round_of_32"], "Round of 32"),
            (["round_16", "round_of_16"], "Round of 16"),
            (["quarter_final"], "Quarter Finals"),
            (["semi_final"], "Semi Finals"),
            (["third_place"], "Third Place"),
            (["final"], "Final"),
        ]

        return roundOrder.compactMap { round in
            let roundMatches = matchList
                .filter { round.keys.contains($0.stage) }
                .sorted { ($0.parsedDate ?? .distantPast) < ($1.parsedDate ?? .distantPast) }
            guard !roundMatches.isEmpty else { return nil }
            return MatchSection(id: round.label, label: round.label, matches: roundMatches)
        }
    }

    private func dayLabel(for date: Date) -> String {
        if date == .distantPast { return "Date TBD" }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInTomorrow(date) { return "Tomorrow" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMMM d"
        return formatter.string(from: date)
    }

    // MARK: - Available Teams & Groups

    private var availableTeams: [(id: String, name: String, flagUrl: String?)] {
        var seen = Set<String>()
        var teams: [(id: String, name: String, flagUrl: String?)] = []
        for match in matches {
            if let id = match.homeTeamId, let team = match.homeTeam, !seen.contains(id) {
                seen.insert(id)
                teams.append((id: id, name: team.countryName, flagUrl: team.flagUrl))
            }
            if let id = match.awayTeamId, let team = match.awayTeam, !seen.contains(id) {
                seen.insert(id)
                teams.append((id: id, name: team.countryName, flagUrl: team.flagUrl))
            }
        }
        return teams.sorted { $0.name < $1.name }
    }

    private var availableGroups: [(letter: String, matchCount: Int)] {
        let groupMatches = matches.filter { $0.stage == "group" && $0.groupLetter != nil }
        let grouped = Dictionary(grouping: groupMatches) { $0.groupLetter! }
        return grouped.keys.sorted().map { letter in
            (letter: letter, matchCount: grouped[letter]!.count)
        }
    }

    // MARK: - Body

    var body: some View {
        if matches.isEmpty {
            ContentUnavailableView(
                "No Matches",
                systemImage: "sportscourt",
                description: Text("Match results will appear here.")
            )
        } else {
            ZStack(alignment: .top) {
                if sections.isEmpty {
                    ContentUnavailableView(
                        "No Matches",
                        systemImage: "line.3.horizontal.decrease.circle",
                        description: Text("No matches for this filter.")
                    )
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 16) {
                                ForEach(sections) { section in
                                    VStack(spacing: 0) {
                                        // Section header inside card
                                        Text(section.label)
                                            .id(section.id)
                                            .font(.subheadline.weight(.semibold))
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .padding(.horizontal, 16)
                                            .padding(.vertical, 10)

                                        Divider()
                                            .padding(.horizontal, 12)

                                        // Matches (with date sub-headers in round mode)
                                        if filterMode == .round {
                                            roundMatchesWithDateHeaders(section.matches)
                                        } else {
                                            ForEach(section.matches) { match in
                                                NavigationLink(value: match) {
                                                    MatchResultRow(match: match)
                                                }
                                                .buttonStyle(.plain)
                                            }
                                        }
                                    }
                                    .background(Color(.systemBackground))
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
                                    .padding(.horizontal)
                                }
                            }
                            .padding(.top, hasHeader ? 100 : 52)
                            .padding(.bottom, 16)
                        }
                        .background(Color(.systemGroupedBackground))
                        .onAppear {
                            if filterMode == .date {
                                // Priority 1: Scroll to section containing a live match
                                if let liveSection = sections.first(where: { section in
                                    section.matches.contains { $0.status == "live" }
                                }) {
                                    proxy.scrollTo(liveSection.id, anchor: UnitPoint(x: 0.5, y: 0.18))
                                }
                                // Priority 2: Scroll to section with next scheduled match
                                else if let nextSection = sections.first(where: { section in
                                    section.matches.contains { $0.status == "scheduled" }
                                }) {
                                    proxy.scrollTo(nextSection.id, anchor: UnitPoint(x: 0.5, y: 0.18))
                                }
                                // Priority 3: Scroll to today
                                else if let todaySection = sections.first(where: { $0.label == "Today" }) {
                                    proxy.scrollTo(todaySection.id, anchor: UnitPoint(x: 0.5, y: 0.18))
                                }
                            }
                        }
                    }
                }

                // Sticky header + filter bar floating on top with glass
                VStack(spacing: 0) {
                    VStack(spacing: 0) {
                        if hasHeader {
                            VStack(spacing: 0) {
                                headerContent
                            }
                            .frame(maxWidth: .infinity)
                            .background(.ultraThinMaterial)
                        }
                        filterBar
                    }
                    Spacer()
                }
                .allowsHitTesting(true)
            }
            .sheet(isPresented: $showingTeamPicker) {
                TeamPickerSheet(
                    teams: availableTeams,
                    onSelect: { id, name in
                        selectedTeamId = id
                        selectedTeamName = name
                        filterMode = .team
                        showingTeamPicker = false
                    }
                )
            }
            .sheet(isPresented: $showingGroupPicker) {
                GroupPickerSheet(
                    groups: availableGroups,
                    onSelect: { letter in
                        selectedGroupLetter = letter
                        filterMode = .group
                        showingGroupPicker = false
                    }
                )
            }
        }
    }

    // MARK: - Round Matches with Date Sub-Headers

    @ViewBuilder
    private func roundMatchesWithDateHeaders(_ matches: [Match]) -> some View {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: matches) { match -> Date in
            if let date = match.parsedDate {
                return calendar.startOfDay(for: date)
            }
            return Date.distantPast
        }
        let sortedDays = grouped.keys.sorted()

        ForEach(sortedDays, id: \.self) { day in
            // Subtle date sub-header
            Text(dayLabel(for: day))
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 2)

            // Matches for this day
            let dayMatches = grouped[day]!.sorted { a, b in
                (a.parsedDate ?? .distantPast) < (b.parsedDate ?? .distantPast)
            }
            ForEach(dayMatches) { match in
                NavigationLink(value: match) {
                    MatchResultRow(match: match)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(FilterMode.allCases, id: \.self) { mode in
                    Button {
                        handleFilterTap(mode)
                    } label: {
                        HStack(spacing: 4) {
                            Text(pillLabel(for: mode))
                                .font(.caption.weight(filterMode == mode ? .semibold : .regular))

                            // Show X to clear or chevron to open
                            if mode == .team && filterMode == .team && selectedTeamId != nil {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 10))
                            } else if mode == .group && filterMode == .group && selectedGroupLetter != nil {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 10))
                            } else if mode == .team || mode == .group {
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 8, weight: .semibold))
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(.ultraThinMaterial, in: Capsule())
                        .foregroundStyle(filterMode == mode ? Color.accentColor : .primary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(
            LinearGradient(
                colors: [
                    Color(.systemBackground).opacity(0.7),
                    Color(.systemBackground).opacity(0.0)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    private func pillLabel(for mode: FilterMode) -> String {
        switch mode {
        case .date: return "Date"
        case .round: return "Round"
        case .team:
            if filterMode == .team, let name = selectedTeamName {
                return name
            }
            return "Team"
        case .group:
            if filterMode == .group, let letter = selectedGroupLetter {
                return "Group \(letter)"
            }
            return "Group"
        }
    }

    private func handleFilterTap(_ mode: FilterMode) {
        switch mode {
        case .date:
            filterMode = .date
        case .round:
            filterMode = .round
        case .team:
            if filterMode == .team && selectedTeamId != nil {
                // Clear selection
                selectedTeamId = nil
                selectedTeamName = nil
                filterMode = .date
            } else {
                showingTeamPicker = true
            }
        case .group:
            if filterMode == .group && selectedGroupLetter != nil {
                // Clear selection
                selectedGroupLetter = nil
                filterMode = .date
            } else {
                showingGroupPicker = true
            }
        }
    }
}

// MARK: - Team Picker Sheet

struct TeamPickerSheet: View {
    let teams: [(id: String, name: String, flagUrl: String?)]
    let onSelect: (String, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    private var filteredTeams: [(id: String, name: String, flagUrl: String?)] {
        if searchText.isEmpty { return teams }
        return teams.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationStack {
            List(filteredTeams, id: \.id) { team in
                Button {
                    onSelect(team.id, team.name)
                } label: {
                    HStack(spacing: 10) {
                        if let flagUrl = team.flagUrl, let url = URL(string: flagUrl) {
                            AsyncImage(url: url) { image in
                                image.resizable().scaledToFit()
                            } placeholder: {
                                Color.clear
                            }
                            .frame(width: 28, height: 18)
                            .clipShape(RoundedRectangle(cornerRadius: 2))
                        }

                        Text(team.name)
                            .foregroundStyle(.primary)
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search teams")
            .navigationTitle("Select Team")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Group Picker Sheet

struct GroupPickerSheet: View {
    let groups: [(letter: String, matchCount: Int)]
    let onSelect: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(groups, id: \.letter) { group in
                Button {
                    onSelect(group.letter)
                } label: {
                    HStack {
                        Text("Group \(group.letter)")
                            .foregroundStyle(.primary)
                            .font(.body.weight(.medium))

                        Spacer()

                        Text("\(group.matchCount) matches")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Select Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Match Result Row

struct MatchResultRow: View {
    let match: Match

    private var matchTime: String {
        guard let date = match.parsedDate else { return "--:--" }
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    private var isLive: Bool {
        match.status == "live"
    }

    private var isFinished: Bool {
        match.isCompleted || match.status == "completed"
    }

    var body: some View {
        HStack(spacing: 0) {
            // Home team (right-aligned: name then flag)
            HStack(spacing: 6) {
                Text(match.homeDisplayName)
                    .font(.subheadline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                flagView(url: match.homeTeam?.flagUrl)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)

            // Center: time or score
            centerContent
                .frame(width: 74)

            // Away team (left-aligned: flag then name)
            HStack(spacing: 6) {
                flagView(url: match.awayTeam?.flagUrl)

                Text(match.awayDisplayName)
                    .font(.subheadline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Center Content

    @ViewBuilder
    private var centerContent: some View {
        if isLive {
            VStack(spacing: 3) {
                HStack(spacing: 3) {
                    Text("\(match.homeScoreFt ?? 0)")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                    Text("-")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.secondary)
                    Text("\(match.awayScoreFt ?? 0)")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                }

                HStack(spacing: 3) {
                    Circle()
                        .fill(.red)
                        .frame(width: 5, height: 5)
                        .modifier(PulsingModifier())

                    Text("LIVE")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.red)
                }
            }
        } else if isFinished {
            VStack(spacing: 2) {
                HStack(spacing: 3) {
                    Text("\(match.homeScoreFt ?? 0)")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                    Text("-")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.secondary)
                    Text("\(match.awayScoreFt ?? 0)")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                }

                if let homePso = match.homeScorePso, let awayPso = match.awayScorePso {
                    Text("(\(homePso)-\(awayPso) PSO)")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(.purple)
                }
            }
        } else {
            Text(matchTime)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Flag View

    @ViewBuilder
    private func flagView(url: String?) -> some View {
        if let flagUrl = url, let imageUrl = URL(string: flagUrl) {
            AsyncImage(url: imageUrl) { image in
                image.resizable().scaledToFit()
            } placeholder: {
                Color.clear
            }
            .frame(width: 24, height: 16)
            .clipShape(RoundedRectangle(cornerRadius: 2))
        } else {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(.systemGray5))
                .frame(width: 24, height: 16)
        }
    }
}
