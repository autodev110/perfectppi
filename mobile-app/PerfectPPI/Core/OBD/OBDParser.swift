import Foundation

/// Descriptor for one Mode 01 live-data PID: how to label it, its unit, and how
/// to turn the raw data bytes (everything after the `41 <pid>` header) into a
/// numeric value. `decode` returns nil when the reply is too short to trust.
struct OBDLivePID {
    let pid: UInt8
    let name: String
    let unit: String
    let decode: ([UInt8]) -> Double?
}

/// Parsers for the small set of OBD-II responses we read during a basic scan.
/// The wire format is always ASCII hex split across lines; the ELM327 strips
/// the protocol framing for us but leaves multi-frame replies (e.g. VIN) split
/// into a leading line count plus the data lines.
enum OBDParser {
    /// Strip whitespace, line numbers, and per-line counters, returning a flat
    /// array of hex bytes ready to interpret. Handles both single-frame
    /// responses (e.g. `41 00 BE 1F A8 13`) and ISO-TP multi-frame responses
    /// where the ELM emits a leading line count then `0:`-prefixed segments.
    static func bytes(from response: String) -> [UInt8] {
        let trimmed = response
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !$0.uppercased().contains("SEARCHING") && $0 != "OK" }

        var hexTokens: [String] = []
        for line in trimmed {
            let upperLine = line.uppercased()
            if upperLine.contains("NO DATA")
                || upperLine.contains("UNABLE TO CONNECT")
                || upperLine.contains("ERROR")
                || upperLine.contains("STOPPED")
                || upperLine.contains("BUS INIT") {
                continue
            }

            // Drop "NN:" line index prefix on multi-frame data lines.
            let cleaned: String
            if let colonIdx = line.firstIndex(of: ":"), line.distance(from: line.startIndex, to: colonIdx) <= 2 {
                cleaned = String(line[line.index(after: colonIdx)...])
            } else {
                cleaned = line
            }
            // Split on whitespace first, then on any token longer than 2 chars
            // chop into 2-char hex pairs. ATS0 (spaces off) in the handshake
            // means most responses arrive as one continuous hex string, so we
            // must be able to recover bytes without relying on separators.
            let words = cleaned.split(whereSeparator: { $0.isWhitespace }).map(String.init)
            for word in words {
                guard word.allSatisfy({ $0.isHexDigit }) else { continue }

                if word.count <= 2 {
                    if word.count == 2 {
                        hexTokens.append(word)
                    }
                } else {
                    guard word.count.isMultiple(of: 2) else { continue }

                    var i = word.startIndex
                    while i < word.endIndex {
                        let next = word.index(i, offsetBy: 2, limitedBy: word.endIndex) ?? word.endIndex
                        hexTokens.append(String(word[i..<next]))
                        i = next
                    }
                }
            }
        }

