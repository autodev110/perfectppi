import SwiftUI
import Supabase

struct LoginView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var mode: Mode = .signIn

    enum Mode { case signIn, signUp }

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
        return !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !password.isEmpty
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
                try await auth.signUpWithEmail(trimmedEmail, password: password)
            }
        } catch {
            errorMessage = error.localizedDescription
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
