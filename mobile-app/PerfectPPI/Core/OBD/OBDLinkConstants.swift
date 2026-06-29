import Foundation
@preconcurrency import CoreBluetooth

/// Custom BLE UART service / characteristics used by the OBDLink CX adapter.
/// Documented in https://support.obdlink.com/support/solutions/articles/43000746707
///
/// The same FFF0/FFF1/FFF2 layout is used by many ELM327-style BLE clones, so
/// the transport itself works against generic adapters too — but everything in
/// this app is designed and tested against the OBDLink CX as primary hardware.
enum OBDLink {
    /// Primary custom UART service.
    static let serviceUUID = CBUUID(string: "0000FFF0-0000-1000-8000-00805F9B34FB")
    /// Notification characteristic — peripheral pushes ELM/AT responses here.
    static let notifyCharacteristicUUID = CBUUID(string: "0000FFF1-0000-1000-8000-00805F9B34FB")
    /// Write characteristic — host writes AT/OBD commands here. The CX adapter
    /// recommends write-without-response and explicitly does NOT support
    /// queued writes, so we serialise our outgoing pipeline ourselves.
    static let writeCharacteristicUUID = CBUUID(string: "0000FFF2-0000-1000-8000-00805F9B34FB")

    /// The ELM327 prompt character that terminates every response.
    static let promptCharacter: Character = ">"

    /// Carriage return used to terminate every outgoing AT/OBD command.
    static let commandTerminator = "\r"

    /// Heuristic for spotting an OBDLink CX during scanning. The CX advertises
    /// itself with a name starting with "OBDLink" (e.g. "OBDLink CX"); we
    /// surface anything that matches that prefix at the top of the list.
    static let adapterNamePrefixes = ["OBDLink", "OBD II", "OBD2", "ELM327"]
}
