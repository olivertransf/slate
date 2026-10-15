import Foundation

enum RepeatUnit: String, Codable, CaseIterable {
    case day, week, month, year
}

struct RepeatRule: Codable, Equatable, Hashable {
    var every: Int
    var unit: RepeatUnit
}

struct TaskSection: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var name: String
    var sort: Double
}

struct ListRecord: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var color: String
    var sort: Double
    var sections: [TaskSection]
    var updatedAt: String
    var deletedAt: String?
}

struct Subtask: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var title: String
    var done: Bool
}

struct TaskRecord: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var title: String
    var notes: String
    var listId: String?
    var sectionId: String?
    var priority: Int
    var tagIds: [String]
    var dueOn: String?
    var dueTime: String?
    var repeatRule: RepeatRule?
    var remindMinutesBefore: Int?
    var completedAt: String?
    var subtasks: [Subtask]
    var sort: Double
    var updatedAt: String
    var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, title, notes, listId, sectionId, priority, tagIds, dueOn, dueTime
        case repeatRule = "repeat"
        case remindMinutesBefore, completedAt, subtasks, sort, updatedAt, deletedAt
    }
}

struct TagRecord: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var color: String
    var updatedAt: String
    var deletedAt: String?
}

struct HabitRecord: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var color: String
    var cadence: String
    var goal: Int
    var sort: Double
    var updatedAt: String
    var deletedAt: String?
}

struct HabitCheckRecord: Codable, Identifiable, Equatable {
    var id: String
    var habitId: String
    var day: String
    var count: Int
    var updatedAt: String
}

struct CountdownRecord: Codable, Identifiable, Equatable {
    var id: String
    var title: String
    var day: String
    var mode: String
    var repeatYearly: Bool
    var unit: String
    var color: String
    var imageKey: String?
    var sort: Double
    var updatedAt: String
    var deletedAt: String?
}

struct Snapshot: Codable {
    var revision: Int
    var reset: Bool
    var lists: [ListRecord]
    var tasks: [TaskRecord]
    var tags: [TagRecord]
    var habits: [HabitRecord]
    var habitChecks: [HabitCheckRecord]
    var countdowns: [CountdownRecord]
}

struct ManifestBody: Codable {
    var revision: Int
}

struct GoogleCalendarInfo: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var color: String
    var primary: Bool
}

struct GoogleStatus: Codable {
    var configured: Bool
    var connected: Bool
    var calendars: [GoogleCalendarInfo]
}

struct GoogleEvent: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var day: String
    var time: String?
    var allDay: Bool
    var color: String
    var calendarId: String
    var calendar: String
    var link: String
}

enum Day {
    static func iso(_ date: Date = .now) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 1970, parts.month ?? 1, parts.day ?? 1)
    }

    static func parse(_ value: String) -> Date {
        let bits = value.split(separator: "-").compactMap { Int($0) }
        var parts = DateComponents()
        parts.year = bits.first
        parts.month = bits.dropFirst().first
        parts.day = bits.dropFirst(2).first
        return Calendar.current.date(from: parts) ?? .now
    }

    static func add(_ value: String, days: Int) -> String {
        iso(Calendar.current.date(byAdding: .day, value: days, to: parse(value)) ?? .now)
    }

    private static var todayStamp = Date.distantPast
    private static var todayValue = ""
    private static var tomorrowValue = ""
    private static var weekEndValue = ""
    private static var labelCache: [String: String] = [:]

    static func today(now: Date = .now) -> (today: String, tomorrow: String, weekEnd: String) {
        if !todayValue.isEmpty, Calendar.current.isDate(now, inSameDayAs: todayStamp) {
            return (todayValue, tomorrowValue, weekEndValue)
        }
        let today = iso(now)
        todayValue = today
        tomorrowValue = add(today, days: 1)
        weekEndValue = add(today, days: 6)
        todayStamp = now
        labelCache.removeAll(keepingCapacity: true)
        return (today, tomorrowValue, weekEndValue)
    }

    static func label(_ value: String, today: String? = nil) -> String {
        let today = today ?? self.today().today
        if let cached = labelCache[today + value] { return cached }
        let text = uncachedLabel(value, today: today)
        labelCache[today + value] = text
        return text
    }

    private static func uncachedLabel(_ value: String, today: String) -> String {
        if value == today { return "Today" }
        if value == tomorrowValue || value == add(today, days: 1) { return "Tomorrow" }
        if value == add(today, days: -1) { return "Yesterday" }
        let date = parse(value)
        if Calendar.current.isDate(date, equalTo: parse(today), toGranularity: .weekOfYear) {
            return date.formatted(.dateTime.weekday(.abbreviated).day())
        }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }

    static func clock(_ value: String) -> String {
        let bits = value.split(separator: ":").compactMap { Int($0) }
        let hour = bits.first ?? 0
        let minute = bits.dropFirst().first ?? 0
        let suffix = hour >= 12 ? "PM" : "AM"
        let hour12 = hour % 12 == 0 ? 12 : hour % 12
        if minute == 0 { return "\(hour12) \(suffix)" }
        return String(format: "%d:%02d %@", hour12, minute, suffix)
    }
}

