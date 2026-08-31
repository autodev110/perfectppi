import Foundation

/// Mirrors the web's primary upload path: ask the server for a presigned PUT
/// URL, then upload bytes directly to R2. Falls back to the server-direct
/// route (`/api/upload/direct`) if the presigned PUT fails (e.g. R2 CORS
/// misconfig).
enum R2Uploader {
    /// Called with 0...1 as bytes go out, so a composer can show a real bar
    /// instead of looking frozen behind a 50MB video. Delivered on
    /// `URLSession`'s delegate queue — hop to the main actor before touching UI
    /// state (`UploadProgressModel` already does).
    typealias ProgressHandler = @Sendable (Double) -> Void

    static func upload(
        data: Data,
        filename: String,
        contentType: String,
        entity: String,
        recordId: String,
        onProgress: ProgressHandler? = nil
    ) async throws -> String {
        // 1) Try presigned URL.
        do {
            let presigned = try await UploadAPI.presignedUrl(
                PresignedUploadRequest(
                    filename: filename,
                    contentType: contentType,
                    size: data.count,
                    entity: entity,
                    recordId: recordId
                )
            )

            try await putToR2(
                urlString: presigned.uploadUrl,
                data: data,
                contentType: contentType,
                onProgress: onProgress
            )
            onProgress?(1)
            return presigned.publicUrl
        } catch {
            // Fall through to direct upload.
        }

        // The retry starts from zero bytes — don't leave a stale bar behind.
        onProgress?(0)

        // 2) Fallback: server proxies the upload.
        let url = try await directUpload(
            data: data,
            filename: filename,
            contentType: contentType,
            entity: entity,
            recordId: recordId,
            onProgress: onProgress
        )
        onProgress?(1)
        return url
    }

    private static func putToR2(
        urlString: String,
        data: Data,
        contentType: String,
        onProgress: ProgressHandler?
    ) async throws {
        guard let url = URL(string: urlString) else {
            throw APIError.unknown(NSError(domain: "R2Uploader", code: 0))
        }

        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        req.setValue(contentType, forHTTPHeaderField: "Content-Type")

        let (_, response) = try await URLSession.shared.upload(
            for: req,
            from: data,
            delegate: onProgress.map(UploadProgressDelegate.init)
        )
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw APIError.server(
                status: (response as? HTTPURLResponse)?.statusCode ?? 0,
                message: "R2 PUT failed"
            )
        }
    }

    @MainActor
    private static func directUpload(
        data: Data,
        filename: String,
        contentType: String,
        entity: String,
        recordId: String,
        onProgress: ProgressHandler?
    ) async throws -> String {
        let url = AppConfig.apiBaseURL.appendingPathComponent("api/upload/direct")
        let boundary = "Boundary-\(UUID().uuidString)"

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)",
                     forHTTPHeaderField: "Content-Type")
        if let token = await APIClient.shared.tokenProvider() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body = Data()
        func appendField(_ name: String, value: String) {
            body.append("--\(boundary)\r\n".utf8)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".utf8)
            body.append("\(value)\r\n".utf8)
        }

        appendField("entity", value: entity)
        appendField("recordId", value: recordId)

        body.append("--\(boundary)\r\n".utf8)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".utf8)
        body.append("Content-Type: \(contentType)\r\n\r\n".utf8)
        body.append(data)
        body.append("\r\n".utf8)
        body.append("--\(boundary)--\r\n".utf8)

        let (respData, response) = try await URLSession.shared.upload(
            for: req,
            from: body,
            delegate: onProgress.map(UploadProgressDelegate.init)
        )
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            let parsed = try? JSONDecoder().decode(ServerErrorBody.self, from: respData)
            throw APIError.server(
                status: (response as? HTTPURLResponse)?.statusCode ?? 0,
                message: parsed?.error
            )
        }

        let decoded = try JSONDecoder().decode(UploadAPI.DirectResponse.self, from: respData)
        return decoded.publicUrl
    }
}

/// `URLSession`'s async upload only reports progress through a task delegate.
private final class UploadProgressDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let onProgress: R2Uploader.ProgressHandler

    init(onProgress: @escaping R2Uploader.ProgressHandler) {
        self.onProgress = onProgress
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        guard totalBytesExpectedToSend > 0 else { return }
        onProgress(Double(totalBytesSent) / Double(totalBytesExpectedToSend))
    }
}

private extension Data {
    mutating func append(_ bytes: String.UTF8View) {
        self.append(contentsOf: bytes)
    }
}
