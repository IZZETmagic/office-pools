import SwiftUI
import Supabase

struct ScoringConfigView: View {
    let poolId: String
    let settings: PoolSettings?
    let poolService: PoolService
    var onSettingsSaved: (() async -> Void)?

    @Environment(\.dismiss) private var dismiss

    // MARK: - Group Stage
    @State private var groupExact = 5
    @State private var groupDiff = 3
    @State private var groupResult = 1

    // MARK: - Knockout Stage
    @State private var koExact = 5
    @State private var koDiff = 3
    @State private var koResult = 1

    // MARK: - Round Multipliers
    @State private var r32Mult = 1.0
    @State private var r16Mult = 1.0
    @State private var qfMult = 1.5
    @State private var sfMult = 2.0
    @State private var tpMult = 1.5
    @State private var finalMult = 3.0

    // MARK: - PSO
    @State private var psoEnabled = true
    @State private var psoExact = 100
    @State private var psoDiff = 75
    @State private var psoResult = 50

    // MARK: - Bonus: Group Standings
    @State private var bonusWinnerAndRunnerup = 150
    @State private var bonusWinnerOnly = 100
    @State private var bonusRunnerupOnly = 50
    @State private var bonusBothSwapped = 75
    @State private var bonusOneWrongPos = 25

    // MARK: - Bonus: Qualification
    @State private var bonusAll16 = 75
    @State private var bonus12_15 = 50
    @State private var bonus8_11 = 25

    // MARK: - Bonus: Bracket & Tournament
    @State private var bonusBracketPairing = 25
    @State private var bonusMatchWinner = 50
    @State private var bonusChampion = 1000
    @State private var bonusSecondPlace = 25
    @State private var bonusThirdPlace = 25
    @State private var bonusBestPlayer = 100
    @State private var bonusTopScorer = 100

    // MARK: - Saved State Snapshot (for change detection after save)
    @State private var savedGroupExact = 5
    @State private var savedGroupDiff = 3
    @State private var savedGroupResult = 1
    @State private var savedKoExact = 5
    @State private var savedKoDiff = 3
    @State private var savedKoResult = 1
    @State private var savedR32Mult = 1.0
    @State private var savedR16Mult = 1.0
    @State private var savedQfMult = 1.5
    @State private var savedSfMult = 2.0
    @State private var savedTpMult = 1.5
    @State private var savedFinalMult = 3.0
    @State private var savedPsoEnabled = true
    @State private var savedPsoExact = 100
    @State private var savedPsoDiff = 75
    @State private var savedPsoResult = 50
    @State private var savedBonusWinnerAndRunnerup = 150
    @State private var savedBonusWinnerOnly = 100
    @State private var savedBonusRunnerupOnly = 50
    @State private var savedBonusBothSwapped = 75
    @State private var savedBonusOneWrongPos = 25
    @State private var savedBonusAll16 = 75
    @State private var savedBonus12_15 = 50
    @State private var savedBonus8_11 = 25
    @State private var savedBonusBracketPairing = 25
    @State private var savedBonusMatchWinner = 50
    @State private var savedBonusChampion = 1000
    @State private var savedBonusSecondPlace = 25
    @State private var savedBonusThirdPlace = 25
    @State private var savedBonusBestPlayer = 100
    @State private var savedBonusTopScorer = 100

    // MARK: - UI State
    @State private var isSaving = false
    @State private var saveMessage: (text: String, isError: Bool)?
    @State private var showResetAlert = false
    @State private var showSaveSuccess = false

    private let apiService = APIService()

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                Spacer().frame(height: 4)

