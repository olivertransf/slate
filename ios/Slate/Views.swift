import AuthenticationServices
import PhotosUI
import SwiftUI
import UIKit

struct RootView: View {
    @Environment(PlannerStore.self) private var store
    @Environment(\.horizontalSizeClass) private var size
    @Environment(\.colorScheme) private var scheme
    @AppStorage("slate.lastView") private var view = "today"
    @AppStorage("slate.lastSection") private var section = "tasks"
    @State private var taskSelection: TaskRecord?
    @State private var calendarSelection: TaskRecord?
    @State private var editor: TaskRecord?
    @AppStorage("slate.lastTab") private var tab = "tasks"
    @State private var menuOpen = false

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
        .overlay(alignment: .top) {
            if let message = store.error {
                Text(message).font(.footnote.weight(.semibold)).padding(8).background(.ultraThinMaterial, in: Capsule()).padding(.top, 8)
            } else if store.syncing {
                Text("Syncing").font(.footnote.weight(.semibold)).padding(8).background(.ultraThinMaterial, in: Capsule()).padding(.top, 8)
            }
        }
    }

    private var phone: some View {
        TabView(selection: $tab) {
            Tab("Tasks", systemImage: "checkmark.square", value: "tasks") {
                    NavigationStack {
                        TaskList(view: view, selected: $taskSelection)
                            .navigationDestination(item: $taskSelection) { task in
                                TaskEditor(task: task)
                            }
                            .toolbar {
                                ToolbarItem(placement: .topBarLeading) {
                                    Button { openMenu() } label: {
                                        Image(systemName: "line.3.horizontal")
                                    }
                                    .accessibilityLabel("Lists")
                                }
                                ToolbarItem(placement: .topBarTrailing) {
                                    NavigationLink { SettingsScreen() } label: {
                                        Image(systemName: "ellipsis")
                                    }
                                    .accessibilityLabel("More")
                                }
                            }
                    }
            }
            Tab("Calendar", systemImage: "calendar", value: "calendar") {
                NavigationStack {
                    CalendarScreen(onSelect: { calendarSelection = $0 }, onMenu: { openMenu() })
                        .navigationDestination(item: $calendarSelection) { task in
                            TaskEditor(task: task)
                        }
                }
            }
            Tab("Habits", systemImage: "clock", value: "habits") {
                NavigationStack { HabitScreen() }
            }
            Tab("Countdown", systemImage: "star", value: "countdowns") {
                NavigationStack { CountdownScreen() }
            }
        }
        .overlay { menuDrawer }
        .onChange(of: tab) { _, _ in
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                taskSelection = nil
                calendarSelection = nil
            }
        }
    }

    private func openMenu() {
        withAnimation(.snappy(duration: 0.28)) { menuOpen = true }
    }

    private func closeMenu() {
        withAnimation(.snappy(duration: 0.24)) { menuOpen = false }
    }

    @ViewBuilder
    private var menuDrawer: some View {
        if menuOpen {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Color.black.opacity(0.45)
                        .ignoresSafeArea()
                        .onTapGesture(perform: closeMenu)
                        .accessibilityLabel("Close menu")
                        .accessibilityAddTraits(.isButton)
                    TaskSidebar(view: $view, drawer: true, onPick: {
                        tab = "tasks"
                        closeMenu()
                    })
                    .frame(width: min(geo.size.width * 0.86, 360))
                    .transition(.move(edge: .leading))
                    .gesture(
                        DragGesture().onEnded { value in
                            if value.translation.width < -60 { closeMenu() }
                        }
                    )
                }
            }
            .transition(.opacity)
            .zIndex(1)
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
                        TaskList(view: view, selected: $editor)
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
    var rail: Color { dark ? rgb(0x111113) : rgb(0xEDEDED) }
    var sidebar: Color { dark ? .black : rgb(0xF5F5F5) }
    var stage: Color { dark ? .black : .white }
    var ink: Color { dark ? .white : rgb(0x191919) }
    var muted: Color { dark ? rgb(0x8E8E93) : rgb(0x8A8A8A) }
    var line: Color { dark ? rgb(0x2C2C2E) : rgb(0xEDEDED) }
    var blue: Color { rgb(0x4C8DFF) }
    var active: Color { dark ? rgb(0x12315F) : rgb(0xE8E8E8) }
    var chip: Color { dark ? rgb(0x1C1C1E) : rgb(0xF3F3F3) }

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

struct QuickAddComposer: View {
    @Environment(PlannerStore.self) private var store
    @Environment(\.colorScheme) private var scheme
    var listId: String?
    var defaultDay: String?
    var onAdded: (TaskRecord) -> Void = { _ in }
    var onClose: () -> Void
    @State private var draft = ""
    @State private var notes = ""
    @State private var pickedDay: String??
    @State private var priority: Int?
    @State private var pickedList: String??
    @State private var tagIds: [String] = []
    @FocusState private var focus: Field?

