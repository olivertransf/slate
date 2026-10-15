import Foundation
import Observation
import UserNotifications

@MainActor
@Observable
final class PlannerStore {
    var ready = false
    var unlocked = false
    var syncing = false
    var error: String?
    static let productionURL = "https://slate.olivertran.me"
    var baseURL = PlannerStore.preferredBase(UserDefaults.standard.string(forKey: "slate.base"))
    var googleMessage: String?
    var lists: [ListRecord] = []
    var tasks: [TaskRecord] = [] {
        didSet { taskGeneration &+= 1 }
    }
    @ObservationIgnored private var indexCache: TaskIndex?
    @ObservationIgnored private var indexGeneration = -1
    private(set) var taskGeneration = 0

    var taskIndex: TaskIndex {
        let generation = taskGeneration
        if let indexCache, indexGeneration == generation { return indexCache }
        let built = TaskIndex.make(tasks)
        indexCache = built
        indexGeneration = generation
        return built
    }
    var tags: [TagRecord] = []
    var habits: [HabitRecord] = []
    var habitChecks: [HabitCheckRecord] = []
    var countdowns: [CountdownRecord] = []
    var googleAccount: GoogleStatus?
    private(set) var googleGeneration = 0

    private var revision = 0
    private var token: String?
    private var flushToken = UUID().uuidString
    private var pending: [String: Pending] = [:]
    private var flushing = false
    private var googleDays: [String: GoogleDay] = [:]
    private var googleSave: Task<Void, Never>?

