import SwiftUI

struct MembersTabView: View {
    let members: [Member]
    let leaderboardData: [LeaderboardEntryData]
    let currentUserId: String
    let poolService: PoolService

    var body: some View {
        ScrollView {
                LazyVStack(spacing: 16) {
                    // Members card
                    card {
                        sectionHeader("\(members.count) Members")

                        ForEach(Array(sortedMembers.enumerated()), id: \.element.id) { index, member in
                            NavigationLink(value: member) {
                                memberRow(member)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))
    }

    // MARK: - Filtered Members

    private var sortedMembers: [Member] {
        members.sorted { a, b in
            let aPoints = memberBestPoints(a)
            let bPoints = memberBestPoints(b)
            if aPoints != bPoints { return aPoints > bPoints }
            return a.users.fullName < b.users.fullName
        }
    }

    // MARK: - Member Row

    private func memberRow(_ member: Member) -> some View {
        HStack(spacing: 12) {
            // Avatar
            ZStack {
                Circle()
                    .fill(member.isAdmin ? AppColors.neutral600.opacity(0.15) : AppColors.primary500.opacity(0.1))
                    .frame(width: 36, height: 36)
                Text(String(member.users.fullName.prefix(1)).uppercased())
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(member.isAdmin ? AppColors.neutral600 : AppColors.primary500)
            }

            // Name + username + entry count
            VStack(alignment: .leading, spacing: 2) {
                Text(member.users.fullName)
                    .font(.subheadline.weight(.medium))

                HStack(spacing: 4) {
                    Text("@\(member.users.username)")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    let entryCount = member.entries?.count ?? 0
                    if entryCount > 0 {
                        Text("·")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("\(entryCount) \(entryCount == 1 ? "entry" : "entries")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }

    // MARK: - Helpers

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

    private var adminCount: Int {
        members.filter(\.isAdmin).count
    }

    private func memberBestPoints(_ member: Member) -> Int {
        let entryIds = (member.entries ?? []).map(\.entryId)
        return leaderboardData
            .filter { entryIds.contains($0.entryId) }
            .map(\.totalPoints)
            .max() ?? 0
    }
}
