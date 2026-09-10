import SwiftUI
import Supabase

struct LoginView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var username: String = ""
    @State private var usernameAvailability: UsernameAvailabilityState = .idle
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var mode: Mode = .signIn

    enum Mode { case signIn, signUp }
    private enum UsernameAvailabilityState { case idle, checking, available, unavailable }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Space.lg) {
                    Spacer().frame(height: 28)

                    // Hero
                    VStack(spacing: 14) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .fill(Theme.brandGradient)
                                .frame(width: 84, height: 84)
                                .shadow(color: Theme.Palette.primary.opacity(0.4), radius: 16, y: 8)
                            Image(systemName: "car.side.fill")
                                .font(.system(size: 38, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                        Text("PerfectPPI")
                            .font(.system(size: 34, weight: .black, design: .rounded))
                        Text(mode == .signIn ? "Welcome back." : "Create your account.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    // Fields
                    VStack(spacing: 12) {
                        if mode == .signUp {
                            fieldRow(icon: "at") {
                                TextField("Username", text: $username)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .textContentType(.username)
                            }
                            Text("4–16 characters. Letters, numbers, and underscores only. Usernames cannot be changed yet.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if usernameAvailability == .checking {
                                Label("Checking availability…", systemImage: "arrow.triangle.2.circlepath")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            } else if usernameAvailability == .available {
                                Label("Username is available.", systemImage: "checkmark.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            } else if usernameAvailability == .unavailable {
                                Label("Username is unavailable.", systemImage: "xmark.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(Theme.Palette.danger)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        fieldRow(icon: "envelope.fill") {
                            TextField("Email", text: $email)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.emailAddress)
                                .textContentType(.emailAddress)
                        }
                        fieldRow(icon: "lock.fill") {
                            SecureField("Password", text: $password)
                                .textContentType(mode == .signIn ? .password : .newPassword)
                        }
                    }

                    if mode == .signUp {
                        Text("After creating your account, you will review and accept the current Terms of Service before using PerfectPPI.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)

                        HStack(spacing: 14) {
                            Link("Terms", destination: legalURL("terms"))
                            Link("Privacy", destination: legalURL("privacy"))
                            Link("Notice at Collection", destination: legalURL("notice-at-collection"))
                        }
                        .font(.caption)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.circle.fill")
                            .font(.callout)
                            .foregroundStyle(Theme.Palette.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    VStack(spacing: 12) {
                        Button(mode == .signIn ? "Sign In" : "Create Account") {
                            Task { await submit() }
                        }
                        .buttonStyle(PrimaryButtonStyle(isLoading: isWorking))
                        .disabled(isWorking || !canSubmit)

                        HStack {
                            Rectangle().fill(Theme.Palette.hairline).frame(height: 1)
                            Text("or").font(.caption).foregroundStyle(.secondary)
                            Rectangle().fill(Theme.Palette.hairline).frame(height: 1)
                        }
                        .padding(.vertical, 2)

                        Button {
                            Task { await oauth(.google) }
                        } label: {
                            Label("Continue with Google", systemImage: "globe")
                        }
                        .buttonStyle(OutlineButtonStyle())
                        .disabled(isWorking)
                    }

                    Button(mode == .signIn ? "Need an account? Sign up" : "Have an account? Sign in") {
                        withAnimation(.easeInOut) {
                            mode = mode == .signIn ? .signUp : .signIn
                            errorMessage = nil
                            usernameAvailability = .idle
                        }
                    }
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Theme.Palette.primary)

                    Spacer(minLength: 12)
                }
                .padding(.horizontal, Theme.Space.lg)
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationBarHidden(true)
            .background(Color(.systemBackground).ignoresSafeArea())
            .task(id: username) { await checkUsernameAvailability() }
        }
    }

    @ViewBuilder
    private func fieldRow<Content: View>(icon: String, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15))
                .foregroundStyle(.secondary)
                .frame(width: 20)
            content()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 15)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
    }

    private var canSubmit: Bool {
        let credentialsValid = !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
        return mode == .signIn ? credentialsValid : credentialsValid && usernameIsValid
    }

    private var usernameIsValid: Bool {
        let value = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (4...16).contains(value.count) else { return false }
        return value.range(of: "^[A-Za-z0-9_]+$", options: .regularExpression) != nil
    }

    private func submit() async {
        guard !isWorking, canSubmit else {
            errorMessage = "Email and password required."
            return
        }
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)

        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        do {
            if mode == .signIn {
                try await auth.signInWithEmail(trimmedEmail, password: password)
            } else {
                try await auth.signUpWithEmail(
                    trimmedEmail,
                    password: password,
                    username: username.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func checkUsernameAvailability() async {
        usernameAvailability = .idle
        guard mode == .signUp, usernameIsValid else { return }
        do {
            try await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            usernameAvailability = .checking
            let result = try await ProfilesAPI.usernameAvailability(
                username.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            usernameAvailability = result.available ? .available : .unavailable
        } catch is CancellationError {
            return
        } catch {
            usernameAvailability = .idle
        }
    }

    private func oauth(_ provider: Provider) async {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await auth.signInWithOAuth(provider)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