    private enum Field { case title, notes }

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }
    private var parsed: QuickAdd { parseQuickAdd(draft) }
    private var day: String? {
        if let pickedDay { return pickedDay }
        return parsed.dueOn ?? defaultDay
    }
    private var list: String? {
        if let pickedList { return pickedList }
        return listId
    }
    private var ready: Bool { !parsed.title.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.45)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)
                .accessibilityLabel("Close")
                .accessibilityAddTraits(.isButton)
            VStack(alignment: .leading, spacing: 10) {
                ZStack(alignment: .topLeading) {
                    Text(highlighted)
                        .font(.title3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityHidden(true)
                    TextField("What would you like to do?", text: $draft, axis: .vertical)
                        .font(.title3)
                        .foregroundStyle(draft.isEmpty ? palette.muted : .clear)
                        .tint(palette.blue)
                        .focused($focus, equals: .title)
                        .submitLabel(.send)
                        .onChange(of: draft) { _, next in
                            if next.contains("\n") {
                                draft = next.replacingOccurrences(of: "\n", with: "")
                                submit()
                            }
                        }
                }
                TextField("Description", text: $notes, axis: .vertical)
                    .font(.subheadline)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1...4)
                    .focused($focus, equals: .notes)
                toolbar
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 10)
            .background(palette.chip, in: UnevenRoundedRectangle(topLeadingRadius: 22, topTrailingRadius: 22))
            .transition(.move(edge: .bottom))
        }
        .onAppear { focus = .title }
    }

    private var highlighted: AttributedString {
        var text = AttributedString(draft)
        text.foregroundColor = palette.ink
        for token in parsed.tokens {
            let chars = text.characters
            guard token.end <= chars.count else { continue }
            let start = chars.index(chars.startIndex, offsetBy: token.start)
            let end = chars.index(chars.startIndex, offsetBy: token.end)
            text[start..<end].foregroundColor = palette.blue
            text[start..<end].backgroundColor = palette.blue.opacity(0.22)
        }
        return text
    }

    private var toolbar: some View {
        HStack(spacing: 18) {
            Menu {
                Button("Today") { pickedDay = .some(Day.iso()) }
                Button("Tomorrow") { pickedDay = .some(Day.add(Day.iso(), days: 1)) }
                Button("Next week") { pickedDay = .some(Day.add(Day.iso(), days: 7)) }
                Button("No date") { pickedDay = .some(nil) }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "calendar")
                    if let day { Text(Day.label(day)).font(.subheadline.weight(.semibold)) }
                    if let time = parsed.dueTime { Text(Day.clock(time)).font(.subheadline.weight(.semibold)) }
                }
                .foregroundStyle(day == nil ? palette.muted : palette.blue)
            }
            Menu {
                Button("Inbox") { pickedList = .some(nil) }
                ForEach(store.lists.filter { $0.deletedAt == nil && $0.archivedAt == nil }.sorted { $0.sort < $1.sort }) { item in
                    Button(item.name) { pickedList = .some(item.id) }
                }
            } label: {
                Image(systemName: "tray.and.arrow.down")
                    .foregroundStyle(list == nil ? palette.muted : palette.blue)
            }
            Menu {
                Button("High") { priority = 3 }
                Button("Medium") { priority = 2 }
                Button("Low") { priority = 1 }
                Button("None") { priority = 0 }
            } label: {
                Image(systemName: "flag")
                    .foregroundStyle((priority ?? parsed.priority) > 0 ? palette.blue : palette.muted)
            }
            Menu {
                ForEach(store.tags.filter { $0.deletedAt == nil }) { tag in
                    Button {
                        if tagIds.contains(tag.id) { tagIds.removeAll { $0 == tag.id } } else { tagIds.append(tag.id) }
                    } label: {
                        Label(tag.name, systemImage: tagIds.contains(tag.id) ? "checkmark" : "number")
                    }
                }
            } label: {
                Image(systemName: "tag")
                    .foregroundStyle(tagIds.isEmpty && parsed.tagNames.isEmpty ? palette.muted : palette.blue)
            }
            Spacer()
            Button(action: submit) {
                Image(systemName: "arrow.up")
                    .font(.body.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(ready ? palette.blue : palette.muted.opacity(0.4), in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(!ready)
            .accessibilityLabel("Add task")
        }
        .font(.body)
        .foregroundStyle(palette.muted)
        .padding(.top, 4)
    }

    private func submit() {
        let result = parsed
        guard !result.title.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let named = result.tagNames.map { name in
            if let existing = store.tags.first(where: { $0.deletedAt == nil && $0.name.lowercased() == name.lowercased() }) {
                return existing.id
            }
            let tag = TagRecord(id: UUID().uuidString, name: name, color: "#8E4EC6", updatedAt: "", deletedAt: nil)
            store.saveTag(tag)
            return tag.id
        }
        let task = TaskRecord(
            id: UUID().uuidString, title: result.title, notes: notes, listId: list, sectionId: nil, priority: priority ?? result.priority,
            tagIds: Array(Set(named + tagIds)), dueOn: day, dueTime: result.dueTime, repeatRule: result.repeatRule, remindMinutesBefore: nil,
            completedAt: nil, subtasks: [], sort: Date().timeIntervalSince1970, updatedAt: "", deletedAt: nil
        )
        store.saveTask(task)
        draft = ""
        notes = ""
        pickedDay = nil
        priority = nil
        tagIds = []
        onAdded(task)
    }
}

