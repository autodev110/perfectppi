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
            VStack(spacing: 24) {
                Spacer().frame(height: 24)
                Text("PerfectPPI")
                    .font(.system(size: 42, weight: .black, design: .rounded))
                    .foregroundStyle(Theme.Palette.primary)
                Text(mode == .signIn ? "Welcome back." : "Create your account.")
                    .foregroundStyle(.secondary)

                VStack(spacing: 12) {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .padding()
                        .background(Theme.Palette.subtle)
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                    SecureField("Password", text: $password)
                        .textContentType(mode == .signIn ? .password : .newPassword)
                        .padding()
                        .background(Theme.Palette.subtle)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .padding(.horizontal)

                if let errorMessage {
                    Text(errorMessage)
                        .font(.callout)
                        .foregroundStyle(Theme.Palette.danger)
                        .padding(.horizontal)
                }

                Button(mode == .signIn ? "Sign In" : "Create Account") {
                    Task { await submit() }
                }
                .buttonStyle(PrimaryButtonStyle(isLoading: isWorking))
                .disabled(isWorking || !canSubmit)
                .padding(.horizontal)

                Button("Continue with Google") {
                    Task { await oauth(.google) }
                }
                .buttonStyle(OutlineButtonStyle())
                .disabled(isWorking)
                .padding(.horizontal)

                Button(mode == .signIn ? "Need an account? Sign up" : "Have an account? Sign in") {
                    mode = mode == .signIn ? .signUp : .signIn
                    errorMessage = nil
                }
                .font(.footnote)
                .foregroundStyle(.secondary)

                Spacer()
            }
            .navigationBarHidden(true)
            .background(Color(.systemBackground).ignoresSafeArea())
        }
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
