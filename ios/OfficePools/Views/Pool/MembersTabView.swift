import SwiftUI

struct MembersTabView: View {
    let members: [Member]
    let leaderboardData: [LeaderboardEntryData]
    let currentUserId: String
    let poolService: PoolService

    var body: some View {
        ScrollView {
                LazyVStack(spacing: 16) {
                    Spacer().frame(height: 4)

                    // Members card
                    VStack(alignment: .leading, spacing: 10) {
                        sectionHeader("\(members.count) Members")

                        ForEach(Array(sortedMembers.enumerated()), id: \.element.id) { index, member in
                            if index > 0 {
                                Divider().padding(.leading, 48)
                            }
                            NavigationLink(value: member) {
                                memberRow(member)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(16)
                    .spCard()
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Color.sp.snow)
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
                    .fill(member.isAdmin ? Color.sp.slate.opacity(0.15) : Color.sp.primaryLight)
                    .frame(width: 36, height: 36)
                Text(String(member.users.fullName.prefix(1)).uppercased())
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(member.isAdmin ? Color.sp.slate : Color.sp.primary)
            }

            // Name + username + entry count
            VStack(alignment: .leading, spacing: 2) {
                Text(member.users.fullName)
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.ink)

                HStack(spacing: 4) {
                    Text("@\(member.users.username)")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)

                    let entryCount = member.entries?.count ?? 0
                    if entryCount > 0 {
                        Text("·")
                            .font(SPTypography.detail)
                            .foregroundStyle(Color.sp.slate)
                        Text("\(entryCount) \(entryCount == 1 ? "entry" : "entries")")
                            .font(SPTypography.detail)
                            .foregroundStyle(Color.sp.slate)
                    }
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Color.sp.silver)
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        VStack(spacing: 10) {
            HStack {
                Text(title)
                    .font(SPTypography.sectionHeader)
                    .foregroundStyle(Color.sp.ink)
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