                groupStageCard
                knockoutStageCard
                psoCard
                groupStandingsCard
                qualificationCard
                bracketTournamentCard
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 100)
        }
        .scrollDismissesKeyboard(.interactively)
        .onReceive(NotificationCenter.default.publisher(for: UITextField.textDidBeginEditingNotification)) { notification in
            if let textField = notification.object as? UITextField {
                DispatchQueue.main.async {
                    textField.selectAll(nil)
                }
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Scoring Configuration")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if hasChanges || showSaveSuccess {
                saveBar
            }
        }
        .onAppear { initState() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Reset") {
                    showResetAlert = true
                }
                .font(.subheadline)
                .foregroundStyle(AppColors.error600)
            }
        }
        .alert("Reset to Defaults", isPresented: $showResetAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Reset", role: .destructive) { resetToDefaults() }
        } message: {
            Text("This will reset all scoring values to their defaults. You'll still need to save to apply changes.")
        }
    }

    // MARK: - Save Bar

    private var saveBar: some View {
        VStack(spacing: 8) {
            if let msg = saveMessage {
                HStack(spacing: 8) {
                    Image(systemName: msg.isError ? "xmark.circle.fill" : "checkmark.circle.fill")
                        .font(.subheadline)
                    Text(msg.text)
                        .font(.subheadline.weight(.medium))
                }
                .foregroundStyle(msg.isError ? AppColors.error600 : AppColors.success600)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background((msg.isError ? AppColors.error600 : AppColors.success600).opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            if hasChanges {
                Button {
                    saveSettings()
                } label: {
                    HStack {
                        Spacer()
                        if isSaving {
                            ProgressView()
                                .scaleEffect(0.8)
                                .padding(.trailing, 4)
                                .tint(AppColors.primary700)
                        }
                        Text("Save Changes")
                            .fontWeight(.semibold)
                        Spacer()
                    }
                    .padding(.vertical, 12)
                    .background { AppColors.primary500.opacity(0.2) }
                    .background(.ultraThinMaterial)
                    .foregroundStyle(AppColors.primary700)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .disabled(isSaving)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
    }

    // MARK: - Cards

    private var groupStageCard: some View {
        card {
            sectionHeader("Group Stage")
            pointsField("Exact Score", value: $groupExact)
            pointsField("Correct Difference", value: $groupDiff)
            pointsField("Correct Result", value: $groupResult)
        }
    }

    private var knockoutStageCard: some View {
        card {
            sectionHeader("Knockout Stage")
            pointsField("Exact Score", value: $koExact)
            pointsField("Correct Difference", value: $koDiff)
            pointsField("Correct Result", value: $koResult)

            Divider().padding(.vertical, 4)

            Text("Round Multipliers")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)

            multiplierField("Round of 32", value: $r32Mult)
            multiplierField("Round of 16", value: $r16Mult)
            multiplierField("Quarter Final", value: $qfMult)
            multiplierField("Semi Final", value: $sfMult)
            multiplierField("3rd Place", value: $tpMult)
            multiplierField("Final", value: $finalMult)
        }
    }

    private var psoCard: some View {
        card {
            HStack {
                Text("Penalty Shootout")
                    .font(.headline)
                Spacer()
                Toggle("", isOn: $psoEnabled)
                    .labelsHidden()
            }
            Divider()

            if psoEnabled {
                pointsField("Exact Score", value: $psoExact)
                pointsField("Correct Difference", value: $psoDiff)
                pointsField("Correct Result", value: $psoResult)
            } else {
                Text("Penalty shootout scoring is disabled.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var groupStandingsCard: some View {
        card {
            sectionHeader("Bonus: Group Standings")
            pointsField("Winner & Runner-up", value: $bonusWinnerAndRunnerup)
            pointsField("Winner Only", value: $bonusWinnerOnly)
            pointsField("Runner-up Only", value: $bonusRunnerupOnly)
            pointsField("Both Qualify (Swapped)", value: $bonusBothSwapped)
            pointsField("One Qualifies (Wrong Pos)", value: $bonusOneWrongPos)
        }
    }

    private var qualificationCard: some View {
        card {
            sectionHeader("Bonus: Qualification")
            pointsField("All 16 Qualified", value: $bonusAll16)
            pointsField("12-15 Qualified", value: $bonus12_15)
            pointsField("8-11 Qualified", value: $bonus8_11)
        }
    }

    private var bracketTournamentCard: some View {
        card {
            sectionHeader("Bonus: Bracket & Tournament")
            pointsField("Correct Bracket Pairing", value: $bonusBracketPairing)
            pointsField("Match Winner Correct", value: $bonusMatchWinner)
            pointsField("Champion Correct", value: $bonusChampion)
            pointsField("2nd Place Correct", value: $bonusSecondPlace)
            pointsField("3rd Place Correct", value: $bonusThirdPlace)
            pointsField("Best Player Correct", value: $bonusBestPlayer)
            pointsField("Top Scorer Correct", value: $bonusTopScorer)
        }
    }

    // MARK: - Card Builder

    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            content()
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func sectionHeader(_ title: String) -> some View {
        VStack(spacing: 10) {
            HStack {
                Text(title)
                    .font(.headline)
                Spacer()
            }
            Divider()
        }
    }

    private func pointsField(_ label: String, value: Binding<Int>) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            HStack(spacing: 6) {
                TextField("0", value: value, format: .number)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .font(.subheadline.weight(.bold))
                    .frame(width: 64)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 10)
                    .background(Color(.tertiarySystemFill))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Text("pts")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private func multiplierField(_ label: String, value: Binding<Double>) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            HStack(spacing: 6) {
                Text("×")
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
                TextField("1", value: value, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .font(.subheadline.weight(.bold))
                    .frame(width: 54)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 10)
                    .background(Color(.tertiarySystemFill))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - State Init

    private func initState() {
        guard let s = settings else { return }
        groupExact = s.groupExactScore
        groupDiff = s.groupCorrectDifference
        groupResult = s.groupCorrectResult
        koExact = s.knockoutExactScore
        koDiff = s.knockoutCorrectDifference
        koResult = s.knockoutCorrectResult
        r32Mult = s.round32Multiplier
        r16Mult = s.round16Multiplier
        qfMult = s.quarterFinalMultiplier
        sfMult = s.semiFinalMultiplier
        tpMult = s.thirdPlaceMultiplier
        finalMult = s.finalMultiplier
        psoEnabled = s.psoEnabled
        psoExact = s.psoExactScore ?? 100
        psoDiff = s.psoCorrectDifference ?? 75
        psoResult = s.psoCorrectResult ?? 50
        bonusWinnerAndRunnerup = s.bonusGroupWinnerAndRunnerup ?? 150
        bonusWinnerOnly = s.bonusGroupWinnerOnly ?? 100
        bonusRunnerupOnly = s.bonusGroupRunnerupOnly ?? 50
        bonusBothSwapped = s.bonusBothQualifySwapped ?? 75
        bonusOneWrongPos = s.bonusOneQualifiesWrongPosition ?? 25
        bonusAll16 = s.bonusAll16Qualified ?? 75
        bonus12_15 = s.bonus12_15Qualified ?? 50
        bonus8_11 = s.bonus8_11Qualified ?? 25
        bonusBracketPairing = s.bonusCorrectBracketPairing ?? 25
        bonusMatchWinner = s.bonusMatchWinnerCorrect ?? 50
        bonusChampion = s.bonusChampionCorrect ?? 1000
        bonusSecondPlace = s.bonusSecondPlaceCorrect ?? 25
        bonusThirdPlace = s.bonusThirdPlaceCorrect ?? 25
        bonusBestPlayer = s.bonusBestPlayerCorrect ?? 100
        bonusTopScorer = s.bonusTopScorerCorrect ?? 100
        snapshotSavedState()
    }

    private func snapshotSavedState() {
        savedGroupExact = groupExact
        savedGroupDiff = groupDiff
        savedGroupResult = groupResult
        savedKoExact = koExact
        savedKoDiff = koDiff
        savedKoResult = koResult
        savedR32Mult = r32Mult
        savedR16Mult = r16Mult
        savedQfMult = qfMult
        savedSfMult = sfMult
        savedTpMult = tpMult
        savedFinalMult = finalMult
        savedPsoEnabled = psoEnabled
        savedPsoExact = psoExact
        savedPsoDiff = psoDiff
        savedPsoResult = psoResult
        savedBonusWinnerAndRunnerup = bonusWinnerAndRunnerup
        savedBonusWinnerOnly = bonusWinnerOnly
        savedBonusRunnerupOnly = bonusRunnerupOnly
        savedBonusBothSwapped = bonusBothSwapped
        savedBonusOneWrongPos = bonusOneWrongPos
        savedBonusAll16 = bonusAll16
        savedBonus12_15 = bonus12_15
        savedBonus8_11 = bonus8_11
        savedBonusBracketPairing = bonusBracketPairing
        savedBonusMatchWinner = bonusMatchWinner
        savedBonusChampion = bonusChampion
        savedBonusSecondPlace = bonusSecondPlace
        savedBonusThirdPlace = bonusThirdPlace
        savedBonusBestPlayer = bonusBestPlayer
        savedBonusTopScorer = bonusTopScorer
    }

    // MARK: - Has Changes

    private var hasChanges: Bool {
        return groupExact != savedGroupExact
            || groupDiff != savedGroupDiff
            || groupResult != savedGroupResult
            || koExact != savedKoExact
            || koDiff != savedKoDiff
            || koResult != savedKoResult
            || r32Mult != savedR32Mult
            || r16Mult != savedR16Mult
            || qfMult != savedQfMult
            || sfMult != savedSfMult
            || tpMult != savedTpMult
            || finalMult != savedFinalMult
            || psoEnabled != savedPsoEnabled
            || psoExact != savedPsoExact
            || psoDiff != savedPsoDiff
            || psoResult != savedPsoResult
            || bonusWinnerAndRunnerup != savedBonusWinnerAndRunnerup
            || bonusWinnerOnly != savedBonusWinnerOnly
            || bonusRunnerupOnly != savedBonusRunnerupOnly
            || bonusBothSwapped != savedBonusBothSwapped
            || bonusOneWrongPos != savedBonusOneWrongPos
            || bonusAll16 != savedBonusAll16
            || bonus12_15 != savedBonus12_15
            || bonus8_11 != savedBonus8_11
            || bonusBracketPairing != savedBonusBracketPairing
            || bonusMatchWinner != savedBonusMatchWinner
            || bonusChampion != savedBonusChampion
            || bonusSecondPlace != savedBonusSecondPlace
            || bonusThirdPlace != savedBonusThirdPlace
            || bonusBestPlayer != savedBonusBestPlayer
            || bonusTopScorer != savedBonusTopScorer
    }

    // MARK: - Reset to Defaults

    private func resetToDefaults() {
        let d = ScoringDefaultsPayload.defaults
        groupExact = d.groupExactScore
        groupDiff = d.groupCorrectDifference
        groupResult = d.groupCorrectResult
        koExact = d.knockoutExactScore
        koDiff = d.knockoutCorrectDifference
        koResult = d.knockoutCorrectResult
        r32Mult = d.round32Multiplier
        r16Mult = d.round16Multiplier
        qfMult = d.quarterFinalMultiplier
        sfMult = d.semiFinalMultiplier
        tpMult = d.thirdPlaceMultiplier
        finalMult = d.finalMultiplier
        psoEnabled = d.psoEnabled
        psoExact = d.psoExactScore
        psoDiff = d.psoCorrectDifference
        psoResult = d.psoCorrectResult
        bonusWinnerAndRunnerup = d.bonusGroupWinnerAndRunnerup
        bonusWinnerOnly = d.bonusGroupWinnerOnly
        bonusRunnerupOnly = d.bonusGroupRunnerupOnly
        bonusBothSwapped = d.bonusBothQualifySwapped
        bonusOneWrongPos = d.bonusOneQualifiesWrongPosition
        bonusAll16 = d.bonusAll16Qualified
        bonus12_15 = d.bonus1215Qualified
        bonus8_11 = d.bonus811Qualified
        bonusBracketPairing = d.bonusCorrectBracketPairing
        bonusMatchWinner = d.bonusMatchWinnerCorrect
        bonusChampion = d.bonusChampionCorrect
        bonusSecondPlace = d.bonusSecondPlaceCorrect
        bonusThirdPlace = d.bonusThirdPlaceCorrect
        bonusBestPlayer = d.bonusBestPlayerCorrect
        bonusTopScorer = d.bonusTopScorerCorrect
    }

    // MARK: - Save

    private func saveSettings() {
        isSaving = true
        saveMessage = nil

        let updates: [String: AnyJSON] = [
            "group_exact_score": .integer(groupExact),
            "group_correct_difference": .integer(groupDiff),
            "group_correct_result": .integer(groupResult),
            "knockout_exact_score": .integer(koExact),
            "knockout_correct_difference": .integer(koDiff),
            "knockout_correct_result": .integer(koResult),
            "round_32_multiplier": .double(r32Mult),
            "round_16_multiplier": .double(r16Mult),
            "quarter_final_multiplier": .double(qfMult),
            "semi_final_multiplier": .double(sfMult),
            "third_place_multiplier": .double(tpMult),
            "final_multiplier": .double(finalMult),
            "pso_enabled": .bool(psoEnabled),
            "pso_exact_score": .integer(psoExact),
            "pso_correct_difference": .integer(psoDiff),
            "pso_correct_result": .integer(psoResult),
            "bonus_group_winner_and_runnerup": .integer(bonusWinnerAndRunnerup),
            "bonus_group_winner_only": .integer(bonusWinnerOnly),
            "bonus_group_runnerup_only": .integer(bonusRunnerupOnly),
            "bonus_both_qualify_swapped": .integer(bonusBothSwapped),
            "bonus_one_qualifies_wrong_position": .integer(bonusOneWrongPos),
            "bonus_all_16_qualified": .integer(bonusAll16),
            "bonus_12_15_qualified": .integer(bonus12_15),
            "bonus_8_11_qualified": .integer(bonus8_11),
            "bonus_correct_bracket_pairing": .integer(bonusBracketPairing),
            "bonus_match_winner_correct": .integer(bonusMatchWinner),
            "bonus_champion_correct": .integer(bonusChampion),
            "bonus_second_place_correct": .integer(bonusSecondPlace),
            "bonus_third_place_correct": .integer(bonusThirdPlace),
            "bonus_best_player_correct": .integer(bonusBestPlayer),
            "bonus_top_scorer_correct": .integer(bonusTopScorer),
        ]

        Task {
            do {
                try await poolService.updateSettings(poolId: poolId, updates: updates)
                snapshotSavedState()

                // Trigger v2 scoring recalculation
                saveMessage = (text: "Scoring saved. Recalculating points…", isError: false)
                try await apiService.recalculatePool(poolId: poolId)

                // Refresh leaderboard in parent view
                await onSettingsSaved?()

                saveMessage = (text: "Scoring saved. Points recalculated.", isError: false)
                isSaving = false
                showSaveSuccess = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    showSaveSuccess = false
                }
            } catch {
                saveMessage = (text: error.localizedDescription, isError: true)
                isSaving = false
            }
        }
    }
}