        return hexTokens.compactMap { UInt8($0, radix: 16) }
    }

    /// Parse a VIN from a `0902` reply. The bytes after the `49 02 01` header
    /// are the 17 ASCII characters of the VIN (sometimes left-padded with
    /// `00`s for the first frame). Returns `nil` if no plausible VIN is
    /// reconstructed.
    static func parseVIN(from response: String) -> String? {
        let allBytes = bytes(from: response)
        guard let idx = allBytes.firstIndex(where: { $0 == 0x49 }),
              idx + 2 < allBytes.count else { return nil }
        // 0x49 = 0x40 | 0x09 (mode 09 success). Next byte = PID (0x02), then
        // 0x01 (number of data items), then the VIN ASCII chars.
        let asciiStart = idx + 3
        let payload = Array(allBytes[asciiStart...]).filter { $0 != 0x00 }
        let scalars = payload.compactMap { byte -> Character? in
            guard (0x20...0x7E).contains(byte) else { return nil }
            return Character(UnicodeScalar(byte))
        }
        let vin = String(scalars).trimmingCharacters(in: .whitespacesAndNewlines)
        // Real VINs are exactly 17 ASCII alphanumeric chars. Anything shorter
        // is almost certainly a truncated multi-frame read — return nil so
        // the UI shows "—" rather than a misleading partial string.
        guard vin.count >= 17 else { return nil }
        let candidate = String(vin.prefix(17))
        let allowed = CharacterSet(charactersIn: "ABCDEFGHJKLMNPRSTUVWXYZ0123456789")
        return candidate.rangeOfCharacter(from: allowed.inverted) == nil ? candidate : nil
    }

    /// Parse stored or pending DTCs from a Mode 03 / Mode 07 response. Each
    /// DTC is two bytes; the high nibble of the first byte determines the
    /// system letter (P/C/B/U).
    static func parseDTCs(from response: String, expectedModeByte: UInt8) -> [String] {
        let allBytes = bytes(from: response)
        guard let idx = allBytes.firstIndex(of: expectedModeByte) else { return [] }
        var payload = Array(allBytes[(idx + 1)...])
        // Service 03/07 positive responses usually contain DTC pairs directly
        // after the mode byte. Some adapters/protocols include a count byte;
        // only drop it when the remaining byte count makes that plausible.
        if payload.count % 2 == 1,
           let possibleCount = payload.first,
           Int(possibleCount) <= (payload.count - 1) / 2 {
            payload.removeFirst()
        }

        var codes: [String] = []
        var i = 0
        while i + 1 < payload.count {
            let hi = payload[i]
            let lo = payload[i + 1]
            i += 2
            if hi == 0 && lo == 0 { continue }
            codes.append(formatDTC(hi: hi, lo: lo))
        }
        return codes
    }

    private static func formatDTC(hi: UInt8, lo: UInt8) -> String {
        let systemLetter: Character
        switch (hi & 0xC0) >> 6 {
        case 0x0: systemLetter = "P"
        case 0x1: systemLetter = "C"
        case 0x2: systemLetter = "B"
        case 0x3: systemLetter = "U"
        default:  systemLetter = "?"
        }
        let firstDigit = (hi & 0x30) >> 4
        let secondDigit = hi & 0x0F
        let thirdDigit = (lo & 0xF0) >> 4
        let fourthDigit = lo & 0x0F
        return String(format: "%@%X%X%X%X",
                      String(systemLetter), firstDigit, secondDigit, thirdDigit, fourthDigit)
    }

    /// Parse a Mode 01 "supported PIDs" bitmap response into the list of PID
    /// numbers the vehicle supports within that bank. `pidBank` is the PID we
    /// queried (0x00 for PIDs 0x01–0x20, 0x20 for 0x21–0x40, 0x40 for 0x41–0x60,
    /// and so on); returned PID numbers are offset accordingly. The high bit of
    /// each bank (0x20, 0x40, …) is a "next bank exists" flag rather than a real
    /// sensor — callers walk the banks by following it.
    static func parseSupportedPIDs(from response: String, pidBank: UInt8 = 0x00) -> [UInt8] {
        let allBytes = bytes(from: response)
        guard let idx = allBytes.firstIndex(of: 0x41),
              idx + 5 < allBytes.count,
              allBytes[idx + 1] == pidBank else { return [] }
        let mask = (UInt32(allBytes[idx + 2]) << 24)
                 | (UInt32(allBytes[idx + 3]) << 16)
                 | (UInt32(allBytes[idx + 4]) << 8)
                 | UInt32(allBytes[idx + 5])

        var pids: [UInt8] = []
        for bit in 0..<32 {
            // PID number within this bank: bank base + bit offset + 1.
            let pid = pidBank &+ UInt8(bit + 1)
            if mask & (UInt32(1) << (31 - bit)) != 0 {
                pids.append(pid)
            }
        }
        return pids
    }

    /// Decode a single Mode 01 live-data reply (e.g. `01 0C` → engine RPM) into
    /// a numeric value using the supplied PID descriptor. Locates the `41 <pid>`
    /// header so it's robust to a `SEARCHING…` prefix or a leading echo, then
    /// hands the trailing data bytes to the descriptor's decode formula.
    static func parseLiveReading(from response: String, descriptor: OBDLivePID) -> OBDLiveReading? {
        let allBytes = bytes(from: response)
        var i = 0
        while i + 1 < allBytes.count {
            if allBytes[i] == 0x41 && allBytes[i + 1] == descriptor.pid {
                let data = Array(allBytes[(i + 2)...])
                guard let value = descriptor.decode(data) else { return nil }
                return OBDLiveReading(
                    pid: descriptor.pid,
                    name: descriptor.name,
                    value: value,
                    unit: descriptor.unit,
                    rawResponse: response
                )
            }
            i += 1
        }
        return nil
    }

    /// The Mode 01 live-data PIDs we pull during an inspection scan, in display
    /// order. Each is read only when the vehicle's supported-PID bitmap includes
    /// it. Decode formulas follow the SAE J1979 standard; `data` is every byte
    /// after the `41 <pid>` header (A = data[0], B = data[1], …).
    static let inspectionLivePIDs: [OBDLivePID] = [
        OBDLivePID(pid: 0x04, name: "Engine Load",                  unit: "%")     { d in d.count >= 1 ? Double(d[0]) * 100 / 255 : nil },
        OBDLivePID(pid: 0x05, name: "Coolant Temp",                 unit: "°C")    { d in d.count >= 1 ? Double(Int(d[0]) - 40) : nil },
        OBDLivePID(pid: 0x06, name: "Short-Term Fuel Trim B1",      unit: "%")     { d in d.count >= 1 ? (Double(d[0]) - 128) * 100 / 128 : nil },
        OBDLivePID(pid: 0x07, name: "Long-Term Fuel Trim B1",       unit: "%")     { d in d.count >= 1 ? (Double(d[0]) - 128) * 100 / 128 : nil },
        OBDLivePID(pid: 0x0A, name: "Fuel Pressure",                unit: "kPa")   { d in d.count >= 1 ? Double(Int(d[0]) * 3) : nil },
        OBDLivePID(pid: 0x0B, name: "Intake Manifold Pressure",     unit: "kPa")   { d in d.count >= 1 ? Double(d[0]) : nil },
        OBDLivePID(pid: 0x0C, name: "Engine RPM",                   unit: "rpm")   { d in d.count >= 2 ? (Double(d[0]) * 256 + Double(d[1])) / 4 : nil },
        OBDLivePID(pid: 0x0D, name: "Vehicle Speed",                unit: "km/h")  { d in d.count >= 1 ? Double(d[0]) : nil },
        OBDLivePID(pid: 0x0E, name: "Timing Advance",               unit: "° BTDC"){ d in d.count >= 1 ? Double(d[0]) / 2 - 64 : nil },
        OBDLivePID(pid: 0x0F, name: "Intake Air Temp",              unit: "°C")    { d in d.count >= 1 ? Double(Int(d[0]) - 40) : nil },
        OBDLivePID(pid: 0x10, name: "MAF Air Flow",                 unit: "g/s")   { d in d.count >= 2 ? (Double(d[0]) * 256 + Double(d[1])) / 100 : nil },
        OBDLivePID(pid: 0x11, name: "Throttle Position",            unit: "%")     { d in d.count >= 1 ? Double(d[0]) * 100 / 255 : nil },
        OBDLivePID(pid: 0x1F, name: "Run Time Since Start",         unit: "s")     { d in d.count >= 2 ? Double(d[0]) * 256 + Double(d[1]) : nil },
        OBDLivePID(pid: 0x21, name: "Distance With MIL On",         unit: "km")    { d in d.count >= 2 ? Double(d[0]) * 256 + Double(d[1]) : nil },
        OBDLivePID(pid: 0x2F, name: "Fuel Tank Level",              unit: "%")     { d in d.count >= 1 ? Double(d[0]) * 100 / 255 : nil },
        OBDLivePID(pid: 0x31, name: "Distance Since Codes Cleared", unit: "km")    { d in d.count >= 2 ? Double(d[0]) * 256 + Double(d[1]) : nil },
        OBDLivePID(pid: 0x33, name: "Barometric Pressure",          unit: "kPa")   { d in d.count >= 1 ? Double(d[0]) : nil },
        OBDLivePID(pid: 0x42, name: "Control Module Voltage",       unit: "V")     { d in d.count >= 2 ? (Double(d[0]) * 256 + Double(d[1])) / 1000 : nil },
        OBDLivePID(pid: 0x43, name: "Absolute Load",                unit: "%")     { d in d.count >= 2 ? (Double(d[0]) * 256 + Double(d[1])) * 100 / 255 : nil },
        OBDLivePID(pid: 0x46, name: "Ambient Air Temp",             unit: "°C")    { d in d.count >= 1 ? Double(Int(d[0]) - 40) : nil },
        OBDLivePID(pid: 0x5C, name: "Engine Oil Temp",              unit: "°C")    { d in d.count >= 1 ? Double(Int(d[0]) - 40) : nil },
        OBDLivePID(pid: 0x5E, name: "Engine Fuel Rate",             unit: "L/h")   { d in d.count >= 2 ? (Double(d[0]) * 256 + Double(d[1])) / 20 : nil },
    ]

    /// Parse Mode 01 PID 01. Byte A contains MIL state and stored DTC count;
    /// bytes B/C/D contain monitor readiness bits. We retain all four raw
    /// bytes so later report generation can interpret readiness in more
    /// detail without losing the original ECU data.
    static func parseMonitorStatus(from response: String) -> OBDMonitorStatus? {
        let allBytes = bytes(from: response)
        guard let idx = allBytes.firstIndex(of: 0x41),
              idx + 5 < allBytes.count,
              allBytes[idx + 1] == 0x01 else { return nil }
        let a = allBytes[idx + 2]
        let b = allBytes[idx + 3]
        let c = allBytes[idx + 4]
        let d = allBytes[idx + 5]
        return OBDMonitorStatus(
            milOn: (a & 0x80) != 0,
            storedDTCCount: Int(a & 0x7F),
            rawStatusBytes: [a, b, c, d]
        )
    }
}
