import Foundation

/// Thin async wrapper around URLSession that attaches the Supabase access
/// token from `AuthStore` on every call. Routes are typed via `APIRoute`
/// builders to keep call sites readable.
@MainActor
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let baseURL: URL
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let camelEncoder: JSONEncoder

    /// Provider for the access token, set by the auth bootstrapping code.
    /// Returns the freshest bearer token, refreshing if needed.
    var tokenProvider: (@MainActor () async -> String?) = { nil }

    /// Called when a 401 comes back — typically used to sign the user out.
    var onUnauthorized: (@MainActor () async -> Void) = {}

    init(baseURL: URL = AppConfig.apiBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session

        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601WithFractional
        dec.keyDecodingStrategy = .convertFromSnakeCase
        self.decoder = dec

        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.keyEncodingStrategy = .convertToSnakeCase
        self.encoder = enc

        let camel = JSONEncoder()
        camel.dateEncodingStrategy = .iso8601
        self.camelEncoder = camel
    }

    // MARK: - Public API

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await send(method: "GET", path: path, query: query, body: Optional<Empty>.none, encoder: encoder)
    }

    func post<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        try await send(method: "POST", path: path, query: [], body: body, encoder: encoder)
    }

    func postCamel<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        try await send(method: "POST", path: path, query: [], body: body, encoder: camelEncoder)
    }

    func patch<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        try await send(method: "PATCH", path: path, query: [], body: body, encoder: encoder)
    }

    func delete<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        try await send(method: "DELETE", path: path, query: [], body: body, encoder: encoder)
    }

    func delete<T: Decodable>(_ path: String) async throws -> T {
        try await send(method: "DELETE", path: path, query: [], body: Optional<Empty>.none, encoder: encoder)
    }

    /// Raw bytes endpoint — used for the media proxy + PDF download.
    func bytes(_ path: String) async throws -> (Data, String?) {
        let req = try await buildRequest(method: "GET", path: path, query: [], body: Optional<Empty>.none, encoder: encoder)
        let (data, response) = try await session.data(for: req)
        try assertStatus(response: response, body: data)
        let mime = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type")
        return (data, mime)
    }

    // MARK: - Internals

    private func send<B: Encodable, T: Decodable>(
        method: String,
        path: String,
        query: [URLQueryItem],
        body: B?,
        encoder: JSONEncoder
    ) async throws -> T {
        let req = try await buildRequest(method: method, path: path, query: query, body: body, encoder: encoder)
        let (data, response) = try await safeData(req)
        try assertStatus(response: response, body: data)

        if T.self == Empty.self || data.isEmpty {
            return Empty() as! T
        }

        do {
            // Server uniformly returns `{ data: <T> }` for success envelopes;
            // fall through to bare T if envelope isn't present.
            if let envelope = try? decoder.decode(Envelope<T>.self, from: data) {
                return envelope.data
            }
            return try decoder.decode(T.self, from: data)
        } catch let e as DecodingError {
            throw APIError.decoding(e)
        }
    }

    private func buildRequest<B: Encodable>(
        method: String,
        path: String,
        query: [URLQueryItem],
        body: B?,
        encoder: JSONEncoder
    ) async throws -> URLRequest {
        var comps = URLComponents()
        comps.scheme = baseURL.scheme
        comps.host = baseURL.host
        comps.port = baseURL.port
        comps.path = (baseURL.path.isEmpty ? "" : baseURL.path) + path
        if !query.isEmpty { comps.queryItems = query }

        guard let url = comps.url else {
            throw APIError.unknown(NSError(domain: "APIClient", code: 0))
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        if let token = await tokenProvider() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            do {
                req.httpBody = try encoder.encode(body)
            } catch let e as EncodingError {
                throw APIError.encoding(e)
            }
        }

        return req
    }

    private func safeData(_ req: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: req)
        } catch let e as URLError {
            throw APIError.transport(e)
        }
    }

    private func assertStatus(response: URLResponse, body: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        switch http.statusCode {
        case 200..<300: return
        case 401:
            Task { await onUnauthorized() }
            throw APIError.notAuthenticated
        case 403:
            throw APIError.forbidden
        case 404:
            throw APIError.notFound
        default:
            let parsed = try? decoder.decode(ServerErrorBody.self, from: body)
            throw APIError.server(status: http.statusCode, message: parsed?.error)
        }
    }
}

/// Wraps the standard `{ data: <T> }` server envelope.
private struct Envelope<T: Decodable>: Decodable { let data: T }

/// Marker type for endpoints with no body / response.
struct Empty: Codable {}

extension JSONDecoder.DateDecodingStrategy {
    /// Server emits ISO8601 with optional fractional seconds. The built-in
    /// `.iso8601` strategy rejects fractional, so we wire up a custom formatter
    /// that handles both.
    static var iso8601WithFractional: JSONDecoder.DateDecodingStrategy {
        .custom { decoder in
            let container = try decoder.singleValueContainer()
            let s = try container.decode(String.self)
            if let d = isoFormatter.date(from: s) { return d }
            if let d = isoFormatterFractional.date(from: s) { return d }
            throw DecodingError.dataCorruptedError(in: container,
                debugDescription: "Invalid ISO8601 date: \(s)")
        }
    }
}

private let isoFormatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

private let isoFormatterFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()
