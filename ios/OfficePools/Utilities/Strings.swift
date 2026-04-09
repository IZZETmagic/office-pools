import Foundation

// =============================================
// CENTRALIZED UI STRINGS
//
// All user-facing text lives here for future
// localization. Organized by feature area.
// Usage: Strings.Home.greeting("Ryan")
// =============================================

enum Strings {

    // MARK: - Common

    enum Common {
        static let appName = "SportPool"
        static let cancel = "Cancel"
        static let done = "Done"
        static let save = "Save"
        static let back = "Back"
        static let ok = "OK"
        static let loading = "Loading..."
        static let error = "Error"
        static let noData = "No data available"
        static let retry = "Retry"
        static let pts = "pts"
    }

    // MARK: - Auth

    enum Auth {
        static let signIn = "Sign In"
        static let signUp = "Sign Up"
        static let createAccount = "Create Account"
        static let forgotPassword = "Forgot password?"
        static let resetPassword = "Reset Password"
        static let sendResetLink = "Send Reset Link"
        static let noAccount = "Don't have an account?"
        static let checkEmail = "Check your email"
        static let resetLinkSent = "We've sent a password reset link to your email address."
        static let emailPlaceholder = "Email"
        static let passwordPlaceholder = "Password"
        static let fullNamePlaceholder = "Full Name"
        static let usernamePlaceholder = "Username"
        static let passwordMin = "Password (min 6 characters)"
        static let tagline = "Predict. Compete. Win."
    }

    // MARK: - Home

    enum Home {
        static func greeting(for hour: Int) -> String {
            switch hour {
            case 0..<12: return "Good Morning"
            case 12..<17: return "Good Afternoon"
            default: return "Good Evening"
            }
        }
        static let yourPools = "Your Pools"
        static let liveNow = "Live Now"
        static let upNext = "Up Next"
        static let noPools = "No pools yet"
        static let joinOrCreate = "Join or create a pool to get started"
        static let joinPool = "Join Pool"
        static let createPool = "Create Pool"
    }

    // MARK: - Pools

    enum Pools {
        static let myPools = "My Pools"
        static let discover = "Discover"
        static let searchPools = "Search pools"
        static let noPoolsYet = "No Pools Yet"
        static let findPool = "Find a pool to join"
        static let predictionsNeeded = "Predictions needed"
        static let poolCompleted = "Pool completed"
        static let poolArchived = "Pool archived"
        static let entriesSubmitted = "Entries submitted"
    }

    // MARK: - Predictions

    enum Predictions {
        static let submitPredictions = "Submit Predictions"
        static let completeAll = "Complete all predictions to submit"
        static let reviewPredictions = "Review Predictions"
        static let cannotChange = "Once submitted, you cannot change your predictions."
        static func confirmSubmit(_ count: Int) -> String {
            "Once submitted, you cannot change your predictions. Make sure you're happy with all \(count) predictions."
        }
    }

    // MARK: - Results

    enum Results {
        static let noMatches = "No Matches"
        static let matchResults = "Match results will appear here."
        static let noFilter = "No matches for this filter."
        static let live = "LIVE"
        static let dateTBD = "Date TBD"
        static let today = "Today"
        static let tomorrow = "Tomorrow"
        static let yesterday = "Yesterday"
    }

    // MARK: - Profile

    enum Profile {
        static let yourProfile = "Profile"
        static let statsMore = "Stats, settings & more"
        static func memberSince(_ date: String) -> String { "Member since \(date)" }
        static let editProfile = "Edit Profile"
        static let poolPerformance = "Pool Performance"
        static let predictionAccuracy = "Prediction Accuracy"
        static let account = "Account"
        static let security = "Security"
        static let appearance = "Appearance"
        static let emailNotifications = "Email Notifications"
        static let changePassword = "Change Password"
        static let updatePassword = "Update your account password"
        static let signOut = "Sign Out"
        static let deleteAccount = "Delete Account"
        static let permanentlyRemove = "Permanently remove all data"
        static let noStatsYet = "No stats yet"
        static let joinToTrack = "Join a pool to start tracking\nyour prediction performance"
    }

    // MARK: - Activity

    enum Activity {
        static let noActivity = "No Activity"
        static let activityEmpty = "Activity will appear here as things happen in your pools."
    }

    // MARK: - Match Detail

    enum MatchDetail {
        static let groupStandings = "Group Standings"
        static let matchInfo = "Match Info"
    }

    // MARK: - Pool Detail

    enum PoolDetail {
        static let leaderboard = "Leaderboard"
        static let members = "Members"
        static let banter = "Banter"
        static let settings = "Settings"
    }
}
