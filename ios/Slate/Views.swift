import AuthenticationServices
import SwiftUI
import UIKit

struct RootView: View {
    @Environment(PlannerStore.self) private var store
    @Environment(\.horizontalSizeClass) private var size
    @Environment(\.colorScheme) private var scheme
    @State private var view = "today"
    @State private var section = "tasks"
    @State private var taskSelection: TaskRecord?
    @State private var calendarSelection: TaskRecord?
    @State private var editor: TaskRecord?
    @State private var tab = "tasks"
    @State private var listsOpen = false

    var body: some View {
        Group {
            if !store.ready {
                ProgressView("Loading")
            } else if !store.unlocked {
                UnlockView()
            } else {
                shell
            }
        }
        .tint(palette.blue)
        .preferredColorScheme(appearance)
    }

    @AppStorage("slate.theme") private var theme = "system"

    private var appearance: ColorScheme? {
        if theme == "dark" { return .dark }
        if theme == "light" { return .light }
        return nil
    }

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }

    private var shell: some View {
        Group {
            if size == .compact {
                phone
            } else {
                pad
            }
        }
        .background(palette.stage)
        .foregroundStyle(palette.ink)
    }

    private var phone: some View {
        TabView(selection: $tab) {
            NavigationStack {
                TaskList(view: view, selected: $taskSelection, showsFab: true)
                    .navigationDestination(item: $taskSelection) { task in
                        TaskEditor(task: task)
                    }
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button { listsOpen = true } label: { Image(systemName: "list.bullet") }
                                .accessibilityLabel("Lists")
                        }
                        ToolbarItem(placement: .topBarTrailing) {
                            NavigationLink { SettingsScreen() } label: { Image(systemName: "gearshape") }
                                .accessibilityLabel("Settings")
                        }
                    }
            }
            .tabItem { Label("Tasks", systemImage: "checkmark.circle") }
            .tag("tasks")

            NavigationStack {
                CalendarScreen(onSelect: { calendarSelection = $0 })
                    .navigationDestination(item: $calendarSelection) { task in
                        TaskEditor(task: task)
                    }
            }
            .tabItem { Label("Calendar", systemImage: "calendar") }
            .tag("calendar")

            NavigationStack { HabitScreen() }
                .tabItem { Label("Habits", systemImage: "circle.grid.2x2") }
                .tag("habits")

            NavigationStack { CountdownScreen() }
                .tabItem { Label("Countdowns", systemImage: "hourglass") }
                .tag("countdowns")
        }
        .onChange(of: tab) { _, _ in
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                taskSelection = nil
                calendarSelection = nil
            }
        }
        .sheet(isPresented: $listsOpen) {
            NavigationStack {
                TaskSidebar(view: $view, onPick: { listsOpen = false })
                    .navigationTitle("Lists")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { listsOpen = false }
                        }
                    }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var pad: some View {
        HStack(spacing: 0) {
            AppRail(section: $section)
            Group {
                if section == "tasks" {
                    HStack(spacing: 0) {
                        TaskSidebar(view: $view)
                            .frame(width: 260)
                        TaskList(view: view, selected: $editor, showsFab: false)
                    }
                } else if section == "calendar" {
                    CalendarScreen(onSelect: { editor = $0 })
                } else if section == "habits" {
                    HabitScreen()
                } else if section == "countdowns" {
                    CountdownScreen()
                } else {
                    SettingsScreen()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(palette.stage)
        }
        .sheet(item: $editor) { task in
            NavigationStack {
                TaskEditor(task: task)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { editor = nil }
                        }
                    }
            }
        }
        .onChange(of: section) { _, next in
            guard next != "tasks" && next != "calendar" else { return }
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) { editor = nil }
        }
    }
}

struct UnlockView: View {
    @Environment(PlannerStore.self) private var store
    @State private var passphrase = ""
    @State private var message: String?
    @State private var pending = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            RoundedRectangle(cornerRadius: 14).fill(Color(red: 0.24, green: 0.42, blue: 1)).frame(width: 48, height: 48)
                .overlay { Text("S").font(.headline).foregroundStyle(.white) }
            Text("Slate").font(.largeTitle.bold())
            Text("Tasks, calendar, habits, and countdowns, synced across your devices.")
                .foregroundStyle(.secondary)
            TextField("Server", text: Bindable(store).baseURL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)
            SecureField("Passphrase", text: $passphrase)
                .textFieldStyle(.roundedBorder)
            if let message { Text(message).foregroundStyle(.red).font(.footnote) }
            Button(pending ? "Unlocking" : "Unlock") {
                pending = true
                Task {
                    message = await store.unlock(passphrase: passphrase)
                    pending = false
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(passphrase.isEmpty || pending)
        }
        .padding(28)
        .frame(maxWidth: 420)
        .background(.background, in: RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.08), radius: 24, y: 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}

struct SlatePalette {
    var scheme: ColorScheme

    var dark: Bool { scheme == .dark }
    var rail: Color { dark ? rgb(0x171717) : rgb(0xEDEDED) }
    var sidebar: Color { dark ? rgb(0x1C1C1E) : rgb(0xF5F5F5) }
    var stage: Color { dark ? rgb(0x1C1C1E) : .white }
    var ink: Color { dark ? .white : rgb(0x191919) }
    var muted: Color { dark ? rgb(0x8D8D8D) : rgb(0x8A8A8A) }
    var line: Color { dark ? rgb(0x2A2A2A) : rgb(0xEDEDED) }
    var blue: Color { dark ? rgb(0x4E81FB) : rgb(0x4772FA) }
    var active: Color { dark ? rgb(0x3A3A3A) : rgb(0xE8E8E8) }
    var chip: Color { dark ? rgb(0x2C2C2E) : rgb(0xF3F3F3) }