func taskOpen(_ task: TaskRecord) -> Bool {
    task.deletedAt == nil && task.completedAt == nil
}

struct TaskIndex {
    var inbox: [TaskRecord] = []
    var today: [TaskRecord] = []
    var tomorrow: [TaskRecord] = []
    var week: [TaskRecord] = []
    var completed: [TaskRecord] = []
    var byList: [String: [TaskRecord]] = [:]
    var byTag: [String: [TaskRecord]] = [:]

    func tasks(for view: String) -> [TaskRecord] {
        switch view {
        case "inbox": return inbox
        case "today": return today
        case "tomorrow": return tomorrow
        case "week": return week
        case "completed": return completed
        default:
            if view.hasPrefix("list:") { return byList[String(view.dropFirst(5)), default: []] }
            if view.hasPrefix("tag:") { return byTag[String(view.dropFirst(4)), default: []] }
            return []
        }
    }

    static func make(_ tasks: [TaskRecord]) -> TaskIndex {
        let bounds = Day.today()
        var index = TaskIndex()
        for task in tasks {
            if task.deletedAt != nil { continue }
            if task.completedAt != nil {
                index.completed.append(task)
                continue
            }
            if task.listId == nil { index.inbox.append(task) }
            if let due = task.dueOn {
                if due <= bounds.today { index.today.append(task) }
                if due == bounds.tomorrow { index.tomorrow.append(task) }
                if due <= bounds.weekEnd { index.week.append(task) }
            }
            if let listId = task.listId { index.byList[listId, default: []].append(task) }
            for tag in task.tagIds { index.byTag[tag, default: []].append(task) }
        }
        let bySort: (TaskRecord, TaskRecord) -> Bool = { $0.sort < $1.sort }
        index.inbox.sort(by: bySort)
        index.today.sort(by: bySort)
        index.tomorrow.sort(by: bySort)
        index.week.sort(by: bySort)
        index.completed.sort { ($0.completedAt ?? "") > ($1.completedAt ?? "") }
        for key in index.byList.keys {
            var items = index.byList[key] ?? []
            items.sort(by: bySort)
            index.byList[key] = items
        }
        for key in index.byTag.keys {
            var items = index.byTag[key] ?? []
            items.sort(by: bySort)
            index.byTag[key] = items
        }
        return index
    }
}

func matches(task: TaskRecord, view: String, today: String = Day.today().today) -> Bool {
    guard taskOpen(task) else { return false }
    let bounds = Day.today()
    let tomorrow = today == bounds.today ? bounds.tomorrow : Day.add(today, days: 1)
    let weekEnd = today == bounds.today ? bounds.weekEnd : Day.add(today, days: 6)
    switch view {
    case "inbox": return task.listId == nil
    case "today": return task.dueOn != nil && task.dueOn! <= today
    case "tomorrow": return task.dueOn == tomorrow
    case "week": return task.dueOn != nil && task.dueOn! <= weekEnd
    default:
        if view.hasPrefix("list:") { return task.listId == String(view.dropFirst(5)) }
        if view.hasPrefix("tag:") { return task.tagIds.contains(String(view.dropFirst(4))) }
        return false
    }
}

struct QuickToken: Hashable {
    var start: Int
    var end: Int
    var kind: String
    var text: String
}

struct QuickAdd {
    var title: String
    var dueOn: String?
    var dueTime: String?
    var priority: Int
    var tagNames: [String]
    var repeatRule: RepeatRule?
    var tokens: [QuickToken]
}

private let quickDatePattern = #"\b(?:next\s+(?:week|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)|in\s+\d+\s+days?|tomorrow|tmrw|tmr|tmw|tom|today|tonight|tod|yesterday|yest|yday|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b"#

