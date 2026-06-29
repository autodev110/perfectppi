# Tab 1

Device in Question:  
[https://www.scantool.net/obdlink-cx/](https://www.scantool.net/obdlink-cx/)

Device Docs:  
[https://www.scantool.net/scantool/downloads/682/obdlink\_frpm\_f.pdf](https://www.scantool.net/scantool/downloads/682/obdlink_frpm_f.pdf)

Cheaper device to consider that may also be compatible:  
[link](https://www.amazon.com/vLinker-Bluetooth-Adapter-Diagnostic-Black/dp/B0D474RC4W/ref=sr_1_2_sspa?adgrpid=189434002027&dib=eyJ2IjoiMSJ9.xcM2-TmxqB7vus0dsG3Bv82QYo5-BgeslDLFdZmwlyiJQxN6Q4gUZ0TdSoXZY-hj443hQRARiWBeMXqu0OfxtnJg9FDKdcbiwUXlqzP8KmPP15KIu59oWohof2qBL7ewl6AArMZrSkI5gH9Ydh8Ar6gn21i8U4QGIZf_MRp_VUoz9YordzzNuQvXmCNTUCopjE0muYerhQNshLYja9BmDMN4NU63v-3ZWHbAgAL6Fh0.9jk8awLTFhm0i6gLv9yFbZnB0gw_7qOG_Henc68la64&dib_tag=se&hvadid=792910312683&hvdev=c&hvexpln=0&hvlocphy=9192820&hvnetw=g&hvocijid=6852292228934781688--&hvqmt=e&hvrand=6852292228934781688&hvtargid=kwd-2278026947937&hydadcr=6364_13571934_2418516&keywords=obdlink%2Bcx%2Bble%2Badapter&mcid=30649dd81a2034398ebbeb3a364507c1&qid=1776715688&sr=8-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1)

# **PerfectPPI Mobile Transformation Roadmap**

## **Objective**

Convert the existing PerfectPPI Next.js web application into a cross-platform inspection platform with native iOS/Android support through Capacitor. The mobile app must support guided vehicle inspections, real-time OBD-II diagnostics, BLE hardware communication, and future desktop/laptop usage through either the existing web app/PWA or a separate Electron build.

The target hardware is the OBDLink CX BLE adapter.

---

# **Key Technical Corrections**

## **1\. Next.js cannot be blindly dropped into Capacitor**

Capacitor expects a static web build directory with an `index.html` and bundled assets. For Next.js, this usually means using static export via `output: 'export'`, which generates an `out` folder after `next build`. Capacitor’s `webDir` should point to that exported folder. ([Capacitor](https://capacitorjs.com/docs/getting-started?utm_source=chatgpt.com))

Important limitation: Next.js static export does **not** support features that require a live Node server, including dynamic routes without `generateStaticParams()`, cookies, rewrites, redirects, headers, middleware/proxy, ISR, default `next/image` optimization, draft mode, and Server Actions. These need to be moved to client-side API calls, Supabase, or an external backend. ([Next.js](https://nextjs.org/docs/app/guides/static-exports))

Recommended config:

```javascript
// next.config.js
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
```

```ts
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.perfectppi.app',
  appName: 'PerfectPPI',
  webDir: 'out',
};

export default config;
```

**Capacitor is a good fit for the mobile app**, especially if your current PerfectPPI app is already React/Next.js and you want to avoid rebuilding the whole UI in Swift/Kotlin.

But there are a few conditions.

## **What Capacitor can do well**

Capacitor can:

* Wrap your existing React/Next.js UI into iOS and Android apps  
* Give you access to native Bluetooth Low Energy through plugins  
* Connect to the OBDLink CX BLE adapter  
* Send OBD/AT commands  
* Receive diagnostic responses  
* Use camera, file storage, location, push notifications, etc.  
* Deploy through TestFlight and Google Play internal testing

So for **mobile inspection \+ OBDLink CX BLE diagnostics**, yes, Capacitor is viable.

## **The main catch**

You cannot just take any normal Next.js app and expect it to work perfectly inside Capacitor.

Capacitor works best when the frontend can be built as static assets.

So your Next.js app needs to either:

// next.config.js  
module.exports \= {  
 output: 'export',  
 images: {  
   unoptimized: true,  
 },  
};

or you need to restructure the app so the Capacitor version behaves like a client-side app that talks to Supabase/API endpoints.

That means avoiding or replacing things like:

* Server Actions  
* Middleware-dependent behavior  
* Server-only routes inside the mobile bundle  
* ISR  
* Next image optimization  
* Dynamic server rendering  
* Node-only code

For your type of app, that is usually fine because Supabase/API calls can handle most of the backend work.

## **Bluetooth specifically**

Yes, Capacitor can access BLE.

You would use:

npm install @capacitor-community/bluetooth-le  
npx cap sync

Then the mobile app can do:

await BleClient.initialize();

await BleClient.requestLEScan({}, (result) \=\> {  
 console.log(result.device);  
});

await BleClient.connect(deviceId);

For OBDLink CX, the app would connect to its BLE UART service, subscribe to the notify characteristic, and write commands to the write characteristic.

The rough flow is:

Scan for OBDLink CX  
Connect  
Discover services  
Subscribe to notification characteristic  
Write ATZ / ATE0 / ATL0 / ATSP0  
Read responses  
Send OBD-II commands  
Parse results  
Save inspection data

## **What I would not do**

I would not make laptop Bluetooth a core requirement in the same Capacitor build.

Capacitor is mainly for iOS and Android.

For laptops:

* Keep PerfectPPI as the normal Next.js web/PWA app  
* Use the mobile app for actual scanner/OBD inspections  
* Sync inspection results to your backend

That is much cleaner than forcing one app to handle mobile BLE and desktop BLE at the same time.

## **Best architecture**

Use this split:

PerfectPPI Web App  
\- Admin dashboard  
\- Inspection records  
\- Reports  
\- Settings  
\- User management

PerfectPPI Mobile App via Capacitor  
\- Guided inspection  
\- Photos  
\- OBDLink CX connection  
\- VIN/code/readiness scan  
\- Offline-friendly workflow if needed

Shared Backend  
\- Supabase/database/auth/storage  
\- API routes or backend service  
\- Inspection records  
\- Diagnostic snapshots

Shared Scanner Service  
\- Capacitor BLE transport for mobile  
\- Mock transport for testing  
\- Optional Web Bluetooth/Electron transport later

## **Bottom line**

Yes, **Capacitor is absolutely still possible**.

The right MVP path is:

1. Keep the current Next.js UI.  
2. Make sure the mobile-facing part can static export.  
3. Add Capacitor.  
4. Add BLE plugin.  
5. Test on a real iPhone/Android with the OBDLink CX.  
6. First goal: connect and send `ATZ`.  
7. Then build VIN/code/readiness parsing.  
8. Then integrate it into the inspection flow.

The biggest technical risk is not Capacitor itself. The biggest risk is whether the current Next.js app depends heavily on server-only features. If it does, you split the app into a mobile-safe frontend and backend API layer.

---

## **2\. Android BLE permissions in the original outline are outdated**

For Android 12/API 31+, `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` matter more than the old `BLUETOOTH` / `BLUETOOTH_ADMIN` permissions. Legacy permissions should generally be capped with `android:maxSdkVersion="30"`. If the app does not derive physical location from BLE scans, use `neverForLocation` and cap location permissions to SDK 30\. ([Android Developers](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions))

Use this direction:

```xml
<!-- Legacy Bluetooth for Android 11 and below -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />

<!-- BLE scanning/connection for Android 12+ -->
<uses-permission
    android:name="android.permission.BLUETOOTH_SCAN"
    android:usesPermissionFlags="neverForLocation" />

<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

<!-- Location only for Android 11 and below if scanning requires it -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" android:maxSdkVersion="30" />
```

Initialize BLE like this when using the Capacitor community BLE plugin:

```ts
await BleClient.initialize({
  androidNeverForLocation: true,
});
```

---

## **3\. iOS needs native BLE, not Web Bluetooth**

Web Bluetooth is not supported on iOS Safari, so the PWA/browser route cannot be used for iPhone BLE diagnostics. iOS BLE must go through CoreBluetooth via the Capacitor BLE plugin. ([MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API?utm_source=chatgpt.com))

For iOS, include:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>PerfectPPI uses Bluetooth to connect to the OBDLink CX adapter during vehicle inspections.</string>
```

If supporting iOS versions earlier than 13, also include `NSBluetoothPeripheralUsageDescription`. Apple documents `NSBluetoothPeripheralUsageDescription` for iOS 6–13, while CoreBluetooth access on iOS 13+ requires `NSBluetoothAlwaysUsageDescription`. ([Apple Developer](https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSBluetoothPeripheralUsageDescription?utm_source=chatgpt.com))

---

# **Phase 1: Capacitor Conversion**

## **Goal**

Wrap the existing PerfectPPI UI into a native mobile shell without rewriting the entire app.

## **Engineering Tasks**

1. Add Capacitor to the current repo.  
2. Configure Next.js static export.  
3. Add iOS and Android native projects.  
4. Confirm local build opens successfully in Xcode and Android Studio.  
5. Confirm login/session handling works inside the Capacitor WebView.  
6. Audit all existing Next.js server-only features and move them out of the mobile bundle.

## **Commands**

```shell
npm install @capacitor/core
npm install -D @capacitor/cli
npx cap init

npm install @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android

npm run build
npx cap sync
npx cap open ios
npx cap open android
```

## **Acceptance Criteria**

* `npm run build` produces a valid `out` folder.  
* `npx cap sync` copies the build into native projects.  
* iOS app launches on real iPhone.  
* Android app launches on real Android device.  
* Existing inspection UI works without server-render dependency failures.

---

# **Phase 2: BLE Bridge Layer**

## **Goal**

Create a dedicated scanner abstraction so UI components do not directly call BLE APIs.

Use `@capacitor-community/bluetooth-le`. The plugin supports scanning, connection, service discovery, reading, writing, write-without-response, notifications, disconnects, and MTU handling across Android and iOS. ([GitHub](https://github.com/capacitor-community/bluetooth-le))

## **Required Architecture**

```
/app
  /inspection
  /scanner
/lib
  /scanner
    ScannerService.ts
    CapacitorBleTransport.ts
    MockScannerTransport.ts
    obdCommands.ts
    obdParser.ts
    scannerTypes.ts
```

## **ScannerService Responsibilities**

The UI should only call high-level methods:

```ts
scanner.initialize()
scanner.scanForAdapters()
scanner.connect(deviceId)
scanner.handshake()
scanner.readVin()
scanner.readDtcCodes()
scanner.readLivePid(pid)
scanner.disconnect()
```

The BLE transport layer handles:

```ts
BleClient.initialize()
BleClient.requestLEScan()
BleClient.connect()
BleClient.getServices()
BleClient.startNotifications()
BleClient.writeWithoutResponse()
BleClient.disconnect()
```

The plugin specifically recommends starting notifications once per characteristic and sharing that stream instead of calling notifications from multiple components. ([GitHub](https://github.com/capacitor-community/bluetooth-le))

## **Acceptance Criteria**

* App can scan for BLE devices.  
* App filters and displays likely OBDLink CX devices.  
* App connects to selected adapter.  
* App detects disconnects and updates UI state.  
* Scanner logic works with a mock transport for local development without hardware.

---

# **Phase 3: OBDLink CX Integration**

## **Goal**

Communicate with the OBDLink CX over BLE and execute OBD-II commands required for warranty/VSC inspection.

OBDLink CX is BLE 5.1 only and does not support Classic Bluetooth. It supports diagnostic protocols including ISO 15765 CAN, SAE J1939, ISO 11898 raw CAN, ISO 9141, and ISO 14230/KWP2000. ([OBDLink](https://support.obdlink.com/support/solutions/articles/43000746707-obdlink-cx-adapter-notes))

## **Critical UUIDs**

Use the OBDLink CX custom UART service:

```ts
export const OBDLINK_CX = {
  SERVICE_UUID: '0000FFF0-0000-1000-8000-00805F9B34FB',
  NOTIFY_CHARACTERISTIC_UUID: '0000FFF1-0000-1000-8000-00805F9B34FB',
  WRITE_CHARACTERISTIC_UUID: '0000FFF2-0000-1000-8000-00805F9B34FB',
};
```

OBDLink’s official CX adapter notes identify `FFF0` as the custom UART service, `FFF1` as notification, and `FFF2` as write/write-without-response. ([OBDLink](https://support.obdlink.com/support/solutions/articles/43000746707-obdlink-cx-adapter-notes))

## **MTU Handling**

OBDLink CX supports a maximum MTU of 247 bytes, but host devices may negotiate lower values. Any message longer than the usable MTU must be chunked before sending. OBDLink also states that CX does not support queued writes. ([OBDLink](https://support.obdlink.com/support/solutions/articles/43000746707-obdlink-cx-adapter-notes))

## **Initial Command Handshake**

Start with a minimal ELM/STN-style handshake:

```
ATZ        reset adapter
ATE0       echo off
ATL0       linefeeds off
ATS0       spaces off
ATH0       headers off
ATSP0      automatic protocol
0100       supported PIDs
0902       VIN
03         stored diagnostic trouble codes
07         pending diagnostic trouble codes
```

OBDLink devices are OBD-to-UART interpreters compatible with the ELM327 AT command set, and the programming manual covers AT commands, ST commands, OBD requests, VIN, DTCs, freeze frames, I/M information, and live parameters. ([ScanTool.net](https://www.scantool.net/scantool/downloads/678/obdlink_frpm_e.pdf?srsltid=AfmBOoop8ktj_q0iYCNC68FaDUQrJkfjfcAYjVzCfmB8ZuT0To_GIA6l))

## **Acceptance Criteria**

* Connects to OBDLink CX.  
* Subscribes to notify characteristic.  
* Writes commands to write characteristic.  
* Receives raw response stream.  
* Parses VIN from Mode 09 PID 02\.  
* Reads supported PIDs from Mode 01 PID 00\.  
* Reads stored and pending DTCs.  
* Displays adapter connection state clearly in the inspection flow.

---

# **Phase 4: Inspection Workflow Integration**

## **Goal**

Turn diagnostics into a guided inspection experience, not just a scanner screen.

## **UX Flow**

1. Inspector starts inspection.  
2. App asks inspector to plug in OBDLink CX.  
3. App confirms adapter detected.  
4. App confirms vehicle ECU connection.  
5. App pulls VIN.  
6. App compares scanned VIN against inspection record.  
7. App reads codes and readiness data.  
8. App flags warranty/VSC risk items.  
9. App attaches diagnostic snapshot to final inspection report.

## **UI States**

```
Not Connected
Scanning
Adapter Found
Connecting
Connected to Adapter
Detecting Vehicle Protocol
Vehicle Connected
Reading VIN
Reading Codes
Reading Readiness
Complete
Failed / Retry Needed
```

## **Required Failure Handling**

* Bluetooth disabled  
* Permission denied  
* Adapter not found  
* Adapter connected but no vehicle ignition/power  
* Vehicle protocol not detected  
* VIN mismatch  
* BLE disconnect mid-inspection  
* Command timeout  
* Invalid/partial response  
* Unsupported PID

## **Acceptance Criteria**

* Inspector never sees raw BLE errors.  
* Every failure state gives a clear next action.  
* Inspection can continue manually if scanner fails.  
* Final inspection record stores both successful results and scanner failure notes.

---

# **Phase 5: Desktop/Laptop Strategy**

## **Recommended Approach**

Keep the existing Next.js app as the laptop/PWA version for normal inspection management, report review, admin, and dashboard usage.

For Bluetooth diagnostics on laptops, do **not** assume parity with mobile. Browser Web Bluetooth support is inconsistent, and Safari/iOS does not support it. Chrome-based desktop support may work for some workflows, but it should be treated as a separate compatibility track. ([MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API?utm_source=chatgpt.com))

## **Options**

### **Option A: PWA for laptop, mobile app for BLE**

Best path for MVP.

* Laptop users use PerfectPPI web app.  
* Inspectors use iOS/Android app for BLE scanning.  
* Diagnostic results sync to Supabase/backend.  
* No native desktop complexity.

### **Option B: Electron desktop app**

Use only if laptop BLE diagnostics is mandatory.

* Wrap shared Next.js/React UI in Electron.  
* Add a desktop BLE transport.  
* Reuse `ScannerService`.  
* Create separate `ElectronBleTransport`.

## **Shared Scanner Interface**

```ts
interface ScannerTransport {
  initialize(): Promise<void>;
  scan(): Promise<ScannerDevice[]>;
  connect(deviceId: string): Promise<void>;
  write(command: string): Promise<void>;
  onData(callback: (data: string) => void): void;
  disconnect(): Promise<void>;
}
```

This keeps the UI stable while swapping implementations:

```
CapacitorBleTransport   -> iOS/Android
WebBluetoothTransport   -> Chrome desktop/PWA if supported
ElectronBleTransport    -> native desktop if needed
MockScannerTransport    -> development/testing
```

---

# **Phase 6: Release Management**

## **Apple**

Organization enrollment requires legal entity verification and a D-U-N-S number unless the account is individual/non-organization. Apple uses the D-U-N-S number to verify identity, legal entity status, and address. ([Apple Developer](https://developer.apple.com/help/account/membership/D-U-N-S/?utm_source=chatgpt.com))

TestFlight supports internal beta distribution through App Store Connect. Apple currently allows up to 100 internal testers with App Store Connect access, and external testing can support up to 10,000 testers but may require beta review. ([Apple Developer](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/?utm_source=chatgpt.com))

## **Android**

Set up Google Play Console internal testing after the Android build is stable. Android release work should include signed build configuration, package name finalization, permission review, privacy disclosures, and device testing across at least one Samsung, one Pixel, and one older Android device.

---

# **Engineering Priority Checklist**

| Category | Priority | Action |
| ----- | ----- | ----- |
| Foundation | High | Convert Next.js app to static-export-compatible build |
| Foundation | High | Add Capacitor iOS/Android projects |
| Foundation | High | Confirm auth/session behavior inside native WebView |
| BLE | High | Install and validate `@capacitor-community/bluetooth-le` |
| BLE | High | Add iOS and Android permissions correctly |
| BLE | High | Scan/connect/disconnect to OBDLink CX |
| Hardware | High | Subscribe to `FFF1`, write to `FFF2`, use service `FFF0` |
| Hardware | High | Implement OBD command handshake |
| Hardware | High | Parse VIN, DTCs, readiness, supported PIDs |
| Logic | Medium | Build `ScannerService` abstraction |
| Logic | Medium | Add mock scanner for development/testing |
| UX | High | Add guided scanner states to inspection flow |
| UX | High | Add scanner failure fallback/manual override |
| QA | High | Test on real iPhone, real Android, real vehicle, and bench simulator if available |
| Compliance | High | Start Apple Developer organization enrollment early |
| Distribution | Medium | Set up TestFlight internal build lane |
| Desktop | Low/MVP Later | Keep web/PWA first; evaluate Electron only if required |

---

# **MVP Recommendation**

Build the first production version as:

```
Next.js web app:
Admin, dashboard, inspection management, report review

Capacitor iOS/Android app:
Inspector workflow + OBDLink CX BLE diagnostics

Shared backend:
Supabase/API for auth, inspection records, diagnostic snapshots, reports

Shared scanner abstraction:
Mock now, Capacitor mobile now, desktop/Electron later
```

Main risk areas:

1. Existing Next.js server features breaking under static export.  
2. Android permission handling across SDK versions.  
3. BLE MTU/chunking issues with OBDLink CX.  
4. iOS TestFlight/provisioning delays.  
5. Real-vehicle protocol variance across makes/models.

The highest-value first sprint is not full diagnostics. It is simply: **Capacitor build \+ BLE scan \+ connect to OBDLink CX \+ send `ATZ` \+ receive response**. Once that handshake works reliably on both iOS and Android, the rest becomes normal protocol parsing and inspection UX.

# Tab 2

Went through the doc and tested both scanners. I think we are about 90% aligned, but I have a couple real pushbacks.

On hardware: CX should stay the primary target.

iCar2 is tempting at $20, but I don’t think it’s worth starting with. CX has published BLE UUIDs and a real programming manual. iCar2 doesn’t, so we’d be sniffing packets with nRF Connect just to understand what services it exposes. That’s probably days of random R\&D before we even start the actual integration.

CX is also just a better fit technically: BLE 5.1, larger MTU, and clearer write behavior. iCar2 is BLE 4.0 with tiny writes, so VIN and multi-frame DTC reads are going to feel noticeably slower. For a commercial product touching customer vehicles, the extra \~$60 feels like cheap insurance.

One practical issue: CX looks out of stock on ScanTool.net right now. We should order 2–3 from Amazon or another channel this week so the BLE phase doesn’t get blocked — one for iOS, one for Android, one spare.

I do still think iCar2 / generic ELM327 BLE dongles make sense later as a consumer self-PPI tier. The $20 price point is good for owners scanning their own car occasionally. But I’d treat that as phase 7+ and ship CX-only first, with a generic ELM327 transport added later behind the same ScannerService abstraction.

On the roadmap, my bigger pushback is the static export idea.

I don’t think we should static-export the current Next.js app. The current data layer is built around server components, server actions, RLS with server clients, and requireRole() guards. `output: 'export'` would force rewrites across page.tsx, actions.ts, and guard logic.

Cleaner path: keep the existing Next.js app on Vercel as-is, and build a sibling Vite \+ React \+ Capacitor app only for the inspector workflow:

intake → guided inspection → OBD scan → submit

That app can talk to Supabase directly with supabase-js, keep RLS in place, and call existing Vercel route handlers when it needs Gemini, DocuSeal, Stripe, or PDF generation. We can share types and ScannerService between the apps.

This also gives us offline support without putting the existing web app at risk. The mobile bundle only contains what actually needs to be mobile.

A few things I think the doc underweights:

Offline mode is not optional. Inspections can take 30+ minutes, and inspectors will lose signal in parking lots. Drafts should persist locally through Capacitor Preferences / IndexedDB and sync when the connection comes back. Much easier to design this in now than retrofit it later.

Supabase auth in WKWebView also needs a quick spike. Default cookie/session behavior can be unreliable across app restarts, so we should use a Capacitor Preferences storage adapter for the Supabase client. Worth testing before phase 1, because if auth doesn’t persist, nothing else matters.

Camera UX should also be native. The current PPI flow uses `<input type="file" capture>`, which works in a webview but feels web-y. Swapping to Capacitor’s camera plugin should be a small lift and a big UX win. I’d include that in phase 1\.

