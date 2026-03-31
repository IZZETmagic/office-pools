import SwiftUI

// MARK: - Emoji Constants

enum EmojiData {
    static let quickEmojis = ["🔥", "😱", "🎯", "😂", "💀"]

    static let categories: [(name: String, icon: String, emojis: [String])] = [
        ("Smileys", "face.smiling", ["😀", "😂", "🤣", "😊", "😍", "🥰", "😎", "🤩", "😏", "🤔", "😮", "😱", "🥳", "😤", "😭", "💀", "🤯", "😈", "🤡", "👻"]),
        ("Gestures", "hand.wave", ["👍", "👎", "👏", "🙌", "🤝", "✊", "🤞", "💪", "🫡", "🤷", "🙏", "👀", "🫣", "🫠", "🤌", "✌️", "🤙", "👋", "🖐️", "👊"]),
        ("Hearts", "heart.fill", ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❤️‍🔥", "💯", "✨", "⭐", "🌟", "💫", "🔥", "💥", "🎉", "🎊", "🏆"]),
        ("Sports", "sportscourt", ["⚽", "🏟️", "🥅", "🏆", "🥇", "🥈", "🥉", "🎯", "🏃", "⚡", "🔔", "📊", "📈", "🎪", "🎟️", "🏅", "🤺", "🦁", "🐐", "👑"]),
        ("Objects", "cube", ["📌", "🔮", "🎰", "🎲", "🧊", "💎", "🛡️", "⚔️", "🚀", "💣", "🪄", "🎭", "🎬", "📢", "💡", "🔑", "🗝️", "⏰", "🧨", "🪙"]),
    ]
}

// MARK: - Quick Reaction Bar

struct QuickReactionBar: View {
    let onSelect: (String) -> Void
    let onExpand: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(EmojiData.quickEmojis, id: \.self) { emoji in
                Button {
                    onSelect(emoji)
                } label: {
                    Text(emoji)
                        .font(.title2)
                }
                .buttonStyle(.plain)
            }

            Divider()
                .frame(height: 24)

            Button {
                onExpand()
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 32)
                    .background(Color(.systemGray5))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
        .onAppear {
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()
        }
    }
}

// MARK: - Emoji Picker Sheet

struct EmojiPickerSheet: View {
    let onSelect: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var selectedCategory = 0

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 5)

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Category tabs
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(EmojiData.categories.enumerated()), id: \.offset) { idx, cat in
                            Button {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    selectedCategory = idx
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: cat.icon)
                                        .font(.caption)
                                    Text(cat.name)
                                        .font(.caption.weight(.medium))
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(selectedCategory == idx ? Color.accentColor.opacity(0.12) : Color(.systemGray6))
                                .foregroundStyle(selectedCategory == idx ? Color.accentColor : .secondary)
                                .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                }

                Divider()

                // Emoji grid
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(EmojiData.categories[selectedCategory].emojis, id: \.self) { emoji in
                            Button {
                                onSelect(emoji)
                                dismiss()
                            } label: {
                                Text(emoji)
                                    .font(.largeTitle)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 6)
                                    .background(Color(.systemGray6).opacity(0.5))
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Reactions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Reaction Pills View

struct ReactionPillsView: View {
    let reactions: [MessageReaction]
    let isOwnMessage: Bool
    let onTapReaction: (String) -> Void
    let onTapAdd: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            ForEach(reactions, id: \.emoji) { reaction in
                Button {
                    onTapReaction(reaction.emoji)
                } label: {
                    HStack(spacing: 3) {
                        Text(reaction.emoji)
                            .font(.caption)
                        if reaction.count > 1 {
                            Text("\(reaction.count)")
                                .font(.caption2.weight(.semibold).monospacedDigit())
                                .foregroundStyle(reaction.reactedByMe ? Color.accentColor : .secondary)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(reaction.reactedByMe ? Color.accentColor.opacity(0.1) : Color(.systemGray6))
                    .overlay(
                        Capsule()
                            .strokeBorder(reaction.reactedByMe ? Color.accentColor.opacity(0.3) : Color.clear, lineWidth: 1)
                    )
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }

            // Add reaction button
            Button {
                onTapAdd()
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .frame(width: 26, height: 26)
                    .background(Color(.systemGray6))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: isOwnMessage ? .trailing : .leading)
    }
}
