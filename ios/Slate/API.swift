import Foundation
import Security

enum APIError: Error {
    case locked
    case conflict(Snapshot)
    case message(String)
}

struct APIClient {
    var baseURL: URL
    var token: String?

    func unlock(passphrase: String) async throws -> String {
        let body = try await send("/api/session", method: "POST", json: ["passphrase": passphrase, "device": DeviceID.current], authorized: false)
        guard let token = body["token"] as? String else { throw APIError.message("Unlock failed.") }
        return token
    }

    func manifest(known: Int) async throws -> Int? {
        var request = make("/api/sync?manifest=1")
        request.setValue("\"\(known)\"", forHTTPHeaderField: "If-None-Match")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.message("No response.") }
        if http.statusCode == 304 { return nil }
        if http.statusCode == 401 { throw APIError.locked }
        try validate(http, data: data)
        return try JSONDecoder().decode(ManifestBody.self, from: data).revision
    }

    func snapshot(after: Int) async throws -> Snapshot {
        let (data, response) = try await URLSession.shared.data(for: make("/api/sync?after=\(after)"))
        try validate(response, data: data)
        return try JSONDecoder().decode(Snapshot.self, from: data)
    }

    func googleStatus() async throws -> GoogleStatus {
        let (data, response) = try await URLSession.shared.data(for: make("/api/google/status"))
        try validate(response, data: data)
        return try JSONDecoder().decode(GoogleStatus.self, from: data)
    }

    func googleEvents(start: String, end: String) async throws -> [GoogleEvent] {
        let (data, response) = try await URLSession.shared.data(for: make("/api/google/events?start=\(start)&end=\(end)&tz=\(TimeZone.current.identifier.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"))
        try validate(response, data: data)
        return try JSONDecoder().decode(GoogleEventsBody.self, from: data).events
    }

    func createEvent(from task: TaskRecord, day: String) async throws -> GoogleEvent {
        var request = make("/api/google/events", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = [
            "title": task.title,
            "notes": task.notes,
            "day": day,
            "minutes": 60,
            "timeZone": TimeZone.current.identifier,
        ]
        if let time = task.dueTime { body["time"] = time }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.message("No response.") }
        if http.statusCode == 401 { throw APIError.locked }
        guard (200..<300).contains(http.statusCode) else {
            let payload = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
            var message = payload["error"] as? String ?? "Could not create the event."
            if payload["reconnect"] as? Bool == true { message += " Open Settings and sign in to Google again." }
            throw APIError.message(message)
        }
        return try JSONDecoder().decode(CreatedEvent.self, from: data).event
    }

    func googleStartURL() async throws -> URL {
        let (data, response) = try await URLSession.shared.data(for: make("/api/google/start?client=app"))
        try validate(response, data: data)
        let body = (try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        guard let value = body["url"] as? String, let url = URL(string: value) else {
            throw APIError.message("Google sign-in did not start.")
        }
        return url
    }

    func googleLogout() async throws {
        let (data, response) = try await URLSession.shared.data(for: make("/api/google/logout", method: "POST"))
        try validate(response, data: data)
    }

    func endSession() async throws {
        let (data, response) = try await URLSession.shared.data(for: make("/api/session", method: "DELETE"))
        try validate(response, data: data)
    }

    func renew() async throws -> String {
        let body = try await send("/api/session", method: "POST", json: ["renew": true], authorized: true)
        guard let token = body["token"] as? String else { throw APIError.message("Could not renew the session.") }
        return token
    }

    func uploadImage(_ data: Data, type: String) async throws -> String {
        let boundary = "slate-\(UUID().uuidString)"
        var request = make("/api/files", method: "POST")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"file\"; filename=\"image\"\r\n".utf8))
        body.append(Data("Content-Type: \(type)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        request.httpBody = body
        let (responseData, response) = try await URLSession.shared.data(for: request)
        try validate(response, data: responseData)
        let payload = (try JSONSerialization.jsonObject(with: responseData) as? [String: Any]) ?? [:]
        guard let key = payload["key"] as? String else { throw APIError.message("Image upload failed.") }
        return key
    }

    func push(baseRevision: Int, records: [String: Any], mutationId: String) async throws -> Snapshot {
        var request = make("/api/sync", method: "PUT")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["baseRevision": baseRevision, "records": records, "mutationId": mutationId])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.message("No response.") }
        if http.statusCode == 409 {
            throw APIError.conflict(try JSONDecoder().decode(Conflict.self, from: data).snapshot)
        }
        try validate(http, data: data)
        return try JSONDecoder().decode(Snapshot.self, from: data)
    }

    private struct Conflict: Codable { var snapshot: Snapshot }
    private struct GoogleEventsBody: Codable { var events: [GoogleEvent] }
    private struct CreatedEvent: Codable { var event: GoogleEvent }

    private func make(_ path: String, method: String = "GET") -> URLRequest {
        let url = URL(string: path, relativeTo: baseURL)!.absoluteURL
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.setValue(DeviceID.current, forHTTPHeaderField: "x-slate-device")
        return request
    }

    private func send(_ path: String, method: String, json: [String: Any], authorized: Bool) async throws -> [String: Any] {
        var request = make(path, method: method)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !authorized { request.setValue(nil, forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONSerialization.data(withJSONObject: json)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response, data: data)
        return (try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    private func validate(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        if http.statusCode == 401 { throw APIError.locked }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["error"]
            throw APIError.message(message ?? "Request failed.")
        }
    }
}

enum DeviceID {
    static var current: String {
        if let stored = UserDefaults.standard.string(forKey: "slate.device") { return stored }
        let next = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        UserDefaults.standard.set(next, forKey: "slate.device")
        return next
    }
}

enum Keychain {
    private static let account = "slate.session"

    static func save(_ value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clear() {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
    }
}
