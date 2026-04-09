import SwiftUI

/// Pool performance cards and accuracy breakdown rings for the Profile tab.
struct ProfileStatsSection: View {
    let poolStats: [ProfileViewModel.PoolStat]
    let ringsAnimated: Bool

    var body: some View {
        VStack(spacing: 24) {
            poolPerformanceSection
            accuracyBreakdownSection
        }
    }

    // MARK: - Pool Performance

    private var poolPerformanceSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Pool Performance")
                .font(SPTypography.sectionHeader)
                .foregroundStyle(Color.sp.ink)
                .padding(.horizontal, 20)

            VStack(spacing: 0) {
                ForEach(Array(poolStats.enumerated()), id: \.element.id) { index, stat in
                    poolStatRow(stat)

                    if index < poolStats.count - 1 {
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
        }
    }

    private func poolStatRow(_ stat: ProfileViewModel.PoolStat) -> some View {
        VStack(spacing: 10) {
            HStack {
                Text(stat.poolName)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.sp.ink)
                    .lineLimit(1)
                Spacer()
                if let rank = stat.rank {
                    HStack(spacing: 3) {
                        if rank <= 3 {
                            Text(rankEmoji(rank))
                                .font(.system(size: 12))
                        }
                        Text("#\(rank)/\(stat.memberCount)")
                            .font(SPTypography.mono(size: 12, weight: .semibold))
                            .foregroundStyle(Color.sp.slate)
                    }
                }
            }

            if let rank = stat.rank, stat.memberCount > 1 {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.sp.mist)
                            .frame(height: 4)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(rankBarColor(rank, of: stat.memberCount))
                            .frame(width: geo.size.width * CGFloat(stat.memberCount - rank + 1) / CGFloat(stat.memberCount), height: 4)
                    }
                }
                .frame(height: 4)
            }

            HStack(spacing: 14) {
                miniStat(value: "\(stat.totalPoints)", label: "pts", color: Color.sp.primary)
                miniStat(value: "\(stat.predictionCount)", label: "pred", color: Color.sp.green)
                if let accuracy = stat.accuracy {
                    miniStat(
                        value: "\(accuracy)%",
                        label: "acc",
                        color: accuracy >= 70 ? Color.sp.green : accuracy >= 40 ? Color.sp.amber : Color.sp.slate
                    )
                }
                Spacer()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Accuracy Breakdown

    private var accuracyBreakdownSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Prediction Accuracy")
                .font(SPTypography.sectionHeader)
                .foregroundStyle(Color.sp.ink)
                .padding(.horizontal, 20)

            let totals = aggregatedTotals

            VStack(spacing: 14) {
                HStack(spacing: 0) {
                    ringColumn(value: totals.accuracy, label: "Accuracy", subtitle: "\(totals.correct)/\(totals.completed)", color: Color.sp.green)
                    ringColumn(
                        value: totals.completed > 0 ? Int(Double(totals.exact) / Double(totals.completed) * 100) : 0,
                        label: "Exact", subtitle: "\(totals.exact) scores", color: Color.sp.accent
                    )
                    ringColumn(value: totals.accuracy, label: "Hit Rate", subtitle: "\(totals.correct) wins", color: Color.sp.primary)
                }

                Rectangle()
                    .fill(Color.sp.mist.opacity(0.5))
                    .frame(height: 0.5)
                    .padding(.horizontal, 14)

                if totals.completed > 0 {
                    accuracyBar(totals)
                        .padding(.horizontal, 16)
                }

                VStack(spacing: 10) {
                    breakdownRow(label: "Exact Score", count: totals.exact, total: totals.completed, color: Color.sp.accent)
                    breakdownRow(label: "Correct Result", count: totals.correct - totals.exact, total: totals.completed, color: Color.sp.green)
                    breakdownRow(label: "Incorrect", count: totals.completed - totals.correct, total: totals.completed, color: Color.sp.red)
                }
                .padding(.horizontal, 16)
            }
            .padding(.vertical, 16)
            .background(Color.sp.surface)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Helpers

    private func ringColumn(value: Int, label: String, subtitle: String, color: Color) -> some View {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .stroke(color.opacity(0.12), lineWidth: 5)
                    .frame(width: 48, height: 48)
                Circle()
                    .trim(from: 0, to: ringsAnimated ? CGFloat(value) / 100 : 0)
                    .stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .frame(width: 48, height: 48)
                    .rotationEffect(.degrees(-90))
                    .animation(.easeOut(duration: 0.8), value: ringsAnimated)
                Text(ringsAnimated ? "\(value)%" : "0%")
                    .font(SPTypography.mono(size: 11, weight: .bold))
                    .foregroundStyle(Color.sp.ink)
                    .contentTransition(.numericText())
                    .animation(.easeOut(duration: 0.6), value: ringsAnimated)
            }
            Text(label)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.sp.ink)
            Text(subtitle)
                .font(.system(size: 9, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
        }
        .frame(maxWidth: .infinity)
    }

    private func accuracyBar(_ totals: AggregatedTotals) -> some View {
        GeometryReader { geo in
            let w = geo.size.width
            let total = max(totals.completed, 1)
            let exactW = w * CGFloat(totals.exact) / CGFloat(total)
            let correctW = w * CGFloat(totals.correct - totals.exact) / CGFloat(total)
            let missW = w * CGFloat(totals.completed - totals.correct) / CGFloat(total)

            HStack(spacing: 2) {
                if totals.exact > 0 {
                    RoundedRectangle(cornerRadius: 4).fill(Color.sp.accent).frame(width: max(exactW, 4))
                }
                if totals.correct - totals.exact > 0 {
                    RoundedRectangle(cornerRadius: 4).fill(Color.sp.green).frame(width: max(correctW, 4))
                }
                if totals.completed - totals.correct > 0 {
                    RoundedRectangle(cornerRadius: 4).fill(Color.sp.red.opacity(0.4)).frame(width: max(missW, 4))
                }
            }
        }
        .frame(height: 8)
    }

    private func breakdownRow(label: String, count: Int, total: Int, color: Color) -> some View {
        HStack {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.ink)
            Spacer()
            Text("\(count)")
                .font(SPTypography.mono(size: 13, weight: .bold))
                .foregroundStyle(Color.sp.ink)
            Text(total > 0 ? "(\(Int(Double(count) / Double(total) * 100))%)" : "(0%)")
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
                .frame(width: 40, alignment: .trailing)
        }
    }

    private func miniStat(value: String, label: String, color: Color) -> some View {
        HStack(spacing: 3) {
            Text(value)
                .font(SPTypography.mono(size: 13, weight: .bold))
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
        }
    }

    private func rankBarColor(_ rank: Int, of total: Int) -> Color {
        let pct = Double(total - rank + 1) / Double(total)
        if pct >= 0.75 { return Color.sp.green }
        if pct >= 0.5 { return Color.sp.primary }
        if pct >= 0.25 { return Color.sp.amber }
        return Color.sp.red
    }

    private func rankEmoji(_ rank: Int) -> String {
        switch rank {
        case 1: return "🥇"
        case 2: return "🥈"
        case 3: return "🥉"
        default: return ""
        }
    }

    struct AggregatedTotals {
        let exact: Int
        let correct: Int
        let completed: Int
        var accuracy: Int { completed > 0 ? Int(Double(correct) / Double(completed) * 100) : 0 }
    }

    private var aggregatedTotals: AggregatedTotals {
        var exact = 0, correct = 0, completed = 0
        for stat in poolStats {
            let e = stat.exactCount ?? 0
            let c = stat.totalCompleted ?? 0
            let rate = stat.hitRate ?? 0
            exact += e
            correct += Int(rate * Double(c))
            completed += c
        }
        return AggregatedTotals(exact: exact, correct: correct, completed: completed)
    }
}
