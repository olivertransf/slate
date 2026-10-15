import SwiftUI

@main
struct SlateApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = PlannerStore()

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
