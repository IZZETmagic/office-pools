import SwiftUI

@main
struct OfficePoolsApp: App {
    @State private var authService = AuthService()

    var body: some Scene {
        WindowGroup {
            ContentView(authService: authService)
        }
    }
}
