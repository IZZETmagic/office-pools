import SwiftUI

@main
struct OfficePoolsApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var authService = AuthService()
    @State private var dataStore = AppDataStore()

    var body: some Scene {
        WindowGroup {
            ContentView(authService: authService, dataStore: dataStore)
        }
    }
}
