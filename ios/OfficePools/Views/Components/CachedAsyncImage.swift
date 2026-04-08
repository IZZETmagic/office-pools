import SwiftUI

/// In-memory image cache shared across the app.
private final class ImageCache: @unchecked Sendable {
    static let shared = ImageCache()
    private let cache = NSCache<NSString, UIImage>()

    private init() {
        cache.countLimit = 200
    }

    func image(for key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    func setImage(_ image: UIImage, for key: String) {
        cache.setObject(image, forKey: key as NSString)
    }
}

/// A drop-in replacement for AsyncImage that caches downloaded images in memory.
/// Prevents re-fetching when rows scroll in/out of a LazyVStack.
struct CachedAsyncImage: View {
    let url: URL?
    let width: CGFloat
    let height: CGFloat
    let cornerRadius: CGFloat

    @State private var uiImage: UIImage?
    @State private var isLoading = false

    init(url: URL?, width: CGFloat = 24, height: CGFloat = 16, cornerRadius: CGFloat = 2) {
        self.url = url
        self.width = width
        self.height = height
        self.cornerRadius = cornerRadius
    }

    var body: some View {
        Group {
            if let uiImage {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                Color.clear
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        .task(id: url) {
            await loadImage()
        }
    }

    private func loadImage() async {
        guard let url else { return }
        let key = url.absoluteString

        // Check cache first
        if let cached = ImageCache.shared.image(for: key) {
            uiImage = cached
            return
        }

        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            if let image = UIImage(data: data) {
                ImageCache.shared.setImage(image, for: key)
                await MainActor.run {
                    uiImage = image
                }
            }
        } catch {
            // Silently fail — placeholder stays visible
        }
    }
}
