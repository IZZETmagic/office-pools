import SwiftUI

@main
struct OfficePoolsApp: App {
    @State private var authService = AuthService()
    @State private var dataStore = AppDataStore()

    var body: some Scene {
        WindowGroup {
            ContentView(authService: authService, dataStore: dataStore)
        }
    }
}
