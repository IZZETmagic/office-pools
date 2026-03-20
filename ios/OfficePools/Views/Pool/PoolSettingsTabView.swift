import SwiftUI

struct PoolSettingsTabView: View {
    let pool: Pool?
    let settings: PoolSettings?
    let isAdmin: Bool

    var body: some View {
        List {
            if let pool {
                Section("Pool Info") {
                    LabeledContent("Pool Code", value: pool.poolCode)
                    LabeledContent("Mode", value: pool.predictionMode.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
                    LabeledContent("Max Entries", value: "\(pool.maxEntriesPerUser)")
                    if let deadline = pool.predictionDeadline {
                        LabeledContent("Deadline", value: deadline)
                    }
                    LabeledContent("Private", value: pool.isPrivate ? "Yes" : "No")
                }
            }

            if let settings {
                Section("Group Stage Scoring") {
                    LabeledContent("Exact Score", value: "\(settings.groupExactScore) pts")
                    LabeledContent("Correct Difference", value: "\(settings.groupCorrectDifference) pts")
                    LabeledContent("Correct Result", value: "\(settings.groupCorrectResult) pts")
                }

                Section("Knockout Scoring") {
                    LabeledContent("Exact Score", value: "\(settings.knockoutExactScore) pts")
                    LabeledContent("Correct Difference", value: "\(settings.knockoutCorrectDifference) pts")
                    LabeledContent("Correct Result", value: "\(settings.knockoutCorrectResult) pts")
                }

                if settings.psoEnabled {
                    Section("Penalty Shootout") {
                        if let pts = settings.psoExactScore {
                            LabeledContent("Exact PSO Score", value: "\(pts) pts")
                        }
                        if let pts = settings.psoCorrectResult {
                            LabeledContent("Correct PSO Result", value: "\(pts) pts")
                        }
                    }
                }
            }

            if !isAdmin {
                Section {
                    Text("Only pool admins can modify settings.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
