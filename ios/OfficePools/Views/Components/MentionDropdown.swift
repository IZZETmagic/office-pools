import SwiftUI

/// Autocomplete dropdown that appears above the text field when the user types @.
struct MentionDropdown: View {
    let members: [LeaderboardEntryData]
    let selectedIndex: Int
    let onSelect: (LeaderboardEntryData) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(members.enumerated()), id: \.element.userId) { index, member in
                Button {
                    onSelect(member)
                } label: {
                    HStack(spacing: 10) {
                        // Initials avatar
                        Text(initials(for: member.fullName))
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                            .frame(width: 28, height: 28)
                            .background(Color.sp.slate)
                            .clipShape(Circle())

                        VStack(alignment: .leading, spacing: 1) {
                            Text(member.fullName)
                                .font(SPTypography.body)
                                .foregroundStyle(Color.sp.ink)
                            Text("@\(member.username)")
                                .font(SPTypography.detail)
                                .foregroundStyle(Color.sp.slate)
                        }

                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(index == selectedIndex ? Color.sp.primaryLight : Color.clear)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if index < members.count - 1 {
                    Divider().padding(.leading, 50)
                }
            }
        }
        .background(Color.sp.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.12), radius: 12, y: -4)
    }

    private func initials(for fullName: String) -> String {
        let parts = fullName.split(separator: " ")
        let first = parts.first.map { String($0.prefix(1)) } ?? ""
        let last = parts.count > 1 ? (parts.last.map { String($0.prefix(1)) } ?? "") : ""
        return (first + last).uppercased()
    }
}
