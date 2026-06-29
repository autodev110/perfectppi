import Foundation

enum APIError: LocalizedError {
    case notAuthenticated
    case forbidden
    case notFound
    case server(status: Int, message: String?)
    case transport(URLError)
    case decoding(DecodingError)
    case encoding(EncodingError)
    case unknown(Error)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated: return "You must sign in to continue."
        case .forbidden: return "You don't have permission for that."
        case .notFound: return "We couldn't find that record."
        case .server(_, let m): return m ?? "The server returned an error."
        case .transport(let e): return e.localizedDescription
        case .decoding: return "Couldn't read the server response."
        case .encoding: return "Couldn't build the request."
        case .unknown(let e): return e.localizedDescription
        }
    }
}

struct ServerErrorBody: Decodable {
    let error: String?
}
