import SwiftUI

@main
struct SlateApp: App {
    @State private var store = PlannerStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .task { await store.boot() }
        }
    }
}
