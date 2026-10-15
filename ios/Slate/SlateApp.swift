import AppIntents
import BackgroundTasks
import SwiftUI

struct AddSlateTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add a Slate task"
    static var openAppWhenRun = true

    @Parameter(title: "Title") var title: String

    func perform() async throws -> some IntentResult {
        let existing = UserDefaults.standard.stringArray(forKey: "slate.intent.tasks") ?? []
        UserDefaults.standard.set(existing + [title], forKey: "slate.intent.tasks")
        return .result()
    }
}

@main
struct SlateApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = PlannerStore()

    init() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.olivertran.slate.refresh", using: nil) { task in
            task.setTaskCompleted(success: true)
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .task { await store.boot() }
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task { await store.refresh() }
                }
        }
    }
}