    func boot() async {
        let preferred = Self.preferredBase(UserDefaults.standard.string(forKey: "slate.base"))
        if preferred != baseURL || preferred != UserDefaults.standard.string(forKey: "slate.base") {
            baseURL = preferred
            UserDefaults.standard.set(preferred, forKey: "slate.base")
        }
        token = Keychain.load()
        if let cached = loadCache() { apply(cached, replace: true) }
        loadGoogleFile()
        loadPending()
        unlocked = token != nil
        ready = true
        if token != nil {
            drainIntents()
            await renewIfNeeded()
            await pull()
            await refreshGoogle()
        }
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(8))
            await pull()
        }
    }

    func refresh() async {
        await pull()
        await refreshGoogle()
    }

    func unlock(passphrase: String) async -> String? {
        UserDefaults.standard.set(baseURL, forKey: "slate.base")
        guard let url = URL(string: baseURL) else { return "Enter a server address." }
        do {
            token = try await APIClient(baseURL: url, token: nil).unlock(passphrase: passphrase)
            Keychain.save(token!)
            unlocked = true
            await pull()
            await refreshGoogle()
            return nil
        } catch let error as APIError {
            return describe(error)
        } catch {
            return error.localizedDescription
        }
    }

    func lock() {
        let current = client()
        token = nil
        Keychain.clear()
        unlocked = false
        Task { try? await current?.endSession() }
    }

    func saveTask(_ record: TaskRecord) {
        var next = record
        next.updatedAt = stamp()
        tasks = upsert(tasks, next)
        queue("tasks", next)
    }

    func saveList(_ record: ListRecord) {
        var next = record
        next.updatedAt = stamp()
        lists = upsert(lists, next)
        queue("lists", next)
    }

    func saveTag(_ record: TagRecord) {
        var next = record
        next.updatedAt = stamp()
        tags = upsert(tags, next)
        queue("tags", next)
    }

    func saveHabit(_ record: HabitRecord) {
        var next = record
        next.updatedAt = stamp()
        habits = upsert(habits, next)
        queue("habits", next)
    }

    func saveCheck(_ record: HabitCheckRecord) {
        var next = record
        next.updatedAt = stamp()
        habitChecks = upsert(habitChecks, next)
        queue("habitChecks", next)
    }

    func saveCountdown(_ record: CountdownRecord) {
        var next = record
        next.updatedAt = stamp()
        countdowns = upsert(countdowns, next)
        queue("countdowns", next)
    }

    func complete(_ task: TaskRecord) {
        var next = task
        if let rule = task.repeatRule, let due = task.dueOn, task.completedAt == nil {
            next.dueOn = advance(due, rule: rule)
            next.completedAt = nil
        } else {
            next.completedAt = task.completedAt == nil ? stamp() : nil
        }
        saveTask(next)
    }

    private func queue<T: Encodable & Identifiable>(_ kind: String, _ record: T) where T.ID == String {
        guard let data = try? JSONEncoder().encode(record),
              let json = String(data: data, encoding: .utf8) else { return }
        pending["\(kind):\(record.id)"] = Pending(kind: kind, id: record.id, json: json)
        savePending()
        scheduleReminders()
        Task { await flush() }
    }

    private func pull() async {
        guard unlocked, let client = client() else { return }
        do {
            guard let remote = try await client.manifest(known: revision), remote != revision else { return }
            let snapshot = try await client.snapshot(after: revision)
            apply(snapshot, replace: snapshot.reset)
            if !pending.isEmpty { await flush() }
        } catch APIError.locked {
            lock()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func flush() async {
        guard !flushing, !pending.isEmpty, let client = client() else { return }
        flushing = true
        syncing = true
        let batch = pending
        let token = flushToken
        pending = [:]
        var records: [String: [Any]] = [:]
        for item in batch.values {
            guard let data = item.json.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) else { continue }
            records[item.kind, default: []].append(object)
        }
        do {
            let snapshot = try await client.push(baseRevision: revision, records: records, mutationId: token)
            apply(snapshot, replace: snapshot.reset)
            if flushToken == token { flushToken = UUID().uuidString }
            error = nil
            savePending()
        } catch let APIError.conflict(snapshot) {
            for (key, value) in batch where pending[key] == nil { pending[key] = value }
            savePending()
            apply(snapshot, replace: snapshot.reset)
            flushing = false
            syncing = false
            await flush()
            return
        } catch {
            for (key, value) in batch where pending[key] == nil { pending[key] = value }
            savePending()
            self.error = "Changes are saved on this device and will sync when the connection returns."
        }
        flushing = false
        syncing = false
    }

    private func apply(_ snapshot: Snapshot, replace: Bool) {
        if replace || snapshot.reset {
            lists = snapshot.lists
            tasks = snapshot.tasks
            tags = snapshot.tags
            habits = snapshot.habits
            habitChecks = snapshot.habitChecks
            countdowns = snapshot.countdowns
        } else {
            lists = merge(lists, snapshot.lists) { $0.updatedAt }
            tasks = merge(tasks, snapshot.tasks) { $0.updatedAt }
            tags = merge(tags, snapshot.tags) { $0.updatedAt }
            habits = merge(habits, snapshot.habits) { $0.updatedAt }
            habitChecks = merge(habitChecks, snapshot.habitChecks) { $0.updatedAt }
            countdowns = merge(countdowns, snapshot.countdowns) { $0.updatedAt }
        }
        overlayPending()
        revision = snapshot.revision
        let library = Snapshot(
            revision: revision,
            reset: true,
            lists: lists,
            tasks: tasks,
            tags: tags,
            habits: habits,
            habitChecks: habitChecks,
            countdowns: countdowns
        )
        if let data = try? JSONEncoder().encode(library) {
            try? FileManager.default.createDirectory(at: cacheURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? data.write(to: cacheURL, options: .atomic)
            UserDefaults.standard.removeObject(forKey: "slate.cache")
        }
        scheduleReminders()
    }

    private var pendingURL: URL {
        cacheURL.deletingLastPathComponent().appendingPathComponent("pending.json")
    }

    private func savePending() {
        let stored = PendingFile(token: flushToken, items: Array(pending.values))
        guard let data = try? JSONEncoder().encode(stored) else { return }
        try? FileManager.default.createDirectory(at: pendingURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: pendingURL, options: .atomic)
    }

    private func loadPending() {
        guard let data = try? Data(contentsOf: pendingURL),
              let stored = try? JSONDecoder().decode(PendingFile.self, from: data) else { return }
        flushToken = stored.token
        pending = Dictionary(uniqueKeysWithValues: stored.items.map { ("\($0.kind):\($0.id)", $0) })
    }

    private func overlayPending() {
        let decoder = JSONDecoder()
        for item in pending.values {
            guard let data = item.json.data(using: .utf8) else { continue }
            switch item.kind {
            case "lists":
                if let record = try? decoder.decode(ListRecord.self, from: data) { lists = merge(lists, [record]) { $0.updatedAt } }
            case "tasks":
                if let record = try? decoder.decode(TaskRecord.self, from: data) { tasks = merge(tasks, [record]) { $0.updatedAt } }
            case "tags":
                if let record = try? decoder.decode(TagRecord.self, from: data) { tags = merge(tags, [record]) { $0.updatedAt } }
            case "habits":
                if let record = try? decoder.decode(HabitRecord.self, from: data) { habits = merge(habits, [record]) { $0.updatedAt } }
            case "habitChecks":
                if let record = try? decoder.decode(HabitCheckRecord.self, from: data) { habitChecks = merge(habitChecks, [record]) { $0.updatedAt } }
            case "countdowns":
                if let record = try? decoder.decode(CountdownRecord.self, from: data) { countdowns = merge(countdowns, [record]) { $0.updatedAt } }
            default:
                break
            }
        }
    }

    private func renewIfNeeded() async {
        guard let token, let exp = Int(token.split(separator: ".").first ?? "") else { return }
        guard exp - Int(Date().timeIntervalSince1970) < 2 * 86_400, let client = client() else { return }
        if let next = try? await client.renew() {
            self.token = next
            Keychain.save(next)
        }
    }

    private func drainIntents() {
        let titles = UserDefaults.standard.stringArray(forKey: "slate.intent.tasks") ?? []
        guard !titles.isEmpty else { return }
        UserDefaults.standard.removeObject(forKey: "slate.intent.tasks")
        for title in titles where !title.trimmingCharacters(in: .whitespaces).isEmpty {
            saveTask(TaskRecord(
                id: UUID().uuidString, title: title, notes: "", listId: nil, sectionId: nil, priority: 0,
                tagIds: [], dueOn: nil, dueTime: nil, repeatRule: nil, remindMinutesBefore: nil,
                completedAt: nil, subtasks: [], sort: Date().timeIntervalSince1970, updatedAt: "", deletedAt: nil
            ))
        }
    }

    private var cacheURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Slate", isDirectory: true)
            .appendingPathComponent("library.json")
    }

    private func loadCache() -> Snapshot? {
        if let data = try? Data(contentsOf: cacheURL),
           let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data),
           snapshot.reset {
            return snapshot
        }
        guard let data = UserDefaults.standard.data(forKey: "slate.cache"),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data),
              snapshot.reset else { return nil }
        return snapshot
    }

    private func client() -> APIClient? {
        guard let token, let url = URL(string: baseURL) else { return nil }
        return APIClient(baseURL: url, token: token)
    }

    private func scheduleReminders() {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
        center.removePendingNotificationRequests(withIdentifiers: tasks.map(\.id))
        for task in tasks where task.deletedAt == nil && task.completedAt == nil && task.remindMinutesBefore != nil {
            guard let date = reminderDate(for: task), date > .now else { continue }
            let content = UNMutableNotificationContent()
            content.title = task.title
            content.body = "Due \(Day.label(task.dueOn ?? Day.iso()))"
            let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
            center.add(UNNotificationRequest(identifier: task.id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)))
        }
    }

    private func reminderDate(for task: TaskRecord) -> Date? {
        guard let dueOn = task.dueOn else { return nil }
        var date = Day.parse(dueOn)
        if let time = task.dueTime {
            let bits = time.split(separator: ":").compactMap { Int($0) }
            date = Calendar.current.date(bySettingHour: bits.first ?? 9, minute: bits.dropFirst().first ?? 0, second: 0, of: date) ?? date
        } else {
            date = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: date) ?? date
        }
        return date.addingTimeInterval(TimeInterval(-(task.remindMinutesBefore ?? 0) * 60))
    }

    private func advance(_ due: String, rule: RepeatRule) -> String {
        var cursor = due
        let today = Day.iso()
        var guardCount = 0
        while cursor <= today && guardCount < 4000 {
            guardCount += 1
            switch rule.unit {
            case .day: cursor = Day.add(cursor, days: max(1, rule.every))
            case .week: cursor = Day.add(cursor, days: max(1, rule.every) * 7)
            case .month:
                cursor = Day.iso(Calendar.current.date(byAdding: .month, value: max(1, rule.every), to: Day.parse(cursor)) ?? .now)
            case .year:
                cursor = Day.iso(Calendar.current.date(byAdding: .year, value: max(1, rule.every), to: Day.parse(cursor)) ?? .now)
            }
        }
        return cursor
    }

    private func describe(_ error: APIError) -> String {
        switch error {
        case .locked: return "Unlock required."
        case .conflict: return "Synced the latest copy."
        case .message(let text): return text
        }
    }

    func useServer(_ value: String) {
        let next = Self.preferredBase(value)
        baseURL = next
        UserDefaults.standard.set(next, forKey: "slate.base")
        clearGoogle()
        Task { await refreshGoogle() }
    }

    func refreshGoogle() async {
        guard let client = client() else {
            googleMessage = "The server address is invalid."
            return
        }
        do {
            let next = try await client.googleStatus()
            let was = googleAccount?.connected == true
            googleAccount = next
            googleMessage = nil
            if next.connected != was {
                if next.connected { markGoogleStale() } else { clearGoogle() }
                googleGeneration += 1
            }
            saveGoogleSoon()
        } catch {
            googleMessage = "Could not reach \(baseURL)."
            if googleAccount?.connected != true { googleAccount = nil }
        }
    }

    static func preferredBase(_ stored: String?) -> String {
        var value = stored?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if value.isEmpty {
            #if targetEnvironment(simulator)
            return "http://127.0.0.1:3000"
            #else
            return productionURL
            #endif
        }
        if !value.contains("://") { value = "https://\(value)" }
        let host = URL(string: value)?.host?.lowercased() ?? ""
        #if targetEnvironment(simulator)
        return value
        #else
        if host == "localhost" || host == "127.0.0.1" || host.hasSuffix(".trycloudflare.com") {
            return productionURL
        }
        return value
        #endif
    }

    func cachedGoogleEvents(start: String, end: String) -> [GoogleEvent] {
        googleRange(start, end).flatMap { googleDays[$0]?.events ?? [] }
    }

    func googleEvents(start: String, end: String) async -> [GoogleEvent] {
        let days = googleRange(start, end)
        let fresh = days.allSatisfy { day in
            googleDays[day].map { Date().timeIntervalSince($0.at) < 120 } ?? false
        }
        if fresh { return cachedGoogleEvents(start: start, end: end) }
        guard googleAccount?.connected != false, let client = client() else { return cachedGoogleEvents(start: start, end: end) }
        do {
            let events = try await client.googleEvents(start: start, end: end)
            if events.isEmpty, googleAccount?.connected != true { return cachedGoogleEvents(start: start, end: end) }
            let grouped = Dictionary(grouping: events, by: \.day)
            let now = Date()
            for day in days { googleDays[day] = GoogleDay(at: now, events: grouped[day] ?? []) }
            saveGoogleSoon()
            return cachedGoogleEvents(start: start, end: end)
        } catch {
            return cachedGoogleEvents(start: start, end: end)
        }
    }

    func convertToEvent(_ task: TaskRecord) async -> String? {
        guard googleAccount?.connected == true else { return "Connect Google Calendar in Settings first." }
        guard let client = client() else { return "The server address is invalid." }
        do {
            _ = try await client.createEvent(from: task, day: task.dueOn ?? Day.iso())
        } catch let error as APIError {
            return describe(error)
        } catch {
            return "Could not reach \(baseURL)."
        }
        var trashed = task
        trashed.deletedAt = ISO8601DateFormatter().string(from: .now)
        saveTask(trashed)
        markGoogleStale()
        googleGeneration += 1
        return nil
    }

    func googleStartURL() async -> URL? {
        guard let client = client() else { return nil }
        return try? await client.googleStartURL()
    }

    func attachImage(_ record: CountdownRecord, data: Data) async {
        guard let client = client(), let key = try? await client.uploadImage(data, type: "image/jpeg") else { return }
        var next = record
        next.imageKey = key
        saveCountdown(next)
    }

    func googleLogout() async {
        guard let client = client() else { return }
        try? await client.googleLogout()
        googleAccount = GoogleStatus(configured: googleAccount?.configured ?? true, connected: false, calendars: [])
        clearGoogle()
        googleGeneration += 1
    }

    private var googleURL: URL {
        cacheURL.deletingLastPathComponent().appendingPathComponent("google.json")
    }

    private func googleRange(_ start: String, _ end: String) -> [String] {
        var days: [String] = []
        var cursor = start
        while cursor < end && days.count < 400 {
            days.append(cursor)
            cursor = Day.add(cursor, days: 1)
        }
        return days
    }

    private func loadGoogleFile() {
        guard let data = try? Data(contentsOf: googleURL),
              let file = try? JSONDecoder().decode(GoogleFile.self, from: data),
              file.server == baseURL else { return }
        googleDays = file.days
        if googleAccount == nil { googleAccount = file.account }
    }

    private func saveGoogleSoon() {
        googleSave?.cancel()
        googleSave = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled, let self else { return }
            let low = Day.add(Day.iso(), days: -120)
            let high = Day.add(Day.iso(), days: 400)
            self.googleDays = self.googleDays.filter { $0.key >= low && $0.key <= high }
            let file = GoogleFile(server: self.baseURL, account: self.googleAccount, days: self.googleDays)
            guard let data = try? JSONEncoder().encode(file) else { return }
            try? FileManager.default.createDirectory(at: self.googleURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? data.write(to: self.googleURL, options: .atomic)
        }
    }

    private func markGoogleStale() {
        for key in googleDays.keys { googleDays[key]?.at = .distantPast }
    }

    private func clearGoogle() {
        googleSave?.cancel()
        googleDays.removeAll()
        try? FileManager.default.removeItem(at: googleURL)
    }

    private func stamp() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: .now)
    }

}

