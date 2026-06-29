import Foundation

/// Mirrors the web's primary upload path: ask the server for a presigned PUT
/// URL, then upload bytes directly to R2. Falls back to the server-direct
/// route (`/api/upload/direct`) if the presigned PUT fails (e.g. R2 CORS
/// misconfig).
enum R2Uploader {
    static func upload(
        data: Data,
        filename: String,
        contentType: String,
        entity: String,
        recordId: String
    ) async throws -> String {
        // 1) Try presigned URL.
        do {
            let presigned = try await UploadAPI.presignedUrl(
                PresignedUploadRequest(
                    filename: filename,
                    contentType: contentType,
                    entity: entity,
                    recordId: recordId
                )
            )

            try await putToR2(
                urlString: presigned.uploadUrl,
                data: data,
                contentType: contentType
            )
            return presigned.publicUrl
        } catch {
            // Fall through to direct upload.
        }

        // 2) Fallback: server proxies the upload.
        return try await directUpload(
            data: data,
            filename: filename,
            contentType: contentType,
            entity: entity,
            recordId: recordId
        )
    }

    private static func putToR2(
        urlString: String,
        data: Data,
        contentType: String
    ) async throws {
        guard let url = URL(string: urlString) else {
            throw APIError.unknown(NSError(domain: "R2Uploader", code: 0))
        }

        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        req.httpBody = data

        let (_, response) = try await URLSession.shared.data(for: req)
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
        recordId: String
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

        req.httpBody = body

        let (respData, response) = try await URLSession.shared.data(for: req)
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

private extension Data {
    mutating func append(_ bytes: String.UTF8View) {
        self.append(contentsOf: bytes)
    }
}