struct WeekPager: View {
    @Environment(\.colorScheme) private var scheme
    @Binding var day: String
    var weekNumbers = false
    var marked: (String) -> Bool = { _ in false }
    @State private var page: String?

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }

    private static func sunday(_ value: String) -> String {
        let weekday = Calendar.current.component(.weekday, from: Day.parse(value)) - 1
        return Day.add(value, days: -weekday)
    }

    var body: some View {
        let anchor = Self.sunday(Day.iso())
        let weeks = (-52...52).map { Day.add(anchor, days: $0 * 7) }
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 0) {
                ForEach(weeks, id: \.self) { start in
                    HStack(spacing: 0) {
                        ForEach(0..<7, id: \.self) { offset in
                            cell(Day.add(start, days: offset), first: offset == 0)
                        }
                    }
                    .containerRelativeFrame(.horizontal)
                    .id(start)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $page)
        .frame(height: 68)
        .onAppear { page = Self.sunday(day) }
        .onChange(of: day) { _, next in
            let start = Self.sunday(next)
            if page != start { withAnimation { page = start } }
        }
        .onChange(of: page) { _, next in
            guard let next, Self.sunday(day) != next else { return }
            let weekday = Calendar.current.component(.weekday, from: Day.parse(day)) - 1
            day = Day.add(next, days: weekday)
        }
    }

    private static func weekNumber(_ value: String) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 1
        calendar.minimumDaysInFirstWeek = 1
        return calendar.component(.weekOfYear, from: Day.parse(value))
    }

    private func cell(_ item: String, first: Bool) -> some View {
        Button { day = item } label: {
            VStack(spacing: 4) {
                Text(Day.parse(item).formatted(.dateTime.weekday(.narrow)))
                    .font(.caption2)
                    .foregroundStyle(palette.muted)
                Text(String(Int(item.suffix(2)) ?? 0))
                    .font(.system(size: 16, weight: item == day ? .bold : .semibold))
                    .foregroundStyle(item == day ? Color.white : palette.ink)
                    .frame(width: 34, height: 34)
                    .background(item == day ? palette.blue : .clear, in: Circle())
                if weekNumbers && first && !marked(item) {
                    Text("W\(Self.weekNumber(item))")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(palette.muted)
                        .frame(height: 8)
                } else {
                    Circle().fill(marked(item) ? palette.muted : .clear).frame(width: 4, height: 4).frame(height: 8)
                }
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct MonthPager: View {
    @Environment(\.colorScheme) private var scheme
    @Binding var day: String
    var marked: (String) -> Bool = { _ in false }
    var onPick: () -> Void = {}
    @State private var page: String?

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }

    private static func monthStart(_ value: String) -> String {
        String(value.prefix(7)) + "-01"
    }

    private static func addMonths(_ value: String, _ count: Int) -> String {
        Day.iso(Calendar.current.date(byAdding: .month, value: count, to: Day.parse(value)) ?? .now)
    }

    var body: some View {
        let current = Self.monthStart(Day.iso())
        let months = (-24...24).map { Self.addMonths(current, $0) }
        VStack(spacing: 6) {
            HStack(spacing: 0) {
                ForEach(["S", "M", "T", "W", "T", "F", "S"].indices, id: \.self) { index in
                    Text(["S", "M", "T", "W", "T", "F", "S"][index])
                        .font(.caption2)
                        .foregroundStyle(palette.muted)
                        .frame(maxWidth: .infinity)
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    ForEach(months, id: \.self) { month in
                        grid(month)
                            .containerRelativeFrame(.horizontal)
                            .id(month)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $page)
            .frame(height: 6 * 44)
        }
        .onAppear { page = Self.monthStart(day) }
        .onChange(of: day) { _, next in
            let start = Self.monthStart(next)
            if page != start { withAnimation { page = start } }
        }
        .onChange(of: page) { _, next in
            guard let next, Self.monthStart(day) != next else { return }
            day = next == Self.monthStart(Day.iso()) ? Day.iso() : next
        }
    }

    private func grid(_ month: String) -> some View {
        let weekday = Calendar.current.component(.weekday, from: Day.parse(month)) - 1
        let origin = Day.add(month, days: -weekday)
        return VStack(spacing: 0) {
            ForEach(0..<6, id: \.self) { row in
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { column in
                        cell(Day.add(origin, days: row * 7 + column), inMonth: month)
                    }
                }
                .frame(height: 44)
            }
        }
    }

    private func cell(_ item: String, inMonth month: String) -> some View {
        let outside = !item.hasPrefix(String(month.prefix(7)))
        let selected = item == day
        let today = item == Day.iso()
        return Button {
            day = item
            onPick()
        } label: {
            VStack(spacing: 3) {
                Text(String(Int(item.suffix(2)) ?? 0))
                    .font(.system(size: 16, weight: selected || today ? .bold : .semibold))
                    .foregroundStyle(selected ? Color.white : (today ? palette.blue : (outside ? palette.muted : palette.ink)))
                    .frame(width: 34, height: 34)
                    .background(selected ? palette.blue : .clear, in: Circle())
                Circle().fill(marked(item) ? palette.muted : .clear).frame(width: 4, height: 4)
            }
            .frame(maxWidth: .infinity)
            .opacity(outside && !selected ? 0.5 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Day.label(item))
    }
}

struct TaskSidebar: View {
    @Environment(PlannerStore.self) private var store
    @Environment(\.colorScheme) private var scheme
    @Binding var view: String
    var showsStages = false
    var drawer = false
    var onPick: () -> Void = {}
    @State private var listName = ""
    @State private var adding = false
    @State private var archivedOpen = false

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }

    var body: some View {
        let lists = store.lists.filter { $0.deletedAt == nil && $0.archivedAt == nil }.sorted { $0.sort < $1.sort }
        let archived = store.lists.filter { $0.deletedAt == nil && $0.archivedAt != nil }.sorted { $0.sort < $1.sort }
        let tags = store.tags.filter { $0.deletedAt == nil }
        let index = store.taskIndex
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    pick("today", "Today", "calendar", index.today.count)
                    pick("tomorrow", "Tomorrow", "sunrise", index.tomorrow.count)
                    pick("week", "Next 7 Days", "calendar", index.week.count)
                    pick("inbox", "Inbox", "tray", index.inbox.count)
                    pick("overdue", "Overdue", "exclamationmark.circle", index.overdue.count)
                    ForEach(lists) { list in
                        Button { choose("list:\(list.id)") } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "list.bullet").foregroundStyle(Color(hex: list.color))
                                Text(list.name)
                                Spacer(minLength: 8)
                                countLabel(index.byList[list.id]?.count ?? 0)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(view == "list:\(list.id)" ? palette.active : .clear, in: RoundedRectangle(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 10)
                        .contextMenu {
                            Button(list.archivedAt == nil ? "Archive" : "Unarchive") { archive(list) }
                            Button("Delete", role: .destructive) { delete(list) }
                        }
                    }
                    Button { archivedOpen.toggle() } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "folder").foregroundStyle(palette.blue)
                            Text("Archived Lists")
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(palette.muted)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 10)
                    if archivedOpen {
                        ForEach(archived) { list in
                            pick("list:\(list.id)", list.name, "archivebox", index.byList[list.id]?.count ?? 0)
                        }
                    }
                    pick("completed", "Completed", "checkmark.circle.fill", index.completed.count)
                    pick("trash", "Trash", "trash", index.trash.count)
                    ForEach(tags) { tag in
                        pick("tag:\(tag.id)", tag.name, "number", index.byTag[tag.id]?.count ?? 0)
                    }
                    if showsStages {
                        pick("calendar", "Calendar", "calendar")
                        pick("habits", "Habits", "clock")
                        pick("countdowns", "Countdowns", "star")
                        pick("settings", "Settings", "gearshape")
                    }
                }
                .padding(.vertical, 12)
            }
            if adding {
                TextField("List name", text: $listName)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal, 16)
                    .onSubmit { addList(); adding = false }
            }
            HStack {
                Button { adding = true } label: {
                    Label("Add", systemImage: "plus")
                }
                .buttonStyle(.plain)
                Spacer()
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 14)
        }
        .background((drawer ? palette.chip : palette.stage).ignoresSafeArea())
        .foregroundStyle(palette.ink)
    }

    private func pick(_ id: String, _ title: String, _ symbol: String, _ total: Int = 0) -> some View {
        Button { choose(id) } label: {
            HStack(spacing: 12) {
                Image(systemName: symbol).foregroundStyle(palette.blue).frame(width: 24)
                Text(title)
                Spacer(minLength: 8)
                countLabel(total)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(view == id ? palette.active : .clear, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 10)
    }

    private func countLabel(_ total: Int) -> some View {
        Text(total == 0 ? "" : "\(total)")
            .font(.subheadline)
            .foregroundStyle(.secondary)
    }

    private func choose(_ id: String) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            view = id
            onPick()
        }
    }

    private func archive(_ list: ListRecord) {
        var copy = list
        copy.archivedAt = list.archivedAt == nil ? ISO8601DateFormatter().string(from: .now) : nil
        store.saveList(copy)
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
    @State private var message = ""
    @State private var signingIn = false
    @State private var serverDraft = ""

    private var status: GoogleStatus? { store.googleAccount }

    var body: some View {
        Form {
            Section("Appearance") {
                Picker("Appearance", selection: $theme) {
                    Text("Auto").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
            }
            Section("Server") {
                TextField("Server", text: $serverDraft)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit {
                        store.useServer(serverDraft)
                        serverDraft = store.baseURL
                    }
            }
            Section {
                if status?.connected == true {
                    LabeledContent("Account", value: accountName)
                    Button("Sign out", role: .destructive) {
                        Task { await store.googleLogout() }
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
        .task {
            serverDraft = store.baseURL
            await store.refreshGoogle()
        }
    }

    private var accountName: String {
        status?.calendars.first { $0.primary }?.name ?? "Connected"
    }

    private var footer: String {
        if let googleMessage = store.googleMessage, !googleMessage.isEmpty { return googleMessage }
        if status?.configured == false { return "The server is missing the Google client." }
        if !message.isEmpty { return message }
        return "This iPad uses \(store.baseURL). A Google sign-in on the website is used here too."
    }

    private func signIn() async {
        signingIn = true
        defer { signingIn = false }
        guard let url = await store.googleStartURL() else {
            message = "Could not start Google sign-in. Unlock Slate and check the server address."
            return
        }
        let ok = await GoogleLogin.shared.start(url: url)
        await store.refreshGoogle()
        if store.googleAccount?.connected == true {
            message = ""
        } else if !ok {
            message = "Google sign-in was canceled. The redirect address for this server has to be allowed in Google Cloud."
        }
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
    @State private var sectionName = ""
    @State private var convertError: String?
    @State private var addOpen = false

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }

    var body: some View {
        let open = visibleTasks
        let list = view.hasPrefix("list:") ? store.lists.first { $0.id == String(view.dropFirst(5)) } : nil
        VStack(spacing: 0) {
        List {
            if open.isEmpty {
                Text(view == "completed" ? "No completed tasks." : "Nothing here yet.").foregroundStyle(.secondary)
            }
            if let list {
                let loose = open.filter { $0.sectionId == nil }
                Section {
                    ForEach(loose) { task in taskRow(task) }
                }
                ForEach(list.sections.sorted { $0.sort < $1.sort }) { section in
                    let rows = open.filter { $0.sectionId == section.id }
                    if !rows.isEmpty {
                        Section(section.name) {
                            ForEach(rows) { task in taskRow(task) }
                        }
                    }
                }
            } else {
                Section {
                    ForEach(open) { task in taskRow(task) }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .id(view)
        .animation(nil, value: view)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.large)
        }
        .background(palette.stage)
        .foregroundStyle(palette.ink)
        .overlay(alignment: .bottomTrailing) {
            if view != "completed" && view != "trash" {
                Button { addOpen = true } label: {
                    Image(systemName: "plus")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(width: 56, height: 56)
                        .background(palette.blue, in: Circle())
                        .shadow(color: palette.blue.opacity(0.35), radius: 12, y: 6)
                }
                .padding(.trailing, 18)
                .padding(.bottom, 18)
                .accessibilityLabel("Add")
            }
        }
        .overlay {
            if addOpen {
                QuickAddComposer(
                    listId: view.hasPrefix("list:") ? String(view.dropFirst(5)) : nil,
                    defaultDay: defaultDay,
                    onClose: { withAnimation(.snappy(duration: 0.22)) { addOpen = false } }
                )
            }
        }
        .toolbar(addOpen ? .hidden : .visible, for: .tabBar)
        .animation(.snappy(duration: 0.22), value: addOpen)
        .alert("Could not make event", isPresented: Binding(get: { convertError != nil }, set: { if !$0 { convertError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(convertError ?? "")
        }
    }

    private var defaultDay: String? {
        switch view {
        case "today": return Day.iso()
        case "tomorrow": return Day.add(Day.iso(), days: 1)
        default: return nil
        }
    }

    private var visibleTasks: [TaskRecord] {
        store.taskIndex.tasks(for: view)
    }

    private var title: String {
        if view == "inbox" { return "Inbox" }
        if view == "today" { return "Today" }
        if view == "tomorrow" { return "Tomorrow" }
        if view == "week" { return "Next 7 Days" }
        if view == "completed" { return "Completed" }
        if view == "overdue" { return "Overdue" }
        if view == "trash" { return "Trash" }
        if view.hasPrefix("tag:") {
            return store.tags.first { $0.id == String(view.dropFirst(4)) }?.name ?? "Tagged"
        }
        if view.hasPrefix("list:") {
            return store.lists.first { $0.id == String(view.dropFirst(5)) }?.name ?? "List"
        }
        return "Tasks"
    }

    private func taskRow(_ task: TaskRecord) -> some View {
        HStack {
            Button { store.complete(task) } label: {
                Image(systemName: task.completedAt == nil ? "square" : "checkmark.square.fill")
                    .font(.title3)
                    .foregroundStyle(task.completedAt == nil ? Color.secondary : palette.blue)
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
        .swipeActions(edge: .leading) {
            Button("Move") { selected = task }.tint(.gray)
            if task.deletedAt == nil && store.googleAccount?.connected == true {
                Button("Event", systemImage: "calendar.badge.plus") {
                    Task { convertError = await store.convertToEvent(task) }
                }
                .tint(.orange)
            }
        }
        .swipeActions {
            Button(task.deletedAt == nil ? "Delete" : "Restore", role: .destructive) {
                var next = task
                next.deletedAt = task.deletedAt == nil ? ISO8601DateFormatter().string(from: .now) : nil
                store.saveTask(next)
            }
            Button(task.completedAt == nil ? "Complete" : "Restore") { store.complete(task) }
                .tint(.blue)
        }
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
    @Environment(\.dismiss) private var dismiss
    var task: TaskRecord
    @State private var converting = false
    @State private var convertError: String?

    private var current: TaskRecord { store.tasks.first { $0.id == task.id } ?? task }

    var body: some View {
        Form {
            if current.deletedAt == nil && store.googleAccount?.connected == true {
                Section {
                    Button {
                        Task {
                            converting = true
                            convertError = await store.convertToEvent(current)
                            converting = false
                            if convertError == nil { dismiss() }
                        }
                    } label: {
                        HStack {
                            Label("Make Google Calendar event", systemImage: "calendar.badge.plus")
                            if converting {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(converting)
                    if let convertError {
                        Text(convertError).font(.footnote).foregroundStyle(.red)
                    }
                } footer: {
                    Text("Creates the event on \(current.dueOn.map { Day.label($0) } ?? "today")\(current.dueTime.map { " at \(Day.clock($0))" } ?? ", all day") and moves this task to Trash.")
                }
            }
            TextField("Title", text: binding(\.title, ""))
            DatePicker("Date", selection: dateBinding, displayedComponents: .date)
            DatePicker("Time", selection: timeBinding, displayedComponents: .hourAndMinute)
            Picker("List", selection: listBinding) {
                Text("Inbox").tag("")
                ForEach(store.lists.filter { $0.deletedAt == nil }) { list in
                    Text(list.name).tag(list.id)
                }
            }
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
            if !store.tags.filter({ $0.deletedAt == nil }).isEmpty {
                Section("Tags") {
                    ForEach(store.tags.filter { $0.deletedAt == nil }) { tag in
                        Button {
                            var next = current
                            next.tagIds = next.tagIds.contains(tag.id) ? next.tagIds.filter { $0 != tag.id } : next.tagIds + [tag.id]
                            store.saveTask(next)
                        } label: {
                            Label(tag.name, systemImage: current.tagIds.contains(tag.id) ? "checkmark.circle.fill" : "circle")
                        }
                    }
                }
            }
            Section("Subtasks") {
                ForEach(current.subtasks) { subtask in
                    Button {
                        var next = current
                        next.subtasks = next.subtasks.map { item in
                            var copy = item
                            if copy.id == subtask.id { copy.done.toggle() }
                            return copy
                        }
                        store.saveTask(next)
                    } label: {
                        Label(subtask.title, systemImage: subtask.done ? "checkmark.circle.fill" : "circle")
                    }
                    .swipeActions {
                        Button("Delete", role: .destructive) {
                            var next = current
                            next.subtasks.removeAll { $0.id == subtask.id }
                            store.saveTask(next)
                        }
                    }
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

    private var dateBinding: Binding<Date> {
        Binding(get: { Day.parse(current.dueOn ?? Day.iso()) }, set: { value in
            var next = current
            next.dueOn = Day.iso(value)
            store.saveTask(next)
        })
    }

    private var timeBinding: Binding<Date> {
        Binding(get: {
            let bits = (current.dueTime ?? "09:00").split(separator: ":").compactMap { Int($0) }
            return Calendar.current.date(bySettingHour: bits.first ?? 9, minute: bits.dropFirst().first ?? 0, second: 0, of: .now) ?? .now
        }, set: { value in
            let parts = Calendar.current.dateComponents([.hour, .minute], from: value)
            var next = current
            next.dueTime = String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
            store.saveTask(next)
        })
    }

    private var listBinding: Binding<String> {
        Binding(get: { current.listId ?? "" }, set: { value in
            var next = current
            next.listId = value.isEmpty ? nil : value
            next.sectionId = nil
            store.saveTask(next)
        })
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
    var onMenu: (() -> Void)? = nil
    @AppStorage("slate.calWeeks") private var weeks = 4
    @AppStorage("slate.calMode") private var mode = "focus"
    @AppStorage("slate.calAnchor") private var anchor = Day.iso()
    @AppStorage("slate.calOpenedOn") private var openedOn = ""
    @State private var monthOpen = false
    @State private var boardRow = 14
    @State private var google: [GoogleEvent] = []
    @State private var pinchBase: CGFloat = 1
    @State private var addOpen = false

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }
    private let hourHeight: CGFloat = 48

    var body: some View {
        let tasksByDay = Dictionary(grouping: store.tasks.filter { taskOpen($0) && $0.dueOn != nil }, by: { $0.dueOn! })
        let eventsByDay = Dictionary(grouping: google, by: \.day)
        VStack(spacing: 0) {
            header
            Group {
                switch mode {
                case "focus":
                    phoneFocus(tasksByDay: tasksByDay, eventsByDay: eventsByDay)
                case "list":
                    agenda(tasksByDay: tasksByDay, eventsByDay: eventsByDay, days: 14)
                case "day", "3day", "week":
                    timeBoard(tasksByDay: tasksByDay, eventsByDay: eventsByDay, count: mode == "day" ? 1 : mode == "3day" ? 3 : 7)
                default:
                    monthBoard(tasksByDay: tasksByDay, eventsByDay: eventsByDay)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(palette.stage)
        .foregroundStyle(palette.ink)
        .overlay(alignment: .bottomTrailing) {
            Button { addOpen = true } label: {
                Image(systemName: "plus")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(palette.blue, in: Circle())
                    .shadow(color: palette.blue.opacity(0.35), radius: 12, y: 6)
            }
            .padding(.trailing, 18)
            .padding(.bottom, 18)
            .accessibilityLabel("Add task")
        }
        .overlay {
            if addOpen {
                QuickAddComposer(
                    listId: nil,
                    defaultDay: anchor,
                    onClose: { withAnimation(.snappy(duration: 0.22)) { addOpen = false } }
                )
            }
        }
        .toolbar(addOpen ? .hidden : .visible, for: .tabBar)
        .animation(.snappy(duration: 0.22), value: addOpen)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: "\(rangeKey)|\(store.googleGeneration)") { await loadGoogle() }
        .onAppear {
            weeks = min(8, max(1, weeks))
            if size != .compact && mode == "focus" { mode = "month" }
            if openedOn != Day.iso() {
                anchor = Day.iso()
                openedOn = Day.iso()
            }
        }
    }

    @ViewBuilder
    private var header: some View {
        if size == .compact && mode == "focus" {
            phoneHeader
        } else {
            standardHeader
        }
    }

    private var phoneHeader: some View {
        HStack {
            Button { onMenu?() } label: {
                Image(systemName: "line.3.horizontal")
                    .font(.body.weight(.semibold))
                    .frame(width: 44, height: 44)
                    .glassEffect(.regular.interactive(), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lists")
            Spacer()
            Button { anchor = Day.iso() } label: {
                VStack(spacing: 1) {
                    Text(Day.parse(anchor).formatted(.dateTime.month(.wide))).font(.headline)
                    Text(anchor == Day.iso() ? "Today" : Day.label(anchor)).font(.subheadline).foregroundStyle(palette.muted)
                }
            }
            .buttonStyle(.plain)
            .accessibilityHint("Jump to today")
            Spacer()
            HStack(spacing: 0) {
                Button { mode = "month" } label: {
                    Image(systemName: "rectangle.split.3x3")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Month")
                Menu {
                    Button("Month") { mode = "month" }
                    Button("Week") { mode = "week" }
                    Button("Day") { mode = "day" }
                    Button("List") { mode = "list" }
                } label: {
                    Image(systemName: "ellipsis")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("More views")
            }
            .font(.body.weight(.semibold))
            .padding(.horizontal, 4)
            .glassEffect(.regular.interactive(), in: Capsule())
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    private var standardHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(monthTitle).font(.title2.bold())
                Spacer()
                if size == .compact {
                    Button { mode = "focus" } label: { Text("Agenda").font(.subheadline.weight(.semibold)) }
                }
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
        case "focus":
            let first = String(anchor.prefix(7)) + "-01"
            let weekday = Calendar.current.component(.weekday, from: Day.parse(first)) - 1
            let start = Day.add(first, days: -weekday)
            return "\(start)|\(Day.add(start, days: 42))"
        default:
            let block = max(0, boardRow / 4 * 4 - 4)
            let start = Day.add(boardOrigin, days: block * 7)
            return "\(start)|\(Day.add(start, days: 16 * 7))"
        }
    }

    private var boardOrigin: String {
        let weekday = Calendar.current.component(.weekday, from: Day.parse(Day.iso())) - 1
        return Day.add(Day.iso(), days: -weekday - 7 * 16)
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
        let parts = rangeKey.split(separator: "|").map(String.init)
        guard parts.count == 2 else { return }
        google = store.cachedGoogleEvents(start: parts[0], end: parts[1])
        let fetched = await store.googleEvents(start: parts[0], end: parts[1])
        if !Task.isCancelled { google = fetched }
    }

    private var weekZoom: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                let ratio = value / pinchBase
                if ratio > 1.16 {
                    weeks = max(1, weeks - 1)
                    pinchBase = value
                } else if ratio < 0.86 {
                    weeks = min(8, weeks + 1)
                    pinchBase = value
                }
            }
            .onEnded { _ in pinchBase = 1 }
    }

    private func phoneFocus(tasksByDay: [String: [TaskRecord]], eventsByDay: [String: [GoogleEvent]]) -> some View {
        let tasks = store.tasks
            .filter { $0.deletedAt == nil && $0.dueOn == anchor }
            .sorted { ($0.completedAt != nil ? 1 : 0, $0.dueTime ?? "99", $0.sort) < ($1.completedAt != nil ? 1 : 0, $1.dueTime ?? "99", $1.sort) }
        let events = eventsByDay[anchor] ?? []
        let habits = store.habits.filter { $0.deletedAt == nil && $0.archivedAt == nil }.sorted { $0.sort < $1.sort }
        let marked: (String) -> Bool = { day in
            !(tasksByDay[day] ?? []).isEmpty || !(eventsByDay[day] ?? []).isEmpty
        }
        return VStack(spacing: 0) {
            VStack(spacing: 4) {
                if monthOpen {
                    MonthPager(day: $anchor, marked: marked, onPick: { setMonthOpen(false) })
                        .transition(.opacity.combined(with: .move(edge: .top)))
                } else {
                    WeekPager(day: $anchor, weekNumbers: true, marked: marked)
                        .transition(.opacity)
                }
                Button { setMonthOpen(!monthOpen) } label: {
                    Capsule()
                        .fill(palette.muted.opacity(0.5))
                        .frame(width: 36, height: 5)
                        .frame(maxWidth: .infinity, minHeight: 16)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(monthOpen ? "Show week" : "Show month")
            }
            .padding(.horizontal, 16)
            .simultaneousGesture(
                DragGesture(minimumDistance: 16).onEnded { value in
                    guard abs(value.translation.height) > abs(value.translation.width) else { return }
                    if value.translation.height > 30 { setMonthOpen(true) }
                    if value.translation.height < -30 { setMonthOpen(false) }
                }
            )
            ScrollView {
            VStack(spacing: 14) {
                focusCard(anchor == Day.iso() ? "Today" : Day.label(anchor)) {
                    if tasks.isEmpty && events.isEmpty {
                        Text("Nothing scheduled")
                            .foregroundStyle(palette.muted)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                    }
                    ForEach(events) { event in
                        focusRow(color: Color(hex: event.color), trailing: event.time.map(Day.clock) ?? dayWord, repeats: false) {
                            Text("G")
                                .font(.system(size: 13, weight: .heavy, design: .rounded))
                                .foregroundStyle(palette.ink)
                                .frame(width: 22, height: 22)
                                .background(palette.muted.opacity(0.35), in: RoundedRectangle(cornerRadius: 5))
                        } title: {
                            Text(event.title)
                        }
                    }
                    ForEach(tasks) { task in
                        let done = task.completedAt != nil
                        let color = store.lists.first { $0.id == task.listId }.map { Color(hex: $0.color) } ?? palette.blue
                        focusRow(color: color, trailing: task.dueTime.map(Day.clock) ?? dayWord, repeats: task.repeatRule != nil, dimmed: done) {
                            Button { store.complete(task) } label: {
                                Image(systemName: done ? "checkmark.square.fill" : "square")
                                    .font(.title3)
                                    .foregroundStyle(done ? palette.blue : palette.muted)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(done ? "Mark open" : "Complete")
                        } title: {
                            Button { onSelect(task) } label: {
                                Text(task.title)
                                    .strikethrough(done)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if !habits.isEmpty {
                    focusCard("Habit") {
                        ForEach(habits) { habit in
                            let count = store.habitChecks.first { $0.habitId == habit.id && $0.day == anchor }?.count ?? 0
                            let done = count >= habit.goal
                            Button {
                                store.saveCheck(HabitCheckRecord(id: "\(habit.id):\(anchor)", habitId: habit.id, day: anchor, count: done ? 0 : count + 1, updatedAt: ""))
                            } label: {
                                focusRow(color: .clear, trailing: dayWord, repeats: false, dimmed: done) {
                                    Image(systemName: done ? "checkmark.circle.fill" : "circle")
                                        .font(.title3)
                                        .foregroundStyle(Color(hex: habit.color))
                                } title: {
                                    Text(habit.name)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(16)
            .padding(.bottom, 88)
            }
            .onScrollGeometryChange(for: CGFloat.self) { geo in
                geo.contentOffset.y + geo.contentInsets.top
            } action: { _, offset in
                if offset < -60 && !monthOpen { setMonthOpen(true) }
                if offset > 40 && monthOpen { setMonthOpen(false) }
            }
        }
    }

    private func setMonthOpen(_ open: Bool) {
        guard open != monthOpen else { return }
        withAnimation(.snappy(duration: 0.28)) { monthOpen = open }
    }

    private var dayWord: String { anchor == Day.iso() ? "Today" : Day.label(anchor) }

    private func focusCard<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.title3.weight(.bold))
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 4)
            content()
        }
        .padding(.bottom, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.chip)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private func focusRow<Leading: View, Title: View>(
        color: Color,
        trailing: String,
        repeats: Bool,
        dimmed: Bool = false,
        @ViewBuilder leading: () -> Leading,
        @ViewBuilder title: () -> Title
    ) -> some View {
        HStack(spacing: 12) {
            leading()
            title()
                .font(.body.weight(.semibold))
                .lineLimit(1)
                .foregroundStyle(dimmed ? palette.muted : palette.ink)
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(trailing).font(.subheadline).foregroundStyle(palette.blue)
                if repeats {
                    Image(systemName: "repeat").font(.caption2).foregroundStyle(palette.muted)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .leading) {
            Rectangle().fill(color).frame(width: 4)
        }
    }

    private func monthBoard(tasksByDay: [String: [TaskRecord]], eventsByDay: [String: [GoogleEvent]]) -> some View {
        let labels = ["S", "M", "T", "W", "T", "F", "S"]
        let weekday = Calendar.current.component(.weekday, from: Day.parse(Day.iso())) - 1
        let origin = boardOrigin
        let rows = (0..<48).map { Day.add(origin, days: $0 * 7) }
        return VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(labels.indices, id: \.self) { index in
                    Text(labels[index]).font(.caption2).foregroundStyle(palette.muted).frame(maxWidth: .infinity)
                }
            }
            .frame(height: 22)
            let row = max(56, min(280, 720 / CGFloat(max(1, weeks))))
            let limit = max(1, Int((row - 28) / 18))
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(rows, id: \.self) { start in
                            HStack(spacing: 0) {
                                ForEach(0..<7, id: \.self) { offset in
                                    let day = Day.add(start, days: offset)
                                    dayCell(day, tasks: tasksByDay[day] ?? [], events: eventsByDay[day] ?? [], limit: limit)
                                        .dropDestination(for: String.self) { ids, _ in
                                            _ = reschedule(ids.first, day: day, minutes: nil)
                                        }
                                }
                            }
                            .frame(height: row)
                            .id(start)
                        }
                    }
                }
                .simultaneousGesture(weekZoom)
                .onScrollGeometryChange(for: Int.self) { geo in
                    max(0, Int((geo.contentOffset.y + geo.contentInsets.top) / row))
                } action: { _, top in
                    boardRow = top
                }
                .onAppear {
                    let current = Day.add(Day.iso(), days: -weekday)
                    proxy.scrollTo(current, anchor: .center)
                }
            }
        }
    }

    private func dayCell(_ day: String, tasks: [TaskRecord], events: [GoogleEvent], limit: Int) -> some View {
        let outside = Day.parse(day).formatted(.dateTime.month()) != Day.parse(anchor).formatted(.dateTime.month())
        let shownTasks = Array(tasks.prefix(limit))
        let shownEvents = Array(events.prefix(max(0, limit - shownTasks.count)))
        return VStack(alignment: .leading, spacing: 2) {
            Text(String(Int(day.suffix(2)) ?? 0))
                .font(.system(size: 12, weight: day == Day.iso() ? .semibold : .medium))
                .foregroundStyle(day == Day.iso() ? Color.white : (outside ? palette.muted : palette.ink))
                .frame(width: 22, height: 22)
                .background(day == Day.iso() ? palette.blue : .clear, in: Circle())
            if limit == 0 && (!tasks.isEmpty || !events.isEmpty) {
                Circle().fill(palette.blue).frame(width: 4, height: 4).padding(.leading, 8)
            }
            ForEach(shownTasks) { task in
                chip(task.title, color: palette.blue)
                    .draggable(task.id)
                    .onTapGesture { onSelect(task) }
                    .contextMenu {
                        Button("Complete", systemImage: "checkmark.square") { store.complete(task) }
                        Button("Open", systemImage: "square.and.pencil") { onSelect(task) }
                    }
            }
            ForEach(shownEvents) { event in
                chip(event.title, color: Color(hex: event.color))
            }
        }
        .padding(4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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
                            HStack {
                                Button { store.complete(task) } label: {
                                    Image(systemName: "square").foregroundStyle(palette.muted)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Complete")
                                Button { onSelect(task) } label: {
                                    HStack {
                                        Text(task.title).lineLimit(1)
                                        Spacer()
                                        if let time = task.dueTime {
                                            Text(Day.clock(time)).foregroundStyle(palette.blue)
                                        }
                                    }
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
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
    @State private var day = Day.iso()

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }

    var body: some View {
        let habits = store.habits.filter { $0.deletedAt == nil && $0.archivedAt == nil }.sorted { $0.sort < $1.sort }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Habit").font(.title3.bold()).frame(maxWidth: .infinity)
                weekStrip
                let waiting = habits.filter { progress($0, day: day) < $0.goal }
                let checked = habits.filter { progress($0, day: day) >= $0.goal }
                ForEach(waiting) { habit in
                    habitCard(habit, done: false)
                        .padding(14)
                        .background(palette.chip, in: RoundedRectangle(cornerRadius: 16))
                }
                if !checked.isEmpty {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Checked-in").font(.headline)
                        ForEach(checked) { habit in
                            habitCard(habit, done: true)
                                .padding(0)
                                .background(Color.clear)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(palette.chip, in: RoundedRectangle(cornerRadius: 16))
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

    private func habitCard(_ habit: HabitRecord, done: Bool) -> some View {
        HStack(spacing: 12) {
            Button { toggle(habit, day: day) } label: {
                Image(systemName: done ? "checkmark" : "circle.fill")
                    .font(.title3)
                    .foregroundStyle(Color(hex: habit.color))
            }
            .buttonStyle(.plain)
            Text(habit.name).font(.body.weight(.semibold)).lineLimit(1)
                .contextMenu {
                    Button("Weekly") {
                        var next = habit
                        next.cadence = habit.cadence == "weekly" ? "daily" : "weekly"
                        store.saveHabit(next)
                    }
                    Button("Delete", role: .destructive) {
                        var next = habit
                        next.deletedAt = ISO8601DateFormatter().string(from: .now)
                        store.saveHabit(next)
                    }
                }
            Spacer(minLength: 8)
            Button { selected = selected == habit.id ? nil : habit.id } label: {
                VStack(alignment: .trailing, spacing: 0) {
                    Text("\(streak(habit))").font(.title3.weight(.bold))
                    Text("Current Streak").font(.caption2).foregroundStyle(palette.muted)
                }
            }
            .buttonStyle(.plain)
        }
    }

    private var weekStrip: some View {
        WeekPager(day: $day)
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
    @State private var photo: PhotosPickerItem?

    private var palette: SlatePalette { SlatePalette(scheme: scheme) }

    var body: some View {
        let items = store.countdowns.filter { $0.deletedAt == nil }.sorted { $0.sort < $1.sort }
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Countdown").font(.title3.bold()).frame(maxWidth: .infinity)
                ForEach(items) { item in
                    let amount = Day.countdownAmount(item)
                    Button { selected = item } label: {
                        HStack(spacing: 12) {
                            Text(String(item.title.prefix(1)))
                                .font(.headline)
                                .foregroundStyle(.white)
                                .frame(width: 42, height: 42)
                                .background(Color(hex: item.color), in: Circle())
                            Text(item.title)
                                .font(.body.weight(.semibold))
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            VStack(alignment: .trailing, spacing: 0) {
                                Text("\(amount)")
                                    .font(.system(size: 28, weight: .bold))
                                    .foregroundStyle(palette.blue)
                                Text(phrase(item, amount))
                                    .font(.caption2)
                                    .foregroundStyle(palette.muted)
                            }
                        }
                        .padding(12)
                        .background(palette.chip, in: RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button("Delete", role: .destructive) { remove(item) }
                    }
                }
            }
            .padding(16)
            .padding(.bottom, 72)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
        let name = record.unit == "day" ? "Day" : record.unit.prefix(1).uppercased() + record.unit.dropFirst()
        let unit = abs(amount) == 1 ? name : "\(name)s"
        if amount == 0 { return record.mode == "countup" ? "Started" : "Today" }
        if record.mode == "countup" { return "\(unit) since" }
        return "\(unit) Left"
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
            PhotosPicker(selection: $photo, matching: .images) {
                Label(record.imageKey == nil ? "Add image" : "Replace image", systemImage: "photo")
            }
            .onChange(of: photo) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        await store.attachImage(record, data: data)
                    }
                }
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
}

private func priorityColor(_ priority: Int) -> Color {
    switch priority {
    case 3: return .red
    case 2: return .orange
    default: return .blue
    }
}
