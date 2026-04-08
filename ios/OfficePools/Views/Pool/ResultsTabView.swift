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
            VStack(spacing: 12) {
                Image(systemName: "sportscourt")
                    .font(.system(size: 36))
                    .foregroundStyle(Color.sp.mist)
                Text("No Matches")
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.ink)
                Text("Match results will appear here.")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.sp.snow)
        } else {
            Group {
                if sections.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                            .font(.system(size: 36))
                            .foregroundStyle(Color.sp.mist)
                        Text("No Matches")
                            .font(SPTypography.cardTitle)
                            .foregroundStyle(Color.sp.ink)
                        Text("No matches for this filter.")
                            .font(SPTypography.body)
                            .foregroundStyle(Color.sp.slate)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.sp.snow)
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 12, pinnedViews: [.sectionHeaders]) {
                                Section {
                                    ForEach(sections) { section in
                                        VStack(spacing: 0) {
                                            Text(section.label)
                                                .font(.system(size: 14, weight: .bold, design: .rounded))
                                                .foregroundStyle(Color.sp.ink)
                                                .frame(maxWidth: .infinity, alignment: .leading)
                                                .id(section.id)
                                            .padding(.horizontal, 16)
                                            .padding(.top, 14)
                                            .padding(.bottom, 10)

                                            Rectangle()
                                                .fill(Color.sp.mist)
                                                .frame(height: 0.5)
                                                .padding(.horizontal, 14)

                                            if filterMode == .round {
                                                roundMatchesWithDateHeaders(section.matches)
                                            } else {
                                                ForEach(Array(section.matches.enumerated()), id: \.element.id) { index, match in
                                                    NavigationLink(value: match) {
                                                        MatchResultRow(match: match)
                                                    }
                                                    .buttonStyle(.plain)

                                                    if index < section.matches.count - 1 {
                                                        Rectangle()
                                                            .fill(Color.sp.mist.opacity(0.5))
                                                            .frame(height: 0.5)
                                                            .padding(.horizontal, 14)
                                                    }
                                                }
                                            }

                                            Spacer().frame(height: 4)
                                        }
                                        .background(Color.white)
                                        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
                                        .padding(.horizontal, 20)
                                    }
                                } header: {
                                    filterBar
                                        .padding(.horizontal, 20)
                                        .padding(.vertical, 8)
                                        .background(Color.sp.snow)
                                }
                            }
                            .padding(.bottom, 16)
                        }
                        .background(Color.sp.snow)
                        .onAppear {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                                if filterMode == .date {
                                    if let liveSection = sections.first(where: { section in
                                        section.matches.contains { $0.status == "live" }
                                    }) {
                                        withAnimation(.easeOut(duration: 0.3)) {
                                            proxy.scrollTo(liveSection.id, anchor: UnitPoint(x: 0.5, y: 0.18))
                                        }
                                    }
                                    else if let nextSection = sections.first(where: { section in
                                        section.matches.contains { $0.status == "scheduled" }
                                    }) {
                                        withAnimation(.easeOut(duration: 0.3)) {
                                            proxy.scrollTo(nextSection.id, anchor: UnitPoint(x: 0.5, y: 0.18))
                                        }
                                    }
                                    else if let todaySection = sections.first(where: { $0.label == "Today" }) {
                                        withAnimation(.easeOut(duration: 0.3)) {
                                            proxy.scrollTo(todaySection.id, anchor: UnitPoint(x: 0.5, y: 0.18))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
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
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 2)

            // Matches for this day
            let dayMatches = grouped[day]!.sorted { a, b in
                (a.parsedDate ?? .distantPast) < (b.parsedDate ?? .distantPast)
            }
            ForEach(Array(dayMatches.enumerated()), id: \.element.id) { index, match in
                NavigationLink(value: match) {
                    MatchResultRow(match: match)
                }
                .buttonStyle(.plain)

                if index < dayMatches.count - 1 {
                    Rectangle()
                        .fill(Color.sp.mist.opacity(0.5))
                        .frame(height: 0.5)
                        .padding(.horizontal, 14)
                }
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
                                .font(.system(size: 13, weight: filterMode == mode ? .semibold : .medium, design: .rounded))

                            // Show X to clear or chevron to open
                            if mode == .team && filterMode == .team && selectedTeamId != nil {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 11))
                            } else if mode == .group && filterMode == .group && selectedGroupLetter != nil {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 11))
                            } else if mode == .team || mode == .group {
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 8, weight: .semibold))
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(
                            filterMode == mode
                                ? AnyShapeStyle(Color.sp.primary.opacity(0.1))
                                : AnyShapeStyle(.ultraThinMaterial),
                            in: Capsule()
                        )
                        .foregroundStyle(filterMode == mode ? Color.sp.primary : Color.sp.ink)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
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
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(filteredTeams, id: \.id) { team in
                        Button {
                            onSelect(team.id, team.name)
                        } label: {
                            HStack(spacing: 12) {
                                if let flagUrl = team.flagUrl, let url = URL(string: flagUrl) {
                                    CachedAsyncImage(url: url, width: 30, height: 20, cornerRadius: 3)
                                } else {
                                    RoundedRectangle(cornerRadius: 3)
                                        .fill(Color.sp.mist)
                                        .frame(width: 30, height: 20)
                                }

                                Text(team.name)
                                    .font(.system(size: 15, weight: .medium, design: .rounded))
                                    .foregroundStyle(Color.sp.ink)

                                Spacer()

                                Image(systemName: "chevron.right")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(Color.sp.mist)
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 14)
                        }
                        .buttonStyle(.plain)

                        Rectangle()
                            .fill(Color.sp.mist.opacity(0.5))
                            .frame(height: 0.5)
                            .padding(.horizontal, 20)
                    }
                }
            }
            .background(Color.sp.snow)
            .searchable(text: $searchText, prompt: "Search teams")
            .navigationTitle("Select Team")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.sp.primary)
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
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(groups, id: \.letter) { group in
                        Button {
                            onSelect(group.letter)
                        } label: {
                            HStack {
                                Text("Group \(group.letter)")
                                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                                    .foregroundStyle(Color.sp.ink)

                                Spacer()

                                Text("\(group.matchCount) matches")
                                    .font(.system(size: 12, weight: .medium, design: .rounded))
                                    .foregroundStyle(Color.sp.slate)

                                Image(systemName: "chevron.right")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(Color.sp.mist)
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 16)
                        }
                        .buttonStyle(.plain)

                        Rectangle()
                            .fill(Color.sp.mist.opacity(0.5))
                            .frame(height: 0.5)
                            .padding(.horizontal, 20)
                    }
                }
            }
            .background(Color.sp.snow)
            .navigationTitle("Select Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.sp.primary)
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
            HStack(spacing: 8) {
                Text(match.homeDisplayName)
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.sp.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                flagView(url: match.homeTeam?.flagUrl)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)

            // Center: time or score
            centerContent
                .frame(width: 74)

            // Away team (left-aligned: flag then name)
            HStack(spacing: 8) {
                flagView(url: match.awayTeam?.flagUrl)

                Text(match.awayDisplayName)
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.sp.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    // MARK: - Center Content

    @ViewBuilder
    private var centerContent: some View {
        if isLive {
            VStack(spacing: 3) {
                HStack(spacing: 3) {
                    Text("\(match.homeScoreFt ?? 0)")
                        .font(SPTypography.mono(size: 15, weight: .bold))
                        .foregroundStyle(Color.sp.ink)
                    Text("-")
                        .font(SPTypography.mono(size: 15, weight: .bold))
                        .foregroundStyle(Color.sp.slate)
                    Text("\(match.awayScoreFt ?? 0)")
                        .font(SPTypography.mono(size: 15, weight: .bold))
                        .foregroundStyle(Color.sp.ink)
                }

                HStack(spacing: 3) {
                    Circle()
                        .fill(Color.sp.red)
                        .frame(width: 5, height: 5)
                        .modifier(PulsingModifier())

                    Text("LIVE")
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.sp.red)
                }
            }
        } else if isFinished {
            VStack(spacing: 2) {
                HStack(spacing: 3) {
                    Text("\(match.homeScoreFt ?? 0)")
                        .font(SPTypography.mono(size: 15, weight: .bold))
                        .foregroundStyle(Color.sp.ink)
                    Text("-")
                        .font(SPTypography.mono(size: 15, weight: .bold))
                        .foregroundStyle(Color.sp.slate)
                    Text("\(match.awayScoreFt ?? 0)")
                        .font(SPTypography.mono(size: 15, weight: .bold))
                        .foregroundStyle(Color.sp.ink)
                }

                if let homePso = match.homeScorePso, let awayPso = match.awayScorePso {
                    Text("(\(homePso)-\(awayPso) PSO)")
                        .font(.system(size: 9, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.sp.primary)
                }
            }
        } else {
            Text(matchTime)
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
        }
    }

    // MARK: - Flag View

    @ViewBuilder
    private func flagView(url: String?) -> some View {
        if let flagUrl = url, let imageUrl = URL(string: flagUrl) {
            CachedAsyncImage(url: imageUrl, width: 26, height: 18, cornerRadius: 3)
        } else {
            RoundedRectangle(cornerRadius: 3)
                .fill(Color.sp.mist)
                .frame(width: 26, height: 18)
        }
    }
}