private struct Pending: Codable {
    var kind: String
    var id: String
    var json: String
}

private struct PendingFile: Codable {
    var token: String
    var items: [Pending]
}

private func parseStamp(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: value) { return date }
    return ISO8601DateFormatter().date(from: value)
}

private struct GoogleDay: Codable {
    var at: Date
    var events: [GoogleEvent]
}

private struct GoogleFile: Codable {
    var server: String
    var account: GoogleStatus?
    var days: [String: GoogleDay]
}

private func upsert<T: Identifiable>(_ list: [T], _ item: T) -> [T] where T.ID == String {
    var next = list
    if let index = next.firstIndex(where: { $0.id == item.id }) { next[index] = item } else { next.append(item) }
    return next
}

private func merge<T: Identifiable>(_ local: [T], _ remote: [T], stamp: (T) -> String) -> [T] where T.ID == String {
    var map = Dictionary(uniqueKeysWithValues: local.map { ($0.id, $0) })
    for item in remote {
        if let current = map[item.id] {
            let left = parseStamp(stamp(current))?.timeIntervalSince1970 ?? 0
            let right = parseStamp(stamp(item))?.timeIntervalSince1970 ?? 0
            if right < left { continue }
        }
        map[item.id] = item
    }
    return Array(map.values)
}