    private func rgb(_ hex: UInt) -> Color {
        Color(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

struct AppRail: View {
    @Environment(PlannerStore.self) private var store
    @Environment(\.colorScheme) private var scheme
    @Binding var section: String

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }

    var body: some View {
        VStack(spacing: 4) {
            Text("S")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(palette.blue, in: RoundedRectangle(cornerRadius: 8))
                .padding(.bottom, 10)
            rail("tasks", "checkmark")
            rail("calendar", "calendar")
            rail("habits", "circle.grid.2x2")
            rail("countdowns", "hourglass")
            Spacer(minLength: 0)
            rail("settings", "gearshape")
            Button { store.lock() } label: {
                Image(systemName: "lock")
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.plain)
            .foregroundStyle(palette.muted)
            .accessibilityLabel("Lock")
        }
        .padding(.vertical, 12)
        .frame(width: 60)
        .frame(maxHeight: .infinity)
        .background(palette.rail)
    }

    private func rail(_ id: String, _ symbol: String) -> some View {
        Button { section = id } label: {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .medium))
                .frame(width: 36, height: 36)
                .background(section == id ? palette.ink : .clear, in: RoundedRectangle(cornerRadius: 8))
                .foregroundStyle(section == id ? palette.stage : palette.muted)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(id)
    }
}

struct TaskSidebar: View {
    @Environment(PlannerStore.self) private var store
    @Binding var view: String
    var showsStages = false
    var onPick: () -> Void = {}
    @State private var listName = ""

    var body: some View {
        let lists = store.lists.filter { $0.deletedAt == nil }.sorted { $0.sort < $1.sort }
        List {
            Section {
                pick("inbox", "Inbox", "tray", count("inbox"))
                pick("today", "Today", "sun.max", count("today"))
                pick("tomorrow", "Tomorrow", "sun.horizon", count("tomorrow"))
                pick("week", "Next 7 Days", "calendar", count("week"))
            }
            Section("Lists") {
                ForEach(lists) { list in
                    Button { choose("list:\(list.id)") } label: {
                        HStack {
                            Label {
                                Text(list.name)
                            } icon: {
                                Image(systemName: "circle.fill").foregroundStyle(Color(hex: list.color))
                            }
                            Spacer(minLength: 8)
                            countLabel(openCount(listId: list.id))
                        }
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(view == "list:\(list.id)" ? Color.accentColor.opacity(0.16) : nil)
                    .contextMenu {
                        Button("Delete", role: .destructive) { delete(list) }
                    }
                }
                TextField("Add list", text: $listName)
                    .onSubmit(addList)
            }
            Section {
                pick("completed", "Completed", "checkmark.circle", store.tasks.filter { $0.deletedAt == nil && $0.completedAt != nil }.count)
            }
            if showsStages {
                Section {
                    pick("calendar", "Calendar", "calendar")
                    pick("habits", "Habits", "circle.grid.2x2")
                    pick("countdowns", "Countdowns", "hourglass")
                    pick("settings", "Settings", "gearshape")
                }
            }
        }
        .listStyle(.sidebar)
    }

    private func pick(_ id: String, _ title: String, _ symbol: String, _ total: Int = 0) -> some View {
        Button { choose(id) } label: {
            HStack {
                Label(title, systemImage: symbol)
                Spacer(minLength: 8)
                countLabel(total)
            }
        }
        .buttonStyle(.plain)
        .listRowBackground(view == id ? Color.accentColor.opacity(0.16) : nil)
    }

    private func countLabel(_ total: Int) -> some View {
        Text(total == 0 ? "" : "\(total)")
            .font(.subheadline)
            .foregroundStyle(.secondary)
    }

    private func count(_ id: String) -> Int {
        store.tasks.filter { matches(task: $0, view: id) }.count
    }

    private func openCount(listId: String) -> Int {
        store.tasks.filter { matches(task: $0, view: "list:\(listId)") }.count
    }

    private func choose(_ id: String) {
        view = id
        onPick()
    }

    private func delete(_ list: ListRecord) {
        var copy = list
        copy.deletedAt = ISO8601DateFormatter().string(from: .now)
        store.saveList(copy)
        if view == "list:\(list.id)" { view = "inbox" }
    }

    private func addList() {
        let name = listName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        let id = UUID().uuidString
        store.saveList(ListRecord(id: id, name: name, color: "#4E81FB", sort: Date().timeIntervalSince1970, sections: [], updatedAt: "", deletedAt: nil))
        listName = ""
        choose("list:\(id)")
    }
}

struct SettingsScreen: View {
    @Environment(PlannerStore.self) private var store
    @AppStorage("slate.theme") private var theme = "system"
    @State private var status: GoogleStatus?
    @State private var message = ""
    @State private var signingIn = false

    var body: some View {
        Form {
            Section("Appearance") {
                Picker("Appearance", selection: $theme) {
                    Text("Auto").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
            }
            Section {
                if status?.connected == true {
                    LabeledContent("Account", value: accountName)
                    Button("Sign out", role: .destructive) {
                        Task {
                            await store.googleLogout()
                            status = await store.googleStatus()
                        }
                    }
                } else {
                    Button(signingIn ? "Waiting for Google" : "Sign in with Google") {
                        Task { await signIn() }
                    }
                    .disabled(signingIn || status?.configured == false)
                }
            } header: {
                Text("Google Calendar")
            } footer: {
                Text(footer)
            }
            Section {
                Button("Lock") { store.lock() }
            }
        }
        .navigationTitle("Settings")
        .task { status = await store.googleStatus() }
    }

    private var accountName: String {
        status?.calendars.first { $0.primary }?.name ?? "Connected"
    }

    private var footer: String {
        if status?.configured == false { return "The server is missing the Google client." }
        if !message.isEmpty { return message }
        return "Signing in on this iPhone, iPad, or the website connects Calendar on every device that unlocks Slate."
    }

    private func signIn() async {
        signingIn = true
        defer { signingIn = false }
        guard let url = await store.googleStartURL() else {
            message = "Could not start Google sign-in. Unlock Slate and check the server address."
            return
        }
        let ok = await GoogleLogin.shared.start(url: url)
        status = await store.googleStatus()
        message = ok ? "" : "Google sign-in was canceled. The redirect address for this server has to be allowed in Google Cloud."
    }
}

final class GoogleLogin: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = GoogleLogin()

    private var session: ASWebAuthenticationSession?

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? scenes.first?.windows.first ?? ASPresentationAnchor()
    }

    func start(url: URL) async -> Bool {
        let gate = ResumeGate()
        return await withCheckedContinuation { continuation in
            let finish: (Bool) -> Void = { value in
                if gate.claim() { continuation.resume(returning: value) }
            }
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "slate") { callback, _ in
                finish(callback?.scheme == "slate")
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() { finish(false) }
        }
    }
}

private final class ResumeGate: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false

    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if done { return false }
        done = true
        return true
    }
}

extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

struct TaskList: View {
    @Environment(PlannerStore.self) private var store
    @Environment(\.colorScheme) private var scheme
    var view: String
    @Binding var selected: TaskRecord?
    var showsFab = false
    @State private var draft = ""
    @State private var sectionName = ""
    @State private var addOpen = false

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }

    var body: some View {
        let open = visibleTasks
        let list = view.hasPrefix("list:") ? store.lists.first { $0.id == String(view.dropFirst(5)) } : nil
        VStack(spacing: 0) {
        List {
            if open.isEmpty { Text(view == "completed" ? "No completed tasks." : "Nothing here yet.").foregroundStyle(.secondary) }
            if let list {
                let loose = open.filter { $0.sectionId == nil }
                if !loose.isEmpty {
                    Section("Tasks") {
                        ForEach(loose) { task in taskRow(task) }
                    }
                }
                ForEach(list.sections.sorted { $0.sort < $1.sort }) { section in
                    Section(section.name) {
                        ForEach(open.filter { $0.sectionId == section.id }) { task in taskRow(task) }
                    }
                }
                Section {
                    TextField("Section name", text: $sectionName)
                        .onSubmit { addSection(list) }
                    Button("Add section") { addSection(list) }
                        .disabled(sectionName.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            } else {
                ForEach(open) { task in taskRow(task) }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.large)
        .safeAreaInset(edge: .bottom) {
            if showsFab {
                HStack {
                    Spacer()
                    Button { addOpen = true } label: {
                        Image(systemName: "plus")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(width: 56, height: 56)
                            .background(palette.blue, in: Circle())
                    }
                    .padding(.trailing, 20)
                    .padding(.bottom, 12)
                }
            } else if view != "completed" {
                composer
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
            }
        }
        .sheet(isPresented: $addOpen) {
            NavigationStack {
                composer
                    .padding(20)
                    .navigationTitle("New task")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") { addOpen = false }
                        }
                    }
            }
            .presentationDetents([.height(200)])
        }
        }
        .background(palette.stage)
        .foregroundStyle(palette.ink)
    }

    private var visibleTasks: [TaskRecord] {
        if view == "completed" {
            return store.tasks.filter { $0.deletedAt == nil && $0.completedAt != nil }.sorted { ($0.completedAt ?? "") > ($1.completedAt ?? "") }
        }
        return store.tasks.filter { matches(task: $0, view: view) }.sorted { $0.sort < $1.sort }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                ZStack(alignment: .leading) {
                    if draft.isEmpty {
                        Text("What would you like to do?")
                            .foregroundStyle(palette.muted)
                            .padding(.horizontal, 8)
                    } else {
                        Text(highlightedDraft)
                            .font(.body)
                            .padding(.horizontal, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    TextField("Task", text: $draft)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 8)
                        .foregroundStyle(draft.isEmpty ? palette.ink : .clear)
                        .onSubmit(add)
                }
                .padding(.vertical, 8)
                .background(palette.chip, in: RoundedRectangle(cornerRadius: 14))
                Button { add() } label: {
                    Image(systemName: "plus")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(palette.blue, in: Circle())
                }
            }
            if let due = parseQuickAdd(draft).dueOn {
                Text(Day.label(due))
                    .font(.caption.bold())
                    .foregroundStyle(palette.blue)
                    .padding(.leading, 8)
            }
        }
    }

    private var title: String {
        if view == "inbox" { return "Inbox" }
        if view == "today" { return "Today" }
        if view == "tomorrow" { return "Tomorrow" }
        if view == "week" { return "Next 7 Days" }
        if view == "completed" { return "Completed" }
        if view.hasPrefix("list:") {
            return store.lists.first { $0.id == String(view.dropFirst(5)) }?.name ?? "List"
        }
        return "Tasks"
    }

    private func taskRow(_ task: TaskRecord) -> some View {
        HStack {
            Button { store.complete(task) } label: {
                Image(systemName: task.completedAt == nil ? "circle" : "checkmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(task.completedAt == nil ? Color.secondary : Color.blue)
            }
            .buttonStyle(.plain)
            Text(task.title)
                .strikethrough(task.completedAt != nil)
                .lineLimit(1)
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 1) {
                if let due = task.dueOn {
                    Text(Day.label(due)).font(.caption.weight(.semibold)).foregroundStyle(palette.blue)
                }
                if let time = task.dueTime {
                    Text(Day.clock(time)).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .listRowBackground(palette.chip)
        .contentShape(Rectangle())
        .onTapGesture { selected = task }
        .swipeActions {
            Button(task.completedAt == nil ? "Complete" : "Restore") { store.complete(task) }
                .tint(.blue)
        }
    }

    private var highlightedDraft: AttributedString {
        let parsed = parseQuickAdd(draft)
        var painted = AttributedString(draft.isEmpty ? " " : draft)
        guard !draft.isEmpty else { return painted }
        for token in parsed.tokens {
            guard token.start >= 0, token.end <= draft.count, token.start < token.end else { continue }
            let lower = painted.index(painted.startIndex, offsetByCharacters: token.start)
            let upper = painted.index(lower, offsetByCharacters: token.end - token.start)
            painted[lower..<upper].foregroundColor = token.kind == "date" || token.kind == "time" ? .blue : .purple
            painted[lower..<upper].backgroundColor = Color.blue.opacity(0.18)
        }
        return painted
    }

    private func add() {
        let parsed = parseQuickAdd(draft)
        guard !parsed.title.isEmpty else { return }
        let listId = view.hasPrefix("list:") ? String(view.dropFirst(5)) : nil
        let tagIds = parsed.tagNames.map { name in
            if let existing = store.tags.first(where: { $0.deletedAt == nil && $0.name.lowercased() == name.lowercased() }) {
                return existing.id
            }
            let tag = TagRecord(id: UUID().uuidString, name: name, color: "#8E4EC6", updatedAt: "", deletedAt: nil)
            store.saveTag(tag)
            return tag.id
        }
        let task = TaskRecord(
            id: UUID().uuidString, title: parsed.title, notes: "", listId: listId, sectionId: nil, priority: parsed.priority,
            tagIds: tagIds, dueOn: parsed.dueOn, dueTime: parsed.dueTime, repeatRule: parsed.repeatRule, remindMinutesBefore: nil,
            completedAt: nil, subtasks: [], sort: Date().timeIntervalSince1970, updatedAt: "", deletedAt: nil
        )
        store.saveTask(task)
        draft = ""
        addOpen = false
        selected = task
    }

    private func addSection(_ list: ListRecord) {
        let name = sectionName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        var next = list
        next.sections.append(TaskSection(id: UUID().uuidString, name: name, sort: Date().timeIntervalSince1970))
        store.saveList(next)
        sectionName = ""
    }
}

struct TaskEditor: View {
    @Environment(PlannerStore.self) private var store
    var task: TaskRecord

    private var current: TaskRecord { store.tasks.first { $0.id == task.id } ?? task }

    var body: some View {
        Form {
            TextField("Title", text: binding(\.title, ""))
            TextField("Date", text: binding(\.dueOn, ""))
            TextField("Time", text: binding(\.dueTime, ""))
            Picker("Priority", selection: binding(\.priority, 0)) {
                Text("None").tag(0)
                Text("Low").tag(1)
                Text("Medium").tag(2)
                Text("High").tag(3)
            }
            Picker("Repeat", selection: repeatBinding) {
                Text("None").tag("")
                Text("Every day").tag("day")
                Text("Every week").tag("week")
                Text("Every month").tag("month")
                Text("Every year").tag("year")
            }
            Picker("Reminder", selection: reminderBinding) {
                Text("None").tag(-1)
                Text("At the time").tag(0)
                Text("15 minutes before").tag(15)
                Text("1 hour before").tag(60)
                Text("1 day before").tag(1440)
            }
            Section("Notes") {
                TextField("Notes", text: binding(\.notes, ""), axis: .vertical)
            }
            Section("Subtasks") {
                ForEach(current.subtasks) { subtask in
                    Text(subtask.title)
                }
                Button("Add subtask") {
                    var next = current
                    next.subtasks.append(Subtask(id: UUID().uuidString, title: "New step", done: false))
                    store.saveTask(next)
                }
            }
            Button("Delete task", role: .destructive) {
                var next = current
                next.deletedAt = ISO8601DateFormatter().string(from: .now)
                store.saveTask(next)
            }
        }
        .navigationTitle("Details")
    }

    private var repeatBinding: Binding<String> {
        Binding(get: { current.repeatRule?.unit.rawValue ?? "" }, set: { value in
            var next = current
            next.repeatRule = value.isEmpty ? nil : RepeatRule(every: 1, unit: RepeatUnit(rawValue: value) ?? .day)
            store.saveTask(next)
        })
    }

    private var reminderBinding: Binding<Int> {
        Binding(get: { current.remindMinutesBefore ?? -1 }, set: { value in
            var next = current
            next.remindMinutesBefore = value < 0 ? nil : value
            store.saveTask(next)
        })
    }

    private func binding(_ keyPath: WritableKeyPath<TaskRecord, String>, _ fallback: String) -> Binding<String> {
        Binding(get: { current[keyPath: keyPath] }, set: { value in
            var next = current
            next[keyPath: keyPath] = value
            store.saveTask(next)
        })
    }

    private func binding(_ keyPath: WritableKeyPath<TaskRecord, String?>, _ fallback: String) -> Binding<String> {
        Binding(get: { current[keyPath: keyPath] ?? "" }, set: { value in
            var next = current
            next[keyPath: keyPath] = value.isEmpty ? nil : value
            store.saveTask(next)
        })
    }

    private func binding(_ keyPath: WritableKeyPath<TaskRecord, Int>, _ fallback: Int) -> Binding<Int> {
        Binding(get: { current[keyPath: keyPath] }, set: { value in
            var next = current
            next[keyPath: keyPath] = value
            store.saveTask(next)
        })
    }
}

struct TimeLane {
    var column: Int
    var columns: Int
}

func timeLanes(_ items: [(id: String, start: Int)], duration: Int = 60) -> [String: TimeLane] {
    let sorted = items.sorted { $0.start == $1.start ? $0.id < $1.id : $0.start < $1.start }
    struct Placed {
        var id: String
        var start: Int
        var end: Int
        var column: Int
    }
    var clusters: [[Placed]] = []
    var cluster: [Placed] = []
    var clusterEnd = -1
    for item in sorted {
        let end = item.start + duration
        if !cluster.isEmpty && item.start >= clusterEnd {
            clusters.append(cluster)
            cluster = []
            clusterEnd = -1
        }
        var column = 0
        while cluster.contains(where: { $0.column == column && $0.start < end && item.start < $0.end }) {
            column += 1
        }
        cluster.append(Placed(id: item.id, start: item.start, end: end, column: column))
        clusterEnd = max(clusterEnd, end)
    }
    if !cluster.isEmpty { clusters.append(cluster) }
    var result: [String: TimeLane] = [:]
    for group in clusters {
        let columns = (group.map(\.column).max() ?? 0) + 1
        for item in group {
            result[item.id] = TimeLane(column: item.column, columns: columns)
        }
    }
    return result
}

struct CalendarScreen: View {
    @Environment(PlannerStore.self) private var store
    @Environment(\.colorScheme) private var scheme
    @Environment(\.horizontalSizeClass) private var size
    var onSelect: (TaskRecord) -> Void
    @AppStorage("slate.calWeeks") private var weeks = 4
    @State private var mode = "month"
    @State private var anchor = Day.iso()
    @State private var google: [GoogleEvent] = []
    @State private var loadedRange = ""

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }
    private let hourHeight: CGFloat = 48

    var body: some View {
        let tasksByDay = Dictionary(grouping: store.tasks.filter { taskOpen($0) && $0.dueOn != nil }, by: { $0.dueOn! })
        let eventsByDay = Dictionary(grouping: google, by: \.day)
        VStack(spacing: 0) {
            header
            Group {
                switch mode {
                case "list":
                    agenda(tasksByDay: tasksByDay, eventsByDay: eventsByDay, days: 14)
                case "day", "3day", "week":
                    timeBoard(tasksByDay: tasksByDay, eventsByDay: eventsByDay, count: mode == "day" ? 1 : mode == "3day" ? 3 : 7)
                default:
                    if size == .compact {
                        phoneMonth(tasksByDay: tasksByDay, eventsByDay: eventsByDay)
                    } else {
                        monthGrid(tasksByDay: tasksByDay, eventsByDay: eventsByDay)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(palette.stage)
        .foregroundStyle(palette.ink)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: rangeKey) { await loadGoogle() }
        .onAppear { weeks = min(8, max(1, weeks)) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(monthTitle).font(.title2.bold())
                Spacer()
                Button { anchor = Day.iso() } label: { Text("Today").font(.subheadline.weight(.semibold)) }
                Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                Button { shift(1) } label: { Image(systemName: "chevron.right") }
            }
            HStack(spacing: 8) {
                Picker("View", selection: $mode) {
                    Text("List").tag("list")
                    Text("3 Day").tag("3day")
                    Text("Day").tag("day")
                    Text("Week").tag("week")
                    Text("Month").tag("month")
                }
                .pickerStyle(.segmented)
                if mode == "month" {
                    HStack(spacing: 6) {
                        Button { weeks = max(1, weeks - 1) } label: { Image(systemName: "minus") }
                            .disabled(weeks <= 1)
                        Text("\(weeks)w").font(.subheadline.weight(.semibold)).frame(minWidth: 28)
                        Button { weeks = min(8, weeks + 1) } label: { Image(systemName: "plus") }
                            .disabled(weeks >= 8)
                    }
                    .buttonStyle(.borderless)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(palette.chip, in: RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    private var monthTitle: String {
        Day.parse(anchor).formatted(.dateTime.month(.wide).year())
    }

    private var gridDays: [String] {
        let date = Day.parse(anchor)
        let comps = Calendar.current.dateComponents([.year, .month], from: date)
        let first = Calendar.current.date(from: comps) ?? date
        let weekday = Calendar.current.component(.weekday, from: first) - 1
        let start = Calendar.current.date(byAdding: .day, value: -weekday, to: first) ?? first
        let count = min(8, max(1, weeks)) * 7
        return (0..<count).map { Day.iso(Calendar.current.date(byAdding: .day, value: $0, to: start) ?? start) }
    }

    private var rangeKey: String {
        switch mode {
        case "week":
            let days = columnDays(7)
            return "\(days.first ?? anchor)|\(Day.add(days.last ?? anchor, days: 1))"
        case "3day":
            return "\(anchor)|\(Day.add(anchor, days: 3))"
        case "day":
            return "\(anchor)|\(Day.add(anchor, days: 1))"
        case "list":
            return "\(anchor)|\(Day.add(anchor, days: 14))"
        default:
            let days = gridDays
            return "\(days.first ?? anchor)|\(Day.add(days.last ?? anchor, days: 1))"
        }
    }

    private func columnDays(_ count: Int) -> [String] {
        let start: String
        if count == 7 {
            let weekday = Calendar.current.component(.weekday, from: Day.parse(anchor)) - 1
            start = Day.add(anchor, days: -weekday)
        } else {
            start = anchor
        }
        return (0..<count).map { Day.add(start, days: $0) }
    }

    private func loadGoogle() async {
        guard rangeKey != loadedRange else { return }
        let parts = rangeKey.split(separator: "|").map(String.init)
        guard parts.count == 2 else { return }
        google = await store.googleEvents(start: parts[0], end: parts[1])
        loadedRange = rangeKey
    }

    private func monthGrid(tasksByDay: [String: [TaskRecord]], eventsByDay: [String: [GoogleEvent]]) -> some View {
        let days = gridDays
        let labels = ["S", "M", "T", "W", "T", "F", "S"]
        return ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 0) {
                ForEach(labels.indices, id: \.self) { index in
                    Text(labels[index]).font(.caption2).foregroundStyle(palette.muted).frame(height: 22)
                }
                ForEach(days, id: \.self) { day in
                    dayCell(day, tasks: Array((tasksByDay[day] ?? []).prefix(3)), events: Array((eventsByDay[day] ?? []).prefix(3)))
                        .dropDestination(for: String.self) { ids, _ in
                            reschedule(ids.first, day: day, minutes: nil)
                        }
                }
            }
        }
    }

    private func phoneMonth(tasksByDay: [String: [TaskRecord]], eventsByDay: [String: [GoogleEvent]]) -> some View {
        VStack(spacing: 0) {
            let days = gridDays
            let labels = ["S", "M", "T", "W", "T", "F", "S"]
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 8) {
                ForEach(labels.indices, id: \.self) { index in
                    Text(labels[index]).font(.caption2).foregroundStyle(palette.muted)
                }
                ForEach(days, id: \.self) { day in
                    let marked = !(tasksByDay[day] ?? []).isEmpty || !(eventsByDay[day] ?? []).isEmpty
                    Button { anchor = day } label: {
                        VStack(spacing: 4) {
                            Text(String(Int(day.suffix(2)) ?? 0))
                                .font(.system(size: 15, weight: day == Day.iso() ? .bold : .regular))
                                .foregroundStyle(day == Day.iso() ? Color.white : palette.ink)
                                .frame(width: 28, height: 28)
                                .background(day == Day.iso() ? palette.blue : (day == anchor ? palette.chip : .clear), in: Circle())
                            Circle().fill(marked ? palette.blue : .clear).frame(width: 4, height: 4)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 8)
            agenda(tasksByDay: tasksByDay, eventsByDay: eventsByDay, days: 1)
                .frame(maxHeight: .infinity)
        }
    }

    private func dayCell(_ day: String, tasks: [TaskRecord], events: [GoogleEvent]) -> some View {
        let outside = Day.parse(day).formatted(.dateTime.month()) != Day.parse(anchor).formatted(.dateTime.month())
        return VStack(alignment: .leading, spacing: 2) {
            Text(String(Int(day.suffix(2)) ?? 0))
                .font(.system(size: 12, weight: day == Day.iso() ? .semibold : .medium))
                .foregroundStyle(day == Day.iso() ? Color.white : (outside ? palette.muted : palette.ink))
                .frame(width: 22, height: 22)
                .background(day == Day.iso() ? palette.blue : .clear, in: Circle())
            ForEach(tasks) { task in
                chip(task.title, color: palette.blue)
                    .draggable(task.id)
                    .onTapGesture { onSelect(task) }
            }
            ForEach(events.prefix(max(0, 4 - tasks.count))) { event in
                chip(event.title, color: Color(hex: event.color))
            }
        }
        .padding(4)
        .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
        .background(palette.stage)
        .overlay(alignment: .bottom) { palette.line.frame(height: 1) }
        .overlay(alignment: .trailing) { palette.line.frame(width: 1) }
        .opacity(outside ? 0.45 : 1)
    }

    private func chip(_ title: String, color: Color) -> some View {
        HStack(spacing: 4) {
            color.frame(width: 3)
            Text(title).font(.system(size: 11)).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 18)
        .background(color.opacity(0.22))
    }

    private func agenda(tasksByDay: [String: [TaskRecord]], eventsByDay: [String: [GoogleEvent]], days: Int) -> some View {
        List {
            ForEach(0..<days, id: \.self) { offset in
                let day = Day.add(anchor, days: offset)
                let tasks = tasksByDay[day] ?? []
                let events = eventsByDay[day] ?? []
                if days == 1 || !tasks.isEmpty || !events.isEmpty {
                    Section(days == 1 && day == Day.iso() ? "Today" : Day.label(day)) {
                        if tasks.isEmpty && events.isEmpty {
                            Text("Nothing scheduled").foregroundStyle(.secondary)
                        }
                        ForEach(tasks) { task in
                            Button { onSelect(task) } label: {
                                HStack {
                                    Image(systemName: "circle")
                                    Text(task.title).lineLimit(1)
                                    Spacer()
                                    if let time = task.dueTime {
                                        Text(Day.clock(time)).foregroundStyle(palette.blue)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                        ForEach(events) { event in
                            HStack {
                                Circle().fill(Color(hex: event.color)).frame(width: 8, height: 8)
                                Text(event.title).lineLimit(1)
                                Spacer()
                                if let time = event.time {
                                    Text(Day.clock(time)).foregroundStyle(palette.blue)
                                }
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }

    private func timeBoard(tasksByDay: [String: [TaskRecord]], eventsByDay: [String: [GoogleEvent]], count: Int) -> some View {
        let days = columnDays(count)
        return ScrollViewReader { proxy in
            ScrollView {
                HStack(alignment: .top, spacing: 0) {
                    VStack(spacing: 0) {
                        Color.clear.frame(height: 52)
                        ForEach(0..<24, id: \.self) { hour in
                            Text(hourLabel(hour))
                                .font(.caption2)
                                .foregroundStyle(palette.muted)
                                .frame(height: hourHeight, alignment: .top)
                                .id(hour == 8 ? "h8" : "h\(hour)")
                        }
                    }
                    .frame(width: 44)
                    ForEach(days, id: \.self) { day in
                        timeColumn(day: day, tasks: tasksByDay[day] ?? [], events: eventsByDay[day] ?? [])
                    }
                }
            }
            .onAppear { proxy.scrollTo("h8", anchor: .top) }
        }
    }

    private func timeColumn(day: String, tasks: [TaskRecord], events: [GoogleEvent]) -> some View {
        let blocks = timedBlocks(tasks: tasks, events: events)
        let lanes = timeLanes(blocks.map { ($0.id, $0.start) })
        let allDay = events.filter(\.allDay).prefix(2)
        return VStack(spacing: 0) {
            VStack(spacing: 2) {
                Text(Day.parse(day).formatted(.dateTime.weekday(.narrow)))
                    .font(.caption2)
                    .foregroundStyle(palette.muted)
                Text(String(Int(day.suffix(2)) ?? 0))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(day == Day.iso() ? Color.white : palette.ink)
                    .frame(width: 26, height: 26)
                    .background(day == Day.iso() ? palette.blue : .clear, in: Circle())
                if let first = allDay.first {
                    Text(first.title).font(.system(size: 10)).lineLimit(1).foregroundStyle(Color(hex: first.color))
                }
            }
            .frame(height: 52, alignment: .top)
            GeometryReader { geo in
                ZStack(alignment: .topLeading) {
                    Canvas { context, size in
                        for hour in 0..<24 {
                            let y = CGFloat(hour) * hourHeight
                            var path = Path()
                            path.move(to: CGPoint(x: 0, y: y))
                            path.addLine(to: CGPoint(x: size.width, y: y))
                            context.stroke(path, with: .color(palette.line), lineWidth: 1)
                        }
                    }
                    ForEach(blocks) { block in
                        let lane = lanes[block.id] ?? TimeLane(column: 0, columns: 1)
                        let width = geo.size.width / CGFloat(lane.columns)
                        Text(block.title)
                            .font(.system(size: 11))
                            .lineLimit(2)
                            .padding(.horizontal, 4)
                            .frame(width: max(8, width - 4), height: hourHeight - 4, alignment: .topLeading)
                            .background(block.color.opacity(0.28), in: RoundedRectangle(cornerRadius: 4))
                            .overlay(alignment: .leading) { block.color.frame(width: 3) }
                            .offset(x: width * CGFloat(lane.column) + 2, y: CGFloat(block.start) / 60 * hourHeight)
                            .draggable(block.task?.id ?? "")
                            .onTapGesture { if let task = block.task { onSelect(task) } }
                    }
                }
                .frame(height: hourHeight * 24)
            }
            .frame(height: hourHeight * 24)
            .dropDestination(for: String.self) { ids, location in
                let minute = max(0, min(23 * 60 + 45, Int(location.y / hourHeight) * 60))
                return reschedule(ids.first, day: day, minutes: minute)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private struct TimeBlock: Identifiable {
        var id: String
        var title: String
        var start: Int
        var color: Color
        var task: TaskRecord?
    }

    private func timedBlocks(tasks: [TaskRecord], events: [GoogleEvent]) -> [TimeBlock] {
        var items: [TimeBlock] = []
        for task in tasks {
            guard let time = task.dueTime else { continue }
            items.append(TimeBlock(id: "task:\(task.id)", title: task.title, start: clockMinutes(time), color: palette.blue, task: task))
        }
        for event in events where event.time != nil && !event.allDay {
            items.append(TimeBlock(id: "event:\(event.id)", title: event.title, start: clockMinutes(event.time), color: Color(hex: event.color), task: nil))
        }
        return items.sorted { $0.start < $1.start }
    }

    private func clockMinutes(_ value: String?) -> Int {
        guard let value else { return 0 }
        let bits = value.split(separator: ":").compactMap { Int($0) }
        return (bits.first ?? 0) * 60 + (bits.dropFirst().first ?? 0)
    }

    private func hourLabel(_ hour: Int) -> String {
        let suffix = hour >= 12 ? "PM" : "AM"
        let hour12 = hour % 12 == 0 ? 12 : hour % 12
        return "\(hour12) \(suffix)"
    }

    private func reschedule(_ id: String?, day: String, minutes: Int?) -> Bool {
        guard let id, var task = store.tasks.first(where: { $0.id == id }) else { return false }
        task.dueOn = day
        if let minutes {
            task.dueTime = String(format: "%02d:%02d", minutes / 60, minutes % 60)
        }
        store.saveTask(task)
        return true
    }

    private func shift(_ direction: Int) {
        switch mode {
        case "month":
            anchor = Day.iso(Calendar.current.date(byAdding: .month, value: direction, to: Day.parse(anchor)) ?? .now)
        case "week", "list":
            anchor = Day.add(anchor, days: direction * 7)
        case "3day":
            anchor = Day.add(anchor, days: direction * 3)
        default:
            anchor = Day.add(anchor, days: direction)
        }
    }
}

struct HabitScreen: View {
    @Environment(PlannerStore.self) private var store
    @Environment(\.colorScheme) private var scheme
    @State private var name = ""
    @State private var selected: String?
    @State private var addOpen = false

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }

    var body: some View {
        let habits = store.habits.filter { $0.deletedAt == nil }.sorted { $0.sort < $1.sort }
        let day = Day.iso()
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Habit").font(.title2.bold()).frame(maxWidth: .infinity)
                weekStrip(today: day)
                ForEach(habits) { habit in
                    let done = progress(habit, day: day) >= habit.goal
                    HStack(spacing: 12) {
                        Button { toggle(habit, day: day) } label: {
                            Image(systemName: done ? "checkmark.circle.fill" : "circle")
                                .font(.title3)
                                .foregroundStyle(Color(hex: habit.color))
                        }
                        .buttonStyle(.plain)
                        Text(habit.name).font(.body.weight(.medium)).lineLimit(1)
                        Spacer(minLength: 8)
                        Button { selected = selected == habit.id ? nil : habit.id } label: {
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(streak(habit))").font(.title3.weight(.semibold))
                                Text("Current Streak").font(.caption2).foregroundStyle(palette.muted)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(14)
                    .background(palette.chip, in: RoundedRectangle(cornerRadius: 14))
                }
                if let selected {
                    heatmap(habitId: selected, day: day)
                        .padding(.top, 4)
                }
            }
            .padding(16)
            .padding(.bottom, 72)
        }
        .overlay(alignment: .bottomTrailing) {
            Button { addOpen = true } label: {
                Image(systemName: "plus")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(palette.blue, in: Circle())
            }
            .padding(20)
        }
        .sheet(isPresented: $addOpen) {
            NavigationStack {
                HStack {
                    TextField("New habit", text: $name)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { add(); addOpen = false }
                    Button("Add") { add(); addOpen = false }
                        .buttonStyle(.borderedProminent)
                }
                .padding()
                .navigationTitle("New habit")
                .navigationBarTitleDisplayMode(.inline)
            }
            .presentationDetents([.height(160)])
        }
        .background(palette.stage)
        .foregroundStyle(palette.ink)
        .toolbar(.hidden, for: .navigationBar)
    }

    private func weekStrip(today: String) -> some View {
        let weekday = Calendar.current.component(.weekday, from: Day.parse(today)) - 1
        let start = Day.add(today, days: -weekday)
        let days = (0..<7).map { Day.add(start, days: $0) }
        return HStack {
            ForEach(days, id: \.self) { day in
                VStack(spacing: 6) {
                    Text(Day.parse(day).formatted(.dateTime.weekday(.narrow)))
                        .font(.caption2)
                        .foregroundStyle(palette.muted)
                    Text(String(Int(day.suffix(2)) ?? 0))
                        .font(.system(size: 15, weight: day == today ? .bold : .regular))
                        .foregroundStyle(day == today ? Color.white : palette.ink)
                        .frame(width: 28, height: 28)
                        .background(day == today ? palette.blue : .clear, in: Circle())
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func streak(_ habit: HabitRecord) -> Int {
        let checked = Set(store.habitChecks.filter { $0.habitId == habit.id && $0.count > 0 }.map(\.day))
        var cursor = Day.iso()
        if !checked.contains(cursor) { cursor = Day.add(cursor, days: -1) }
        var count = 0
        while count < 400 && checked.contains(cursor) {
            count += 1
            cursor = Day.add(cursor, days: -1)
        }
        return count
    }

    private func add() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        store.saveHabit(HabitRecord(id: UUID().uuidString, name: trimmed, color: "#22A06B", cadence: "daily", goal: 1, sort: Date().timeIntervalSince1970, updatedAt: "", deletedAt: nil))
        name = ""
    }

    private func progress(_ habit: HabitRecord, day: String) -> Int {
        if habit.cadence == "weekly" {
            let date = Day.parse(day)
            let weekday = Calendar.current.component(.weekday, from: date) - 1
            let start = Day.add(day, days: -weekday)
            let end = Day.add(start, days: 6)
            return store.habitChecks.filter { $0.habitId == habit.id && $0.day >= start && $0.day <= end }.reduce(0) { $0 + $1.count }
        }
        return store.habitChecks.first { $0.habitId == habit.id && $0.day == day }?.count ?? 0
    }

    private func toggle(_ habit: HabitRecord, day: String) {
        let existing = store.habitChecks.first { $0.habitId == habit.id && $0.day == day }?.count ?? 0
        let next = progress(habit, day: day) >= habit.goal ? 0 : existing + 1
        store.saveCheck(HabitCheckRecord(id: "\(habit.id):\(day)", habitId: habit.id, day: day, count: next, updatedAt: ""))
    }

    private func heatmap(habitId: String, day: String) -> some View {
        let date = Day.parse(day)
        let comps = Calendar.current.dateComponents([.year, .month], from: date)
        let first = Calendar.current.date(from: comps) ?? date
        let weekday = Calendar.current.component(.weekday, from: first) - 1
        let start = Calendar.current.date(byAdding: .day, value: -weekday, to: first) ?? first
        let cells = (0..<42).map { Day.iso(Calendar.current.date(byAdding: .day, value: $0, to: start) ?? start) }
        return LazyVGrid(columns: Array(repeating: GridItem(.fixed(16), spacing: 4), count: 7), spacing: 4) {
            ForEach(cells, id: \.self) { cell in
                let count = store.habitChecks.first { $0.habitId == habitId && $0.day == cell }?.count ?? 0
                RoundedRectangle(cornerRadius: 3)
                    .fill(count > 0 ? Color.green : Color.gray.opacity(0.2))
                    .frame(width: 16, height: 16)
            }
        }
    }
}

struct CountdownScreen: View {
    @Environment(PlannerStore.self) private var store
    @Environment(\.colorScheme) private var scheme
    @Environment(\.horizontalSizeClass) private var size
    @State private var title = ""
    @State private var selected: CountdownRecord?
    @State private var addOpen = false

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }

    var body: some View {
        let items = store.countdowns.filter { $0.deletedAt == nil }.sorted { $0.sort < $1.sort }
        let columns = size == .compact
            ? [GridItem(.flexible(), spacing: 12)]
            : [GridItem(.adaptive(minimum: 240), spacing: 12)]
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Countdown").font(.title2.bold()).frame(maxWidth: .infinity)
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(items) { item in
                        let amount = amount(for: item)
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.title).font(.headline).lineLimit(1)
                                Text(phrase(item, amount))
                                    .font(.caption)
                                    .foregroundStyle(palette.muted)
                            }
                            Spacer(minLength: 8)
                            Text("\(amount)")
                                .font(.system(size: size == .compact ? 34 : 52, weight: .bold))
                                .foregroundStyle(Color(hex: item.color))
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, minHeight: size == .compact ? 72 : 140, alignment: .leading)
                        .background(palette.chip, in: RoundedRectangle(cornerRadius: 16))
                        .onTapGesture { selected = item }
                        .contextMenu {
                            Button("Delete", role: .destructive) { remove(item) }
                        }
                    }
                }
            }
            .padding(16)
            .padding(.bottom, 72)
        }
        .overlay(alignment: .bottomTrailing) {
            Button { addOpen = true } label: {
                Image(systemName: "plus")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(palette.blue, in: Circle())
            }
            .padding(20)
        }
        .sheet(isPresented: $addOpen) {
            NavigationStack {
                HStack {
                    TextField("New countdown", text: $title)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { add(); addOpen = false }
                    Button("Add") { add(); addOpen = false }
                        .buttonStyle(.borderedProminent)
                }
                .padding()
                .navigationTitle("New countdown")
                .navigationBarTitleDisplayMode(.inline)
            }
            .presentationDetents([.height(160)])
        }
        .sheet(item: $selected) { record in
            NavigationStack {
                if let current = store.countdowns.first(where: { $0.id == record.id }) {
                    editor(current)
                        .padding()
                        .navigationTitle(current.title)
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Done") { selected = nil }
                            }
                        }
                }
            }
        }
        .background(palette.stage)
        .foregroundStyle(palette.ink)
        .toolbar(.hidden, for: .navigationBar)
    }

    private func remove(_ record: CountdownRecord) {
        var next = record
        next.deletedAt = ISO8601DateFormatter().string(from: .now)
        store.saveCountdown(next)
        if selected?.id == record.id { selected = nil }
    }

    private func phrase(_ record: CountdownRecord, _ amount: Int) -> String {
        let unit = record.unit + (abs(amount) == 1 ? "" : "s")
        if amount == 0 { return record.mode == "countup" ? "Started today" : "Today" }
        if record.mode == "countup" { return "\(unit) since" }
        return "\(unit) left"
    }

    private func add() {
        let trimmed = title.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        let record = CountdownRecord(id: UUID().uuidString, title: trimmed, day: Day.iso(), mode: "countdown", repeatYearly: false, unit: "day", color: "#4C6FFF", imageKey: nil, sort: Date().timeIntervalSince1970, updatedAt: "", deletedAt: nil)
        store.saveCountdown(record)
        selected = record
        title = ""
    }

    private func editor(_ record: CountdownRecord) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Title", text: Binding(get: { record.title }, set: { value in
                var next = record
                next.title = value
                store.saveCountdown(next)
            }))
            TextField("Date", text: Binding(get: { record.day }, set: { value in
                var next = record
                next.day = value
                store.saveCountdown(next)
            }))
            Picker("Mode", selection: Binding(get: { record.mode }, set: { value in
                var next = record
                next.mode = value
                store.saveCountdown(next)
            })) {
                Text("Countdown").tag("countdown")
                Text("Count up").tag("countup")
            }
            Picker("Unit", selection: Binding(get: { record.unit }, set: { value in
                var next = record
                next.unit = value
                store.saveCountdown(next)
            })) {
                Text("Days").tag("day")
                Text("Weeks").tag("week")
                Text("Months").tag("month")
                Text("Years").tag("year")
            }
            Toggle("Repeats yearly", isOn: Binding(get: { record.repeatYearly }, set: { value in
                var next = record
                next.repeatYearly = value
                store.saveCountdown(next)
            }))
            Button("Delete", role: .destructive) {
                var next = record
                next.deletedAt = ISO8601DateFormatter().string(from: .now)
                store.saveCountdown(next)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func amount(for record: CountdownRecord) -> Int {
        let today = Day.iso()
        let start = Day.parse(record.mode == "countup" ? record.day : today)
        let end = Day.parse(record.mode == "countup" ? today : record.day)
        let days = Calendar.current.dateComponents([.day], from: start, to: end).day ?? 0
        switch record.unit {
        case "week": return days / 7
        case "month": return days / 30
        case "year": return days / 365
        default: return days
        }
    }
}

private func priorityColor(_ priority: Int) -> Color {
    switch priority {
    case 3: return .red
    case 2: return .orange
    default: return .blue
    }
}
