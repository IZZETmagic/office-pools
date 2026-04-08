import SwiftUI

/// Empty state shown when the user has no activity items yet.
struct ActivityEmptyView: View {
    var body: some View {
        ContentUnavailableView(
            "No Activity Yet",
            systemImage: "bell.slash",
            description: Text("Your activity feed will light up as you play \u{2014} predictions, rank changes, badges, and more.")
        )
    }
}
