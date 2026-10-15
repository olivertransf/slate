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
    var baseURL = UserDefaults.standard.string(forKey: "slate.base") ?? "http://127.0.0.1:3000"
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
    private var pending: [String: Pending] = [:]
    private var flushing = false
    private var googleCache: [GoogleCache] = []

    func boot() async {
        token = Keychain.load()
        if let cached = loadCache() { apply(cached, replace: true) }
        if token != nil {
            unlocked = true
            await pull()
            await refreshGoogle()
        }
        ready = true
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
            return nil
        } catch let error as APIError {
            return describe(error)
        } catch {
            return error.localizedDescription
        }
    }

    func lock() {
        token = nil
        Keychain.clear()
        unlocked = false
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
              let object = try? JSONSerialization.jsonObject(with: data) else { return }
        pending["\(kind):\(record.id)"] = Pending(kind: kind, object: object)
        scheduleReminders()
        Task { await flush() }
    }

    private func pull() async {
        guard unlocked, let client = client() else { return }
        do {
            guard let remote = try await client.manifest(known: revision), remote != revision else { return }
            let snapshot = try await client.snapshot(after: revision)
            if pending.isEmpty { apply(snapshot, replace: snapshot.reset) }
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
        pending = [:]
        var records: [String: [Any]] = [:]
        for item in batch.values {
            records[item.kind, default: []].append(item.object)
        }
        do {
            let snapshot = try await client.push(baseRevision: revision, records: records)
            apply(snapshot, replace: snapshot.reset)
            error = nil
        } catch let APIError.conflict(snapshot) {
            apply(snapshot, replace: snapshot.reset)
            for (key, value) in batch where pending[key] == nil { pending[key] = value }
            flushing = false
            syncing = false
            await flush()
            return
        } catch {
            for (key, value) in batch where pending[key] == nil { pending[key] = value }
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
            lists = merge(lists, snapshot.lists)
            tasks = merge(tasks, snapshot.tasks)
            tags = merge(tags, snapshot.tags)
            habits = merge(habits, snapshot.habits)
            habitChecks = merge(habitChecks, snapshot.habitChecks)
            countdowns = merge(countdowns, snapshot.countdowns)
        }
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

    func googleStatus() async -> GoogleStatus? {
        guard let client = client() else { return nil }
        return try? await client.googleStatus()
    }

    func refreshGoogle() async {
        let next = await googleStatus()
        let was = googleAccount?.connected == true
        googleAccount = next
        if (next?.connected == true) != was {
            googleCache.removeAll()
            googleGeneration += 1
        }
    }

    func googleEvents(start: String, end: String) async -> [GoogleEvent] {
        if let hit = freshGoogle(start: start, end: end) { return hit }
        guard let client = client() else { return storedGoogle(start: start, end: end) }
        do {
            let events = try await client.googleEvents(start: start, end: end)
            if events.isEmpty, googleAccount?.connected != true { return events }
            googleCache.append(GoogleCache(start: start, end: end, at: .now, events: events))
            if googleCache.count > 8 { googleCache.removeFirst(googleCache.count - 8) }
            return events
        } catch {
            return storedGoogle(start: start, end: end)
        }
    }

    func googleStartURL() async -> URL? {
        guard let client = client() else { return nil }
        return try? await client.googleStartURL()
    }

    func googleLogout() async {
        guard let client = client() else { return }
        try? await client.googleLogout()
        googleAccount = GoogleStatus(configured: googleAccount?.configured ?? true, connected: false, calendars: [])
        googleCache.removeAll()
        googleGeneration += 1
    }

    private func stamp() -> String { ISO8601DateFormatter().string(from: .now) }

    private func freshGoogle(start: String, end: String) -> [GoogleEvent]? {
        guard let hit = googleCache.last(where: { $0.start <= start && $0.end >= end && Date().timeIntervalSince($0.at) < 120 }) else {
            return nil
        }
        return hit.events.filter { $0.day >= start && $0.day < end }
    }

    private func storedGoogle(start: String, end: String) -> [GoogleEvent] {
        guard let hit = googleCache.last(where: { $0.start <= start && $0.end >= end }) else { return [] }
        return hit.events.filter { $0.day >= start && $0.day < end }
    }
}

private struct Pending {
    var kind: String
    var object: Any
}

private struct GoogleCache {
    var start: String
    var end: String
    var at: Date
    var events: [GoogleEvent]
}

private func upsert<T: Identifiable>(_ list: [T], _ item: T) -> [T] where T.ID == String {
    var next = list
    if let index = next.firstIndex(where: { $0.id == item.id }) { next[index] = item } else { next.append(item) }
    return next
}

private func merge<T: Identifiable>(_ local: [T], _ remote: [T]) -> [T] where T.ID == String {
    var map = Dictionary(uniqueKeysWithValues: local.map { ($0.id, $0) })
    for item in remote { map[item.id] = item }
    return Array(map.values)
}
