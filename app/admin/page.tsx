
"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";

type Submission = {
  id: number;
  user_id: string;
  submitted_name: string;
  video_url: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  username: string;
};

type Level = {
  id: number;
  name: string;
  difficulty: string | null;
  thumbnail_url: string | null;
  position: number | null;
};

type ReviewOptions = {
  difficulty: string;
  points: string;
  note: string;
};

const difficulties = [
  "Easy Demon",
  "Medium Demon",
  "Hard Demon",
  "Insane Demon",
  "Extreme Demon",
  "Unknown",
];

export default function AdminPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [options, setOptions] = useState<Record<number, ReviewOptions>>({});
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);
  const [uploadingLevelId, setUploadingLevelId] = useState<number | null>(
    null
  );
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const supabase = useMemo(() => createClient(), []);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        setAuthorized(false);
        setErrorMessage(
          "Tenés que iniciar sesión con una cuenta administradora."
        );
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (profileError) {
        setErrorMessage(
          "No se pudo comprobar tu rol: " + profileError.message
        );
        setAuthorized(false);
        return;
      }

      if (profile?.role !== "admin") {
        setAuthorized(false);
        setErrorMessage(
          "Acceso denegado. Tu cuenta no tiene permisos de administrador."
        );
        return;
      }

      setAuthorized(true);

      // Cargar los niveles existentes para gestionar sus miniaturas.
      const { data: levelRows, error: levelsError } = await supabase
        .from("levels")
        .select("id, name, difficulty, thumbnail_url, position")
        .order("position", { ascending: true });

      if (levelsError) {
        setErrorMessage(
          "No se pudieron cargar los niveles: " + levelsError.message
        );
      } else {
        setLevels((levelRows ?? []) as Level[]);
      }

      const { data: rows, error: submissionsError } = await supabase
        .from("level_submissions")
        .select(
          "id, user_id, submitted_name, video_url, status, admin_note, created_at"
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (submissionsError) {
        setErrorMessage(
          "No se pudieron cargar los envíos: " + submissionsError.message
        );
        return;
      }

      const pendingRows = rows ?? [];

      if (pendingRows.length === 0) {
        setSubmissions([]);
        return;
      }

      const userIds = [...new Set(pendingRows.map((row) => row.user_id))];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds);

      if (profilesError) {
        setErrorMessage(
          "No se pudieron cargar los nombres de usuario: " +
            profilesError.message
        );
        return;
      }

      const usernameById = new Map(
        (profiles ?? []).map((profile) => [profile.id, profile.username])
      );

      setSubmissions(
        pendingRows.map((row) => ({
          ...row,
          username: usernameById.get(row.user_id) ?? "Usuario desconocido",
        }))
      );
    } catch {
      setErrorMessage("Ocurrió un error inesperado al cargar el panel.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  async function uploadThumbnail(level: Level, file: File) {
    setMessage("");
    setErrorMessage("");

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Seleccioná un archivo de imagen válido.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("La imagen no puede superar los 5 MB.");
      return;
    }

    setUploadingLevelId(level.id);

    try {
      // Comprobar nuevamente la sesión y el rol antes de subir.
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        throw new Error("Tu sesión expiró. Volvé a iniciar sesión.");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (profileError || profile?.role !== "admin") {
        throw new Error("No tenés permisos para cambiar miniaturas.");
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${level.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("level-thumbnails")
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error("No se pudo subir la imagen: " + uploadError.message);
      }

      const { data: publicData } = supabase.storage
        .from("level-thumbnails")
        .getPublicUrl(path);

      const imageUrl = publicData.publicUrl;

      const { error: updateError } = await supabase
        .from("levels")
        .update({ thumbnail_url: imageUrl })
        .eq("id", level.id);

      if (updateError) {
        throw new Error(
          "La imagen se subió, pero no se pudo guardar en el nivel: " +
            updateError.message
        );
      }

      setLevels((current) =>
        current.map((item) =>
          item.id === level.id
            ? { ...item, thumbnail_url: imageUrl }
            : item
        )
      );

      setMessage(`Miniatura de "${level.name}" actualizada correctamente.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Ocurrió un error al subir la miniatura."
      );
    } finally {
      setUploadingLevelId(null);
    }
  }

  function handleThumbnailChange(
    event: ChangeEvent<HTMLInputElement>,
    level: Level
  ) {
    const file = event.target.files?.[0];

    // Permite volver a seleccionar el mismo archivo si hace falta.
    event.target.value = "";

    if (file) {
      void uploadThumbnail(level, file);
    }
  }

  function getOptions(id: number): ReviewOptions {
    return (
      options[id] ?? {
        difficulty: "Easy Demon",
        points: "1",
        note: "",
      }
    );
  }

  function updateOptions(
    id: number,
    field: keyof ReviewOptions,
    value: string
  ) {
    setOptions((current) => ({
      ...current,
      [id]: {
        ...getOptions(id),
        [field]: value,
      },
    }));
  }

  async function reviewSubmission(
    submission: Submission,
    action: "approve" | "reject"
  ) {
    const current = getOptions(submission.id);

    if (
      action === "approve" &&
      (!Number.isInteger(Number(current.points)) ||
        Number(current.points) < 0)
    ) {
      setErrorMessage("Los puntos deben ser un número entero no negativo.");
      return;
    }

    const confirmation =
      action === "approve"
        ? `¿Aprobar ${submission.submitted_name} y registrar el récord de ${submission.username} con ${current.points} puntos?`
        : `¿Rechazar el envío de ${submission.submitted_name}?`;

    if (!window.confirm(confirmation)) return;

    setProcessing(submission.id);
    setMessage("");
    setErrorMessage("");

    try {
      const { error } = await supabase.rpc("review_level_submission", {
        p_submission_id: submission.id,
        p_action: action,
        p_difficulty: current.difficulty,
        p_points: Number(current.points),
        p_admin_note: current.note.trim() || null,
      });

      if (error) {
        setErrorMessage("No se pudo revisar el envío: " + error.message);
        return;
      }

      setMessage(
        action === "approve"
          ? `Se aprobó ${submission.submitted_name} y se registró el récord.`
          : `Se rechazó el envío de ${submission.submitted_name}.`
      );

      setSubmissions((current) =>
        current.filter((item) => item.id !== submission.id)
      );

      setOptions((current) => {
        const next = { ...current };
        delete next[submission.id];
        return next;
      });

      // Actualizar niveles por si la aprobación agregó uno nuevo.
      const { data: refreshedLevels, error: refreshError } = await supabase
        .from("levels")
        .select("id, name, difficulty, thumbnail_url, position")
        .order("position", { ascending: true });

      if (!refreshError && refreshedLevels) {
        setLevels(refreshedLevels as Level[]);
      }
    } catch {
      setErrorMessage("Ocurrió un error inesperado al revisar el envío.");
    } finally {
      setProcessing(null);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white outline-none transition focus:border-red-500";

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-red-500">
              Familia GD Demon List
            </p>
            <h1 className="text-3xl font-black sm:text-4xl">
              Panel de administración
            </h1>
            <p className="mt-2 text-sm text-white/50">
              Revisá las pruebas, administrá los récords y cambiá las miniaturas.
            </p>
          </div>

          <a
            href="/"
            className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold transition hover:border-red-500 hover:bg-red-500/10"
          >
            ← Volver a la lista
          </a>
        </header>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#101010] p-5">
            <p className="text-sm text-white/50">Envíos pendientes</p>
            <p className="mt-2 text-3xl font-black">
              {loading ? "…" : submissions.length}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#101010] p-5">
            <p className="text-sm text-white/50">Acceso</p>
            <p className="mt-2 text-xl font-bold">
              {loading
                ? "Verificando…"
                : authorized
                  ? "Administrador"
                  : "Sin acceso"}
            </p>
          </div>

          <div className="flex items-center rounded-xl border border-white/10 bg-[#101010] p-5">
            <button
              type="button"
              onClick={() => void loadSubmissions()}
              disabled={loading || processing !== null || uploadingLevelId !== null}
              className="w-full rounded-lg border border-white/10 px-4 py-3 text-sm font-bold transition hover:border-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↻ Actualizar panel
            </button>
          </div>
        </div>

        {message && (
          <div
            role="status"
            className="mb-5 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300"
          >
            {message}
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {errorMessage}
          </div>
        )}

        {!loading && authorized && (
          <section className="mb-10">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-500">
                Biblioteca de niveles
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Miniaturas de la demonlist
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/50">
                Elegí una imagen para cada nivel. Se guardará en Supabase y
                quedará asociada al nivel para poder mostrarla en la lista.
                Tamaño máximo: 5 MB por imagen.
              </p>
            </div>

            {levels.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-[#101010] p-8 text-center">
                <h3 className="font-bold">Todavía no hay niveles</h3>
                <p className="mt-2 text-sm text-white/50">
                  Los niveles aparecerán acá cuando existan registros en la
                  tabla levels.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {levels.map((level) => {
                  const uploading = uploadingLevelId === level.id;

                  return (
                    <article
                      key={level.id}
                      className="overflow-hidden rounded-xl border border-white/10 bg-[#101010]"
                    >
                      <div className="aspect-video w-full overflow-hidden bg-[#181818]">
                        {level.thumbnail_url ? (
                          <img
                            src={level.thumbnail_url}
                            alt={`Miniatura de ${level.name}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/30">
                            <span className="text-4xl">▧</span>
                            <span className="text-sm">Sin miniatura</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4 p-4">
                        <div>
                          <h3 className="break-words text-lg font-black">
                            {level.name}
                          </h3>
                          <p className="mt-1 text-xs text-white/40">
                            {level.difficulty ?? "Dificultad sin definir"}
                          </p>
                        </div>

                        <label className="block cursor-pointer">
                          <span className="mb-2 block text-sm font-semibold text-white/70">
                            {uploading
                              ? "Subiendo imagen…"
                              : level.thumbnail_url
                                ? "Cambiar miniatura"
                                : "Subir miniatura"}
                          </span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            disabled={uploadingLevelId !== null}
                            onChange={(event) =>
                              handleThumbnailChange(event, level)
                            }
                            className="block w-full cursor-pointer rounded-lg border border-white/10 bg-[#080808] p-2 text-xs text-white/60 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-red-600 file:px-3 file:py-2 file:font-bold file:text-white hover:file:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </label>

                        {uploading && (
                          <p className="text-xs text-yellow-400">
                            Guardando miniatura. No cierres esta página.
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section>
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-500">
              Moderación
            </p>
            <h2 className="mt-2 text-2xl font-black">
              Récords pendientes
            </h2>
          </div>

          {loading ? (
            <div className="rounded-xl border border-white/10 bg-[#101010] p-10 text-center text-white/50">
              Cargando envíos…
            </div>
          ) : !authorized ? (
            <div className="rounded-xl border border-white/10 bg-[#101010] p-8 text-center">
              <h2 className="text-xl font-bold">Acceso restringido</h2>
              <p className="mt-2 text-sm text-white/50">
                Iniciá sesión con tu cuenta de administrador y volvé a cargar la
                página.
              </p>
              <a
                href="/login"
                className="mt-5 inline-block rounded-lg bg-red-600 px-5 py-3 text-sm font-bold transition hover:bg-red-500"
              >
                Ir al inicio de sesión
              </a>
            </div>
          ) : submissions.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#101010] p-10 text-center">
              <div className="text-4xl">✓</div>
              <h2 className="mt-4 text-xl font-bold">
                No hay envíos pendientes
              </h2>
              <p className="mt-2 text-sm text-white/50">
                Cuando alguien envíe un récord, aparecerá acá para su revisión.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {submissions.map((submission) => {
                const current = getOptions(submission.id);
                const busy = processing === submission.id;

                return (
                  <article
                    key={submission.id}
                    className="overflow-hidden rounded-xl border border-white/10 bg-[#101010]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 p-5">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs font-bold text-yellow-400">
                            PENDIENTE
                          </span>
                          <span className="text-xs text-white/40">
                            Envío #{submission.id}
                          </span>
                        </div>

                        <h3 className="text-2xl font-black">
                          {submission.submitted_name}
                        </h3>

                        <p className="mt-1 text-sm text-white/50">
                          Jugador:{" "}
                          <span className="font-semibold text-white/80">
                            {submission.username}
                          </span>
                        </p>

                        <p className="mt-1 text-xs text-white/40">
                          {new Date(submission.created_at).toLocaleString(
                            "es-AR"
                          )}
                        </p>
                      </div>

                      {submission.video_url && (
                        <a
                          href={submission.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg bg-red-600 px-4 py-3 text-sm font-bold transition hover:bg-red-500"
                        >
                          ▶ Ver prueba
                        </a>
                      )}
                    </div>

                    <div className="grid gap-4 p-5 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="mb-2 block font-semibold text-white/70">
                          Dificultad del nivel
                        </span>
                        <select
                          value={current.difficulty}
                          onChange={(event) =>
                            updateOptions(
                              submission.id,
                              "difficulty",
                              event.target.value
                            )
                          }
                          disabled={busy}
                          className={inputClass}
                        >
                          {difficulties.map((difficulty) => (
                            <option key={difficulty} value={difficulty}>
                              {difficulty}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-sm">
                        <span className="mb-2 block font-semibold text-white/70">
                          Puntos del récord
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={current.points}
                          onChange={(event) =>
                            updateOptions(
                              submission.id,
                              "points",
                              event.target.value
                            )
                          }
                          disabled={busy}
                          className={inputClass}
                        />
                      </label>

                      <label className="block text-sm sm:col-span-2">
                        <span className="mb-2 block font-semibold text-white/70">
                          Nota del administrador (opcional)
                        </span>
                        <textarea
                          rows={2}
                          value={current.note}
                          onChange={(event) =>
                            updateOptions(
                              submission.id,
                              "note",
                              event.target.value
                            )
                          }
                          disabled={busy}
                          placeholder="Motivo del rechazo o comentario sobre la revisión…"
                          className={inputClass}
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-3 border-t border-white/10 p-5">
                      <button
                        type="button"
                        onClick={() =>
                          void reviewSubmission(submission, "approve")
                        }
                        disabled={busy || processing !== null}
                        className="rounded-lg bg-green-600 px-5 py-3 text-sm font-bold transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busy ? "Procesando…" : "✓ Aprobar récord"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void reviewSubmission(submission, "reject")
                        }
                        disabled={busy || processing !== null}
                        className="rounded-lg border border-red-500/40 px-5 py-3 text-sm font-bold text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ✕ Rechazar envío
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="mt-10 border-t border-white/10 pt-5 text-center text-xs text-white/30">
          Familia GD Demon List · Administración
        </footer>
      </div>
    </main>
  );
}
