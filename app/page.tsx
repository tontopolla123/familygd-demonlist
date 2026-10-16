
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, CSSProperties } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Tab = "DEMONLIST" | "PLAYERS" | "RECORDS";

type Demon = {
  id: number;
  name: string;
  creator: string;
  verifier: string;
  difficulty: string;
  color: string;
  icon: string;
  points: number;
  song: string;
  videoUrl: string;
  thumbnailUrl: string | null;
};

type PlayerRecord = {
  id: number;
  userId: string;
  player: string;
  level: string;
  levelId: number;
  videoUrl: string;
  approved: boolean;
  points: number;
};

type Player = {
  id: string;
  name: string;
  points: number;
};

type Submission = {
  id: number;
  user_id: string;
  submitted_name: string;
  video_url: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  points: number;
};

type DbLevel = {
  id: number;
  name: string;
  difficulty: string | null;
  thumbnail_url: string | null;
  position: number | null;
};

type DbRecord = {
  id: number;
  user_id: string;
  level_id: number;
  submission_id: number;
  points: number;
};

type DbProfile = {
  id: string;
  username: string;
};

type DbSubmission = {
  id: number;
  user_id: string;
  level_id: number | null;
  submitted_name: string;
  video_url: string | null;
  status: string;
};

function normalizeDifficulty(value: string | null | undefined): string {
  const normalized = (value ?? "Unknown").trim().toLowerCase();

  if (normalized.includes("extreme")) return "Extreme Demon";
  if (normalized.includes("insane")) return "Insane Demon";
  if (normalized.includes("hard")) return "Hard Demon";
  if (normalized.includes("medium")) return "Medium Demon";
  if (normalized.includes("easy")) return "Easy Demon";

  return value?.trim() || "Unknown";
}

