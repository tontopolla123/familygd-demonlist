
"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              username: username.trim(),
            },
          },
        });

        if (error) throw error;

        if (data.session) {
          window.location.assign("/");
          return;
        }

        setMessage(
          "Cuenta creada. Revisá tu correo para confirmar el registro antes de iniciar sesión."
        );
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        if (!data.session) {
          setMessage(
            "El inicio de sesión no devolvió una sesión activa. Revisá la confirmación de tu correo en Supabase."
          );
          return;
        }

        // Confirmar que Supabase puede recuperar la sesión recién creada.
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw userError ?? new Error("No se pudo recuperar el usuario.");
        }

        // Recargar la aplicación para volver a detectar la sesión.
        window.location.assign("/");
        return;
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <Link href="/" className="login-back">
          ← Volver a la Demon List
        </Link>

        <div className="login-brand">
          <span className="brand-cube" />
          <span className="brand-name">Familia GD</span>
        </div>

        <p className="eyebrow">CUENTA DE JUGADOR</p>

        <h1>
          {mode === "login"
            ? "Bienvenido de nuevo."
            : "Unite a la lista."}
        </h1>

        <p className="login-description">
          {mode === "login"
            ? "Iniciá sesión para acceder a tu cuenta."
            : "Creá tu cuenta para empezar a registrar tus progresos."}
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === "signup" && (
            <label>
              Nombre de jugador
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Tu nombre"
                minLength={3}
                maxLength={24}
                autoComplete="nickname"
                required
              />
            </label>
          )}

          <label>
            Correo electrónico
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jugador@ejemplo.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo 8 caracteres"
              minLength={8}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
            />
          </label>

          {message && (
            <p className="login-message" role="alert">
              {message}
            </p>
          )}

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            {loading
              ? "Procesando..."
              : mode === "login"
                ? "Iniciar sesión"
                : "Crear cuenta"}
          </button>
        </form>

        <p className="login-switch">
          {mode === "login"
            ? "¿Todavía no tenés cuenta?"
            : "¿Ya tenés cuenta?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMessage("");
            }}
          >
            {mode === "login" ? "Registrate" : "Iniciá sesión"}
          </button>
        </p>
      </section>
    </main>
  );
}