func parseQuickAdd(_ input: String, today: String = Day.today().today) -> QuickAdd {
    if input.isEmpty {
        return QuickAdd(title: "", dueOn: nil, dueTime: nil, priority: 0, tagNames: [], repeatRule: nil, tokens: [])
    }
    var dueOn: String?
    var dueTime: String?
    var priority = 0
    var tagNames: [String] = []
    var rule: RepeatRule?
    var tokens: [QuickToken] = []
    let rules: [(String, String)] = [
        (#"#([\p{L}\p{N}_-]+)"#, "tag"),
        (#"\b(p[1-3]|!{1,3})\b"#, "priority"),
        (#"\b(every\s+day|daily|every\s+week|weekly|every\s+month|monthly|every\s+year|yearly)\b"#, "repeat"),
        (#"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b"#, "time"),
        (quickDatePattern, "date"),
    ]
    for (pattern, kind) in rules {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { continue }
        let range = NSRange(input.startIndex..., in: input)
        for match in regex.matches(in: input, range: range) {
            guard let swiftRange = Range(match.range, in: input) else { continue }
            let start = input.distance(from: input.startIndex, to: swiftRange.lowerBound)
            let end = input.distance(from: input.startIndex, to: swiftRange.upperBound)
            if tokens.contains(where: { start < $0.end && end > $0.start }) { continue }
            let text = String(input[swiftRange])
            tokens.append(QuickToken(start: start, end: end, kind: kind, text: text))
            let normalized = text.lowercased()
            switch kind {
            case "tag":
                tagNames.append(String(text.dropFirst()))
            case "priority":
                if normalized == "p1" || normalized == "!" { priority = 1 }
                else if normalized == "p2" || normalized == "!!" { priority = 2 }
                else { priority = 3 }
            case "repeat":
                if normalized.contains("day") || normalized == "daily" { rule = RepeatRule(every: 1, unit: .day) }
                else if normalized.contains("week") { rule = RepeatRule(every: 1, unit: .week) }
                else if normalized.contains("month") { rule = RepeatRule(every: 1, unit: .month) }
                else { rule = RepeatRule(every: 1, unit: .year) }
            case "time":
                let bits = normalized.split { !$0.isNumber && $0 != ":" && $0 != "a" && $0 != "p" && $0 != "m" }
                let clock = normalized
                let hourMatch = clock.split(separator: ":").first.flatMap { Int($0.filter(\.isNumber)) } ?? 0
                var hour = hourMatch % 12
                if clock.contains("pm") { hour += 12 }
                let minute = clock.split(separator: ":").dropFirst().first.flatMap { Int($0.filter(\.isNumber)) } ?? 0
                dueTime = String(format: "%02d:%02d", hour, minute)
                _ = bits
            default:
                dueOn = quickDate(normalized, today: today)
            }
        }
    }
    tokens.sort { $0.start < $1.start }
    var title = ""
    var cursor = input.startIndex
    for token in tokens {
        let start = input.index(input.startIndex, offsetBy: token.start)
        let end = input.index(input.startIndex, offsetBy: token.end)
        title += input[cursor..<start]
        cursor = end
    }
    title += input[cursor...]
    let cleaned = title.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    return QuickAdd(title: cleaned, dueOn: dueOn, dueTime: dueTime, priority: priority, tagNames: tagNames, repeatRule: rule, tokens: tokens)
}

private let weekdayAlias: [String: Int] = [
    "sunday": 0, "sun": 0, "monday": 1, "mon": 1, "tuesday": 2, "tue": 2, "tues": 2,
    "wednesday": 3, "wed": 3, "thursday": 4, "thu": 4, "thur": 4, "thurs": 4,
    "friday": 5, "fri": 5, "saturday": 6, "sat": 6,
]

private func quickDate(_ token: String, today: String) -> String {
    let normalized = token.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    if ["today", "tod", "tonight"].contains(normalized) { return today }
    if ["tomorrow", "tmrw", "tmr", "tmw", "tom"].contains(normalized) { return Day.add(today, days: 1) }
    if ["yesterday", "yest", "yday"].contains(normalized) { return Day.add(today, days: -1) }
    if normalized == "next week" { return Day.add(today, days: 7) }
    if normalized.hasPrefix("in ") {
        let count = Int(normalized.filter(\.isNumber)) ?? 0
        return Day.add(today, days: count)
    }
    if normalized.hasPrefix("next ") {
        return weekdayDate(String(normalized.dropFirst(5)), today: today, forceAhead: true)
    }
    return weekdayDate(normalized, today: today, forceAhead: false)
}

private func weekdayDate(_ name: String, today: String, forceAhead: Bool) -> String {
    let wanted = weekdayAlias[name] ?? 0
    let current = Calendar.current.component(.weekday, from: Day.parse(today)) - 1
    var delta = (wanted - current + 7) % 7
    if delta == 0 { delta = 7 }
    if !forceAhead && delta == 7 && weekdayAlias[name] == current { delta = 7 }
    return Day.add(today, days: delta)
}