function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();

    const isYouTube =
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be" ||
      host === "www.youtu.be";

    if (url.protocol !== "https:" || !isYouTube) return false;

    if (host.includes("youtube.com")) {
      return (
        (url.pathname === "/watch" && Boolean(url.searchParams.get("v"))) ||
        /^\/shorts\/[^/]+/.test(url.pathname) ||
        /^\/embed\/[^/]+/.test(url.pathname)
      );
    }

    return /^\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);

  const [activeTab, setActiveTab] = useState<Tab>("DEMONLIST");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("All");

  const [demons, setDemons] = useState<Demon[]>([]);
  const [records, setRecords] = useState<PlayerRecord[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  const [recordLevel, setRecordLevel] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profileUsername, setProfileUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState("");

  // Cargar niveles, registros aprobados y nombres públicos de jugadores.
  const loadPublicData = useCallback(async () => {
    setDataLoading(true);
    setDataError("");

    try {
      const [
        { data: levelRows, error: levelsError },
        { data: recordRows, error: recordsError },
        { data: profileRows, error: profilesError },
        { data: submissionRows, error: submissionsError },
      ] = await Promise.all([
        supabase
          .from("levels")
          .select("id, name, difficulty, thumbnail_url, position")
          .order("position", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true }),

        supabase
          .from("records")
          .select("id, user_id, level_id, submission_id, points"),

        supabase
          .from("public_player_profiles")
          .select("id, username"),

        supabase
          .from("level_submissions")
          .select("id, user_id, level_id, submitted_name, video_url, status")
          .eq("status", "approved"),
      ]);

      if (levelsError) throw levelsError;
      if (recordsError) throw recordsError;
      if (profilesError) throw profilesError;
      if (submissionsError) throw submissionsError;

      const levels = (levelRows ?? []) as DbLevel[];
      const dbRecords = (recordRows ?? []) as DbRecord[];
      const profiles = (profileRows ?? []) as DbProfile[];
      const submissions = (submissionRows ?? []) as DbSubmission[];

      const profileMap = new Map(
        profiles.map((profile) => [profile.id, profile.username])
      );

      const levelMap = new Map(levels.map((level) => [level.id, level]));

      const submissionMap = new Map(
        submissions.map((submission) => [submission.id, submission])
      );

      // Algunos niveles todavía no tienen un récord aprobado.
      // Para esos niveles se usa 0 como puntaje hasta que se configure
      // un puntaje para el nivel en la base de datos.
      const pointsByLevel = new Map<number, number>();

      for (const record of dbRecords) {
        const previous = pointsByLevel.get(record.level_id) ?? 0;
        pointsByLevel.set(
          record.level_id,
          Math.max(previous, Number(record.points) || 0)
        );
      }

      const mappedDemons: Demon[] = levels.map((level) => ({
        id: level.id,
        name: level.name,
        creator: "No especificado",
        verifier: "No especificado",
        difficulty: normalizeDifficulty(level.difficulty),
        color: "#25252d",
        icon: "◆",
        points: pointsByLevel.get(level.id) ?? 0,
        song: "No especificada",
        videoUrl: "",
        thumbnailUrl: level.thumbnail_url,
      }));

      const mappedRecords: PlayerRecord[] = dbRecords.map((record) => {
        const level = levelMap.get(record.level_id);
        const submission = submissionMap.get(record.submission_id);

        return {
          id: record.id,
          userId: record.user_id,
          player:
            profileMap.get(record.user_id) ??
            `Jugador ${record.user_id.slice(0, 8)}`,
          level: level?.name ?? "Nivel desconocido",
          levelId: record.level_id,
          videoUrl: submission?.video_url ?? "",
          approved: true,
          points: Number(record.points) || 0,
        };
      });

      // El ranking se construye a partir de los puntos reales de records.
      // Así también aparecen los jugadores que todavía no tenían
      // una entrada en una lista local de jugadores.
      const pointsByPlayer = new Map<string, number>();

      for (const record of mappedRecords) {
        pointsByPlayer.set(
          record.userId,
          (pointsByPlayer.get(record.userId) ?? 0) + record.points
        );
      }

      const mappedPlayers: Player[] = Array.from(
        pointsByPlayer.entries()
      ).map(([id, points]) => ({
        id,
        name:
          profileMap.get(id) ??
          `Jugador ${id.slice(0, 8)}`,
        points,
      }));

      mappedPlayers.sort(
        (a, b) => b.points - a.points || a.name.localeCompare(b.name)
      );

      setDemons(mappedDemons);
      setRecords(mappedRecords);
      setPlayers(mappedPlayers);

      setSelectedLevel((current) => {
        if (current && mappedDemons.some((demon) => demon.name === current)) {
          return current;
        }

        return mappedDemons[0]?.name ?? "";
      });
    } catch (error) {
      console.error("Error al cargar la demonlist:", error);
      setDataError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los datos de la demonlist."
      );
    } finally {
      setDataLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadPublicData();
  }, [loadPublicData]);

  // Mantener actualizada la sesión.
  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setAuthUser(session?.user ?? null);
        setAuthLoading(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return;

        if (error) {
          console.error("Error al recuperar la sesión:", error);
        }

        setAuthUser(data.session?.user ?? null);
        setAuthLoading(false);
      })
      .catch((error) => {
        console.error("Error al comprobar la sesión:", error);
        if (mounted) setAuthLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Cargar nombre y rol de la cuenta conectada.
  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      if (!authUser) {
        setProfileUsername("");
        setIsAdmin(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("username, role")
        .eq("id", authUser.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error("Error al cargar el perfil:", error);
        setProfileUsername("");
        setIsAdmin(false);
        return;
      }

      setProfileUsername(data?.username ?? "");
      setIsAdmin(data?.role === "admin");
    }

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [authUser, supabase]);

  // Historial de solicitudes y puntos del usuario conectado.
  const loadMySubmissions = useCallback(async () => {
    if (!authUser) {
      setMySubmissions([]);
      setSubmissionsError("");
      return;
    }

    setSubmissionsLoading(true);
    setSubmissionsError("");

    try {
      const { data, error } = await supabase
        .from("level_submissions")
        .select(
          "id, user_id, submitted_name, video_url, status, admin_note, created_at"
        )
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { data: recordRows, error: recordsError } = await supabase
        .from("records")
        .select("submission_id, points")
        .eq("user_id", authUser.id);

      if (recordsError) throw recordsError;

      const pointsBySubmission = new Map(
        (recordRows ?? []).map((record) => [
          record.submission_id,
          record.points,
        ])
      );

      setMySubmissions(
        (data ?? []).map((submission) => ({
          ...submission,
          status: submission.status as Submission["status"],
          points: pointsBySubmission.get(submission.id) ?? 0,
        }))
      );
    } catch (error) {
      console.error("Error al cargar los envíos:", error);
      setSubmissionsError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar tus envíos."
      );
    } finally {
      setSubmissionsLoading(false);
    }
  }, [authUser, supabase]);

  useEffect(() => {
    if (activeTab === "RECORDS" && authUser) {
      void loadMySubmissions();
    }
  }, [activeTab, authUser, loadMySubmissions]);

  async function handleLogout() {
    setLoggingOut(true);

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Error al cerrar sesión:", error);
      setFormMessage("No se pudo cerrar la sesión: " + error.message);
      setLoggingOut(false);
      return;
    }

    setMySubmissions([]);
    setActiveTab("DEMONLIST");
    window.location.assign("/");
  }

  const selectedDemon =
    demons.find((demon) => demon.name === selectedLevel) ?? null;

  const filteredDemons = useMemo(() => {
    const query = search.toLowerCase().trim();

    return demons.filter((demon) => {
      const matchesSearch =
        demon.name.toLowerCase().includes(query) ||
        demon.creator.toLowerCase().includes(query);

      const matchesDifficulty =
        difficulty === "All" || demon.difficulty === difficulty;

      return matchesSearch && matchesDifficulty;
    });
  }, [demons, search, difficulty]);

  const levelRecords = useMemo(
    () =>
      selectedDemon
        ? records.filter((record) => record.levelId === selectedDemon.id)
        : [],
    [records, selectedDemon]
  );

  const leaderboard = players;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage("");

    const level = recordLevel.trim();
    const proofUrl = videoUrl.trim();

    if (!level) {
      setFormMessage("Escribí el nombre del nivel.");
      return;
    }

    if (!proofUrl) {
      setFormMessage("Pegá el enlace del video de YouTube.");
      return;
    }

    if (!isYouTubeUrl(proofUrl)) {
      setFormMessage("El enlace no parece válido. Usá un link de YouTube.");
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setFormMessage(
          "No se detectó una sesión activa. Iniciá sesión nuevamente."
        );
        return;
      }

      const { error: insertError } = await supabase
        .from("level_submissions")
        .insert({
          user_id: user.id,
          submitted_name: level,
          video_url: proofUrl,
          level_id: null,
          status: "pending",
          reviewed_by: null,
          reviewed_at: null,
        });

      if (insertError) {
        console.error("Error al guardar el envío:", insertError);

        if (insertError.code === "23503") {
          setFormMessage(
            "Tu perfil no está vinculado correctamente. Revisá la tabla profiles."
          );
        } else if (insertError.code === "42501") {
          setFormMessage(
            "Supabase rechazó el envío por permisos. Revisá las políticas RLS."
          );
        } else {
          setFormMessage(`No se pudo guardar el envío: ${insertError.message}`);
        }

        return;
      }

      setFormMessage(
        "¡Envío guardado! Tu récord quedó pendiente de revisión. Todavía no otorga puntos."
      );

      setRecordLevel("");
      setVideoUrl("");

      await loadMySubmissions();
    } catch (error) {
      console.error("Error inesperado al enviar el récord:", error);
      setFormMessage(
        "Ocurrió un error inesperado. Revisá tu conexión e intentá nuevamente."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const displayUsername =
    profileUsername || authUser?.email?.split("@")[0] || "Jugador";

  return (
    <main className="site-shell">
      <header className="topbar">
        <button
          className="brand brand-button"
          onClick={() => setActiveTab("DEMONLIST")}
          aria-label="Ir a Demonlist"
        >
          <span className="brand-cube">
            <span />
          </span>
          <span className="brand-name">
            FAMILIA GD
            <span>DEMON LIST</span>
          </span>
        </button>

        <nav className="main-nav" aria-label="Navegación principal">
          <button
            className={`nav-link ${activeTab === "DEMONLIST" ? "active" : ""}`}
            onClick={() => setActiveTab("DEMONLIST")}
          >
            DEMONLIST
          </button>
          <button
            className={`nav-link ${activeTab === "PLAYERS" ? "active" : ""}`}
            onClick={() => setActiveTab("PLAYERS")}
          >
            PLAYER LEADERBOARD
          </button>
          <button
            className={`nav-link ${activeTab === "RECORDS" ? "active" : ""}`}
            onClick={() => setActiveTab("RECORDS")}
          >
            RECORDS
          </button>
        </nav>

        <div className="account-nav">
          {authLoading ? (
            <span className="login-nav-button">Cargando cuenta...</span>
          ) : authUser ? (
            <>
              <span className="account-username">{displayUsername}</span>
              {isAdmin && (
                <a href="/admin" className="login-nav-button">
                  ADMIN
                </a>
              )}
              <button
                type="button"
                className="login-nav-button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
              >
                {loggingOut ? "Saliendo..." : "Cerrar sesión"}
              </button>
            </>
          ) : (
            <a href="/login" className="login-nav-button">
              Iniciar sesión
            </a>
          )}
        </div>
      </header>

      <section className="page-intro">
        <div className="eyebrow">
          <span />
          FAMILIA GD
        </div>

        <h1>
          {activeTab === "DEMONLIST" && <>FAMILIA<span>list.</span></>}
          {activeTab === "PLAYERS" && <>Player <span>Leaderboard.</span></>}
          {activeTab === "RECORDS" && <>Submit a <span>record.</span></>}
        </h1>

        <p>
          {activeTab === "DEMONLIST" &&
            "Explorá los niveles, consultá sus puntos y revisá los récords registrados."}
          {activeTab === "PLAYERS" &&
            "Los jugadores se ordenan por el puntaje de sus completados aprobados."}
          {activeTab === "RECORDS" &&
            "Enviá tu prueba y consultá el estado de tus récords."}
        </p>
      </section>

      {dataError && (
        <section className="content-panel" role="alert">
          <strong>No se pudieron cargar los datos de Supabase.</strong>
          <p>{dataError}</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => void loadPublicData()}
          >
            REINTENTAR
          </button>
        </section>
      )}

      {activeTab === "DEMONLIST" && (
        <section className="workspace">
          <aside className="level-picker">
            <div className="panel-heading">
              <span>01</span> LEVEL RANKING
            </div>

            <label className="search-box">
              <span>⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nivel..."
              />
            </label>

            <select
              className="difficulty-select"
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
              aria-label="Filtrar por dificultad"
            >
              <option value="All">Todas las dificultades</option>
              <option value="Extreme Demon">Extreme Demon</option>
              <option value="Insane Demon">Insane Demon</option>
              <option value="Hard Demon">Hard Demon</option>
              <option value="Medium Demon">Medium Demon</option>
              <option value="Easy Demon">Easy Demon</option>
            </select>

            <div className="level-picker-list">
              {dataLoading ? (
                <div className="empty-state">
                  <strong>Cargando niveles...</strong>
                </div>
              ) : (
                filteredDemons.map((demon) => {
                  const rank = demons.findIndex(
                    (item) => item.id === demon.id
                  ) + 1;

                  return (
                    <button
                      key={demon.id}
                      className={`level-picker-item ${
                        selectedLevel === demon.name ? "selected" : ""
                      }`}
                      onClick={() => setSelectedLevel(demon.name)}
                    >
                      <span className="picker-rank">
                        {String(rank).padStart(2, "0")}
                      </span>

                      <span
                        className="picker-thumbnail"
                        style={
                          {
                            "--thumb": demon.color,
                            overflow: "hidden",
                          } as CSSProperties
                        }
                      >
                        {demon.thumbnailUrl ? (
                          <img
                            src={demon.thumbnailUrl}
                            alt={`Miniatura de ${demon.name}`}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          demon.icon
                        )}
                      </span>

                      <span className="picker-level-info">
                        <strong>{demon.name}</strong>
                        <small>{demon.difficulty.toUpperCase()}</small>
                      </span>
                      <span className="picker-arrow">›</span>
                    </button>
                  );
                })
              )}

              {!dataLoading && filteredDemons.length === 0 && !dataError && (
                <div className="empty-state">
                  <strong>Todavía no hay niveles.</strong>
                  <p>
                    Los niveles aprobados aparecerán acá automáticamente.
                  </p>
                </div>
              )}
            </div>

            <div className="picker-footer">
              {filteredDemons.length} DE {demons.length} NIVELES
            </div>
          </aside>

          <section className="level-detail">
            <div className="panel-heading">
              <span>02</span> LEVEL INFORMATION
            </div>

            {selectedDemon ? (
              <>
                <div
                  className="level-banner"
                  style={
                    {
                      "--thumb": selectedDemon.color,
                      backgroundImage: selectedDemon.thumbnailUrl
                        ? `linear-gradient(rgba(10,10,16,.25), rgba(10,10,16,.8)), url("${selectedDemon.thumbnailUrl}")`
                        : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    } as CSSProperties
                  }
                >
                  <div className="banner-grid" />
                  <div className="banner-rank">
                    RANK #
                    {String(
                      demons.findIndex(
                        (demon) => demon.id === selectedDemon.id
                      ) + 1
                    ).padStart(2, "0")}
                  </div>
                  <div className="banner-symbol">
                    {!selectedDemon.thumbnailUrl && selectedDemon.icon}
                  </div>
                  <div className="banner-caption">
                    {selectedDemon.difficulty.toUpperCase()}
                  </div>
                </div>

                <div className="level-title-block">
                  <h2>{selectedDemon.name}</h2>
                  <p>Created by {selectedDemon.creator}</p>
                </div>

                <div className="level-points-card">
                  <div>
                    <small>LIST POINTS</small>
                    <strong>
                      {selectedDemon.points.toLocaleString("es-AR")}
                    </strong>
                  </div>
                  <span>PTS</span>
                </div>

                <div className="level-info-list">
                  <div className="level-info-row">
                    <span>Dificultad</span>
                    <strong>{selectedDemon.difficulty}</strong>
                  </div>
                  <div className="level-info-row">
                    <span>Creador</span>
                    <strong>{selectedDemon.creator}</strong>
                  </div>
                  <div className="level-info-row">
                    <span>Verificador registrado</span>
                    <strong>{selectedDemon.verifier}</strong>
                  </div>
                  <div className="level-info-row">
                    <span>Canción</span>
                    <strong>{selectedDemon.song}</strong>
                  </div>
                </div>

                {selectedDemon.videoUrl ? (
                  <a
                    className="level-video-link"
                    href={selectedDemon.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    VER VIDEO DEL NIVEL ↗
                  </a>
                ) : (
                  <div className="level-video-placeholder">
                    <span>▶</span>
                    <div>
                      <strong>Video no disponible</strong>
                      <small>Podemos agregar el enlace cuando lo tengamos.</small>
                    </div>
                  </div>
                )}

                <button
                  className="primary-button full-button"
                  onClick={() => {
                    setRecordLevel(selectedDemon.name);
                    setFormMessage("");
                    setActiveTab("RECORDS");
                  }}
                >
                  ENVIAR RÉCORD DE ESTE NIVEL <span>↗</span>
                </button>
              </>
            ) : (
              <div className="records-empty">
                <span>◇</span>
                <strong>
                  {dataLoading
                    ? "Cargando niveles..."
                    : "No hay ningún nivel seleccionado"}
                </strong>
                <p>
                  {dataLoading
                    ? "Estamos consultando la base de datos."
                    : "Los niveles se agregan desde el panel de administración."}
                </p>
                {!dataLoading && (
                  <button
                    type="button"
                    className="level-video-link"
                    onClick={() => void loadPublicData()}
                  >
                    ACTUALIZAR LISTA ↻
                  </button>
                )}
              </div>
            )}
          </section>

          <aside className="level-records">
            <div className="panel-heading">
              <span>03</span> LEVEL RECORDS
            </div>
            <div className="records-level-heading">
              <strong>{selectedDemon?.name ?? "Sin nivel seleccionado"}</strong>
              <span>{levelRecords.length} récords</span>
            </div>

            {levelRecords.length > 0 ? (
              <div className="level-record-list">
                {levelRecords.map((record) => (
                  <div className="level-record-item" key={record.id}>
                    <span className="record-avatar">
                      {record.player.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="level-record-player">
                      <strong>{record.player}</strong>
                      <small>RÉCORD APROBADO · {record.points} PTS</small>
                    </div>

                    {record.videoUrl ? (
                      <a
                        className="record-percent"
                        href={record.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Ver prueba de ${record.player}`}
                      >
                        100 % ↗
                      </a>
                    ) : (
                      <span className="record-percent">100 %</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="records-empty">
                <span>◇</span>
                <strong>Sin récords registrados</strong>
                <p>Todavía no hay récords aprobados para este nivel.</p>
              </div>
            )}

            <div className="records-legend">
              <span className="live-dot" />
              Los récords pendientes no suman puntos.
            </div>
          </aside>
        </section>
      )}

      {activeTab === "PLAYERS" && (
        <section className="content-panel">
          <div className="panel-heading">
            <span>01</span> PLAYER RANKING
          </div>

          <div className="leaderboard-table">
            <div className="leaderboard-header">
              <span>RANK</span>
              <span>PLAYER</span>
              <span>APPROVED COMPLETIONS</span>
              <span>POINTS</span>
            </div>

            {leaderboard.map((player, index) => {
              const completions = records.filter(
                (record) =>
                  record.userId === player.id && record.approved
              ).length;

              return (
                <div className="leaderboard-row" key={player.id}>
                  <span
                    className={`leaderboard-rank ${
                      index < 3 ? "top-rank" : ""
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="leaderboard-player">
                    <span className="record-avatar">
                      {player.name.slice(0, 1).toUpperCase()}
                    </span>
                    <strong>{player.name}</strong>
                  </div>
                  <span className="leaderboard-completions">
                    {completions}
                  </span>
                  <strong className="leaderboard-points">
                    {player.points.toLocaleString("es-AR")}
                    <small> PTS</small>
                  </strong>
                </div>
              );
            })}
          </div>

          {!dataLoading && leaderboard.length === 0 && !dataError && (
            <div className="records-empty">
              <span>◇</span>
              <strong>Todavía no hay jugadores en el ranking</strong>
              <p>
                Los jugadores aparecerán cuando tengan récords aprobados
                con puntos asignados.
              </p>
            </div>
          )}

          {dataLoading && (
            <div className="records-empty">
              <strong>Cargando ranking...</strong>
            </div>
          )}

          <button
            type="button"
            className="level-video-link"
            onClick={() => void loadPublicData()}
            disabled={dataLoading}
          >
            ↻ ACTUALIZAR RANKING
          </button>
        </section>
      )}

      {activeTab === "RECORDS" && (
        <section className="record-submission-layout">
          <div className="content-panel record-form-panel">
            <div className="panel-heading">
              <span>01</span> SUBMIT A RECORD
            </div>

            <form className="record-form" onSubmit={handleSubmit}>
              <label>
                <span>Nivel completado</span>
                <input
                  type="text"
                  value={recordLevel}
                  onChange={(event) => setRecordLevel(event.target.value)}
                  placeholder="Escribí el nombre del nivel"
                  maxLength={100}
                  required
                />
              </label>

              <label>
                <span>Video de prueba (YouTube)</span>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  maxLength={500}
                  required
                />
                <small>
                  Pegá el enlace del video que demuestra el 100 %.
                </small>
              </label>

              <div className="level-info-row">
                <span>Porcentaje requerido</span>
                <strong>100 %</strong>
              </div>

              <p className="form-explanation">
                Tu cuenta identifica al jugador automáticamente. El envío
                quedará pendiente de revisión y no otorgará puntos hasta ser
                aprobado.
              </p>

              {formMessage && (
                <p className="form-message" role="status">
                  {formMessage}
                </p>
              )}

              <button
                className="primary-button full-button"
                type="submit"
                disabled={submitting || authLoading || !authUser}
              >
                {submitting
                  ? "ENVIANDO..."
                  : !authUser
                    ? "INICIÁ SESIÓN PARA ENVIAR"
                    : "ENVIAR RÉCORD"}
                <span>↗</span>
              </button>

              {!authLoading && !authUser && (
                <a href="/login" className="level-video-link">
                  INICIAR SESIÓN ↗
                </a>
              )}
            </form>
          </div>

          <aside className="content-panel submission-info">
            <div className="panel-heading">
              <span>02</span> MIS RÉCORDS
            </div>

            {isAdmin && (
              <a
                href="/admin"
                className="primary-button full-button"
                style={{
                  display: "flex",
                  marginBottom: "20px",
                  textDecoration: "none",
                }}
              >
                REVISAR SOLICITUDES <span>↗</span>
              </a>
            )}

            {authLoading && (
              <div className="records-empty">
                <strong>Comprobando sesión...</strong>
              </div>
            )}

            {!authLoading && !authUser && (
              <div className="records-empty">
                <span>◇</span>
                <strong>Iniciá sesión para ver tus récords</strong>
                <p>Tus envíos quedan vinculados a tu cuenta.</p>
                <a href="/login" className="level-video-link">
                  INICIAR SESIÓN ↗
                </a>
              </div>
            )}

            {authUser && submissionsLoading && (
              <div className="records-empty">
                <strong>Cargando tus envíos...</strong>
              </div>
            )}

            {authUser && submissionsError && (
              <div className="records-empty">
                <strong>No se pudo cargar el historial</strong>
                <p>{submissionsError}</p>
                <button
                  type="button"
                  className="level-video-link"
                  onClick={() => void loadMySubmissions()}
                >
                  REINTENTAR
                </button>
              </div>
            )}

            {authUser &&
              !submissionsLoading &&
              !submissionsError &&
              mySubmissions.length === 0 && (
                <div className="records-empty">
                  <span>◇</span>
                  <strong>Todavía no enviaste récords</strong>
                  <p>
                    Cuando mandes una prueba, aparecerá acá con su estado.
                  </p>
                </div>
              )}

            {authUser && mySubmissions.length > 0 && (
              <div className="my-submissions-list">
                {mySubmissions.map((submission) => (
                  <article
                    key={submission.id}
                    className="my-submission-item"
                  >
                    <div className="my-submission-header">
                      <strong>{submission.submitted_name}</strong>
                      <span
                        className={`submission-status status-${submission.status}`}
                      >
                        {submission.status === "pending"
                          ? "PENDIENTE"
                          : submission.status === "approved"
                            ? "APROBADO"
                            : "RECHAZADO"}
                      </span>
                    </div>

                    <p className="my-submission-date">
                      Enviado el{" "}
                      {new Date(submission.created_at).toLocaleDateString(
                        "es-AR"
                      )}
                    </p>

                    {submission.status === "approved" && (
                      <p className="my-submission-points">
                        {submission.points} puntos obtenidos
                      </p>
                    )}

                    {submission.admin_note && (
                      <p className="my-submission-note">
                        Nota del administrador: {submission.admin_note}
                      </p>
                    )}

                    {submission.video_url && (
                      <a
                        href={submission.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="level-video-link"
                      >
                        VER MI PRUEBA ↗
                      </a>
                    )}
                  </article>
                ))}
              </div>
            )}

            <button
              type="button"
              className="level-video-link"
              onClick={() => void loadMySubmissions()}
              disabled={submissionsLoading || !authUser}
            >
              ↻ ACTUALIZAR HISTORIAL
            </button>
          </aside>
        </section>
      )}

      <footer className="site-footer">
        <span className="footer-brand">
          FAMILIA GD DEMON LIST
          <span>COMMUNITY PROJECT</span>
        </span>
        <span>MADE BY PLAYERS, FOR PLAYERS.</span>
        <span>NOT AFFILIATED WITH ROBTOP GAMES.</span>
      </footer>
    </main>
  );
}
