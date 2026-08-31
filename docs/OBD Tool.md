# PerfectPPI OBD Tool

**Status:** Completed

The PerfectPPI OBD tool is the optional diagnostic scanner used at the start of
an inspection. It is implemented in the native Swift app and is integrated with
the inspection workflow, answer prefills, offline synchronization, AI analysis,
and generated reports.

## Product Scope

- Primary hardware: OBDLink CX Bluetooth Low Energy adapter.
- Platform: PerfectPPI's native iPhone and iPad app.
- Browser Bluetooth scanning is intentionally unsupported.
- Android, Capacitor, Electron, and desktop Bluetooth are not part of the
  completed scope.
- Compatible BLE OBD-II adapters may work, but OBDLink CX is the supported and
  tested target.
- The tool is read-only. It reads diagnostic information and does not clear
  codes or change vehicle settings.

## Inspection Workflow

1. At the beginning of an inspection, the inspector chooses **Use Scanner** or
   **Proceed Without Scanner**.
2. If scanning is selected, the app explains how to connect the adapter and
   asks the inspector to make sure the ignition is on.
3. The app discovers and connects to the adapter over Bluetooth.
4. The tool establishes communication with the vehicle, reads the available
   diagnostic information, and saves the result with the inspection.
5. The captured information prefills applicable inspection questions.
6. The inspector continues through the normal inspection workflow.
7. Scanner findings are included in the AI analysis and generated inspection
   reports.

The inspector can continue manually if Bluetooth is unavailable, permission is
denied, the adapter cannot be found, the vehicle cannot be reached, or the scan
fails.

## Information Captured

When supported by the vehicle, the OBD tool captures:

- VIN.
- Check-engine light or malfunction-indicator-lamp status.
- Stored diagnostic trouble codes.
- Pending diagnostic trouble codes.
- Permanent diagnostic trouble codes.
- Emissions-readiness monitor status.
- Supported diagnostic parameters.
- Available live vehicle data.
- Scanner status and the diagnostic exchange transcript needed for support and
  report traceability.

The system only records a clean, no-code result when valid ECU responses prove
that the relevant code checks completed. An incomplete scan is not presented as
a clean vehicle.

## Inspection And Report Integration

Scanner results can prefill:

- The inspection VIN.
- Whether the check-engine light is on.
- Whether diagnostic codes were scanned.
- The list of diagnostic trouble codes, or a confirmed no-code result.
- Applicable dashboard warning-light answers.

The complete scanner snapshot is available to the report-generation process.
Diagnostic codes, readiness results, warning-light findings, and scan
limitations can affect the inspection summary, notable findings, warranty/VSC
analysis, dashboard warnings, and final PDF report.

## Reliability And Safety

- Bluetooth permission, disabled-Bluetooth, connection, timeout, disconnect,
  unsupported-response, and vehicle-communication failures are presented as
  understandable user states.
- The inspector can retry a failed scan or continue the inspection without it.
- Scanner snapshots can be queued while offline and synchronized when the
  network returns.
- Inspection submission waits for pending offline answers, photos, and scanner
  data to synchronize.
- VIN and code answers are not overwritten with unsupported assumptions.
- Scanner information is stored with the inspection rather than treated as a
  separate disconnected tool.

## Implementation Summary

The completed implementation uses:

- Native Swift and SwiftUI.
- CoreBluetooth for BLE discovery, connection, notifications, and writes.
- The OBDLink CX UART service and characteristics.
- A serial OBD command session for adapter setup and vehicle queries.
- Dedicated parsers for VIN, diagnostic codes, readiness, supported
  parameters, and live data.
- The existing PerfectPPI backend for inspection storage, offline recovery,
  report generation, and PDF delivery.

## Completion Checklist

- [x] Optional scanner choice at inspection start.
- [x] Continue-without-scanner path.
- [x] OBDLink CX discovery and connection.
- [x] Vehicle communication handshake.
- [x] VIN capture.
- [x] Stored, pending, and permanent code capture.
- [x] Check-engine and readiness capture.
- [x] Inspection answer prefills.
- [x] Offline scanner snapshot queue.
- [x] AI report integration.
- [x] PDF report integration.
- [x] Retry and manual fallback states.
- [x] Native iOS camera VIN scanning as an alternative VIN-entry method.

This document records the completed OBD tool. It is not an active roadmap.
