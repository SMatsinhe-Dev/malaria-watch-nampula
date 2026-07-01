import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  MapPin,
  Search,
  TrendingDown,
  TrendingUp,
  Upload,
  Building2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WebGIS Malária — Província de Nampula | Vigilância Epidemiológica" },
      {
        name: "description",
        content:
          "Plataforma WebGIS profissional para vigilância e análise espacial da malária nos distritos da província de Nampula, Moçambique.",
      },
      { property: "og:title", content: "WebGIS Malária — Nampula" },
      {
        property: "og:description",
        content:
          "Centro de monitorização epidemiológica da malária em Nampula — mapas, indicadores e análise de risco.",
      },

      {
        property: "og:description",
        content:
          "Developed by Nádia Carrimo & Stélio Matsinhe.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
      },
    ],
  }),
  component: Index,
});

type DistrictProps = { district: string; cases: number };
type Feature = {
  type: "Feature";
  properties: DistrictProps;
  geometry: GeoJSON.Geometry;
};
type FC = { type: "FeatureCollection"; features: Feature[] };

type RiskKey = "low" | "mid" | "high" | "vhigh";
type Risk = { label: string; color: string; key: RiskKey };

const RISK_COLORS: Record<RiskKey, string> = {
  low: "#22c55e",
  mid: "#eab308",
  high: "#f97316",
  vhigh: "#dc2626",
};

function riskOf(cases: number, max: number): Risk {
  // Quartile-based classification relative to provincial maximum
  const q = max / 4;
  if (cases < q) return { label: "Baixo", color: RISK_COLORS.low, key: "low" };
  if (cases < q * 2) return { label: "Moderado", color: RISK_COLORS.mid, key: "mid" };
  if (cases < q * 3) return { label: "Alto", color: RISK_COLORS.high, key: "high" };
  return { label: "Muito alto", color: RISK_COLORS.vhigh, key: "vhigh" };
}

type LayerRef = { layer: import("leaflet").Layer & { setStyle?: (s: object) => void }; props: DistrictProps };

function Index() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layersRef = useRef<Map<string, LayerRef>>(new Map());
  const LRef = useRef<typeof import("leaflet") | null>(null);

  const [data, setData] = useState<FC | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskKey>("all");

  useEffect(() => {
    fetch("/nampula.geojson")
      .then((r) => r.json())
      .then(setData);
  }, []);

  const maxCases = useMemo(() => {
    if (!data) return 1;
    return Math.max(...data.features.map((f) => f.properties.cases), 1);
  }, [data]);

  // Init map once
  useEffect(() => {
    if (!data || !mapEl.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, { zoomControl: true });
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      const layer = L.geoJSON(data as GeoJSON.FeatureCollection, {
        style: (f) => {
          const cases = (f?.properties as DistrictProps).cases;
          return {
            color: "#0f172a",
            weight: 1,
            fillColor: riskOf(cases, maxCases).color,
            fillOpacity: 0.75,
          };
        },
        onEachFeature: (f, lyr) => {
          const p = f.properties as DistrictProps;
          layersRef.current.set(p.district, { layer: lyr as LayerRef["layer"], props: p });
          lyr.on("click", () => setSelected(p.district));
          lyr.on("mouseover", () =>
            (lyr as import("leaflet").Path).setStyle({ weight: 2.5, color: "#000" })
          );
          lyr.on("mouseout", () =>
            (lyr as import("leaflet").Path).setStyle({ weight: 1, color: "#0f172a" })
          );
        },
      }).addTo(map);

      map.fitBounds(layer.getBounds(), { padding: [10, 10] });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current.clear();
    };
  }, [data, maxCases]);

  const stats = useMemo(() => {
    if (!data) return null;
    const items = data.features.map((f) => f.properties);
    const total = items.reduce((s, d) => s + d.cases, 0);
    const sorted = [...items].sort((a, b) => b.cases - a.cases);
    const counts: Record<RiskKey, number> = { low: 0, mid: 0, high: 0, vhigh: 0 };
    items.forEach((d) => counts[riskOf(d.cases, maxCases).key]++);
    return {
      total,
      sorted,
      worst: sorted[0],
      best: sorted[sorted.length - 1],
      avg: Math.round(total / items.length),
      counts,
      n: items.length,
    };
  }, [data, maxCases]);

  // Update popups when stats ready (depends on total)
  useEffect(() => {
    if (!stats) return;
    layersRef.current.forEach(({ layer, props }) => {
      const r = riskOf(props.cases, maxCases);
      const pct = ((props.cases / stats.total) * 100).toFixed(1);
      const rank = stats.sorted.findIndex((d) => d.district === props.district) + 1;
      (layer as unknown as { bindPopup: (s: string) => void }).bindPopup(
        `<div style="font-family:system-ui;min-width:220px">
          <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:6px">${props.district}</div>
          <div style="font-size:12px;color:#475569">Casos: <b style="color:#0f172a">${props.cases.toLocaleString("pt-PT")}</b></div>
          <div style="font-size:12px;color:#475569">% provincial: <b style="color:#0f172a">${pct}%</b></div>
          <div style="font-size:12px;color:#475569">Ranking: <b style="color:#0f172a">#${rank} de ${stats.n}</b></div>
          <div style="font-size:12px;display:flex;align-items:center;gap:6px;margin-top:6px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${r.color}"></span>
            <span style="color:#0f172a;font-weight:600">${r.label}</span>
          </div>
        </div>`
      );
    });
  }, [stats, maxCases]);

  // Focus on selected
  useEffect(() => {
    if (!selected) return;
    const ref = layersRef.current.get(selected);
    const map = mapRef.current;
    if (!ref || !map || !LRef.current) return;
    const lyr = ref.layer as unknown as {
      getBounds?: () => import("leaflet").LatLngBounds;
      openPopup?: () => void;
      setStyle?: (s: object) => void;
    };
    if (lyr.getBounds) map.fitBounds(lyr.getBounds(), { padding: [40, 40], maxZoom: 11 });
    lyr.openPopup?.();
  }, [selected]);

  const filtered = useMemo(() => {
    if (!stats) return [];
    return stats.sorted.filter((d) => {
      const matchSearch = d.district.toLowerCase().includes(search.toLowerCase());
      const matchRisk = riskFilter === "all" || riskOf(d.cases, maxCases).key === riskFilter;
      return matchSearch && matchRisk;
    });
  }, [stats, search, riskFilter, maxCases]);

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result)) as FC;
        // Reset map
        mapRef.current?.remove();
        mapRef.current = null;
        layersRef.current.clear();
        setSelected(null);
        setData(json);
      } catch {
        alert("Ficheiro GeoJSON inválido");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Institutional header */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-900 text-slate-100">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-1.5 text-xs">
            <span>República de Moçambique · Ministério da Saúde</span>
            <span className="hidden sm:inline">Programa Nacional de Controlo da Malária</span>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-600 text-white">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                WebGIS Malária — Província de Nampula
              </h1>
              <p className="text-xs text-slate-500">
                Centro de Vigilância Epidemiológica e Análise Espacial
              </p>
            </div>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <Upload className="h-3.5 w-3.5" />
            Carregar GeoJSON
            <input type="file" accept=".geojson,application/geo+json,application/json" onChange={onUpload} className="hidden" />
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6">
        {/* KPI cards */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi
              icon={<Activity className="h-4 w-4" />}
              label="Total de casos"
              value={stats.total.toLocaleString("pt-PT")}
              tone="red"
            />
            <Kpi
              icon={<Building2 className="h-4 w-4" />}
              label="Distritos monitorados"
              value={String(stats.n)}
              tone="slate"
            />
            <Kpi
              icon={<TrendingUp className="h-4 w-4" />}
              label="Maior incidência"
              value={stats.worst.district}
              sub={`${stats.worst.cases.toLocaleString("pt-PT")} casos`}
              tone="rose"
            />
            <Kpi
              icon={<TrendingDown className="h-4 w-4" />}
              label="Menor incidência"
              value={stats.best.district}
              sub={`${stats.best.cases.toLocaleString("pt-PT")} casos`}
              tone="emerald"
            />
            <Kpi
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Média por distrito"
              value={stats.avg.toLocaleString("pt-PT")}
              tone="amber"
            />
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr_360px]">
          {/* Left filter panel */}
          <aside className="space-y-4">
            <Panel title="Filtros & Pesquisa">
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Pesquisar distrito..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white py-2 pl-8 pr-2 text-sm placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Classe de risco
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <RiskBtn active={riskFilter === "all"} onClick={() => setRiskFilter("all")} label="Todos" />
                    <RiskBtn active={riskFilter === "low"} onClick={() => setRiskFilter("low")} label="Baixo" color={RISK_COLORS.low} />
                    <RiskBtn active={riskFilter === "mid"} onClick={() => setRiskFilter("mid")} label="Moderado" color={RISK_COLORS.mid} />
                    <RiskBtn active={riskFilter === "high"} onClick={() => setRiskFilter("high")} label="Alto" color={RISK_COLORS.high} />
                    <RiskBtn active={riskFilter === "vhigh"} onClick={() => setRiskFilter("vhigh")} label="Muito alto" color={RISK_COLORS.vhigh} />
                  </div>
                </div>
              </div>
            </Panel>

            {stats && (
              <Panel title="Distribuição por risco">
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Baixo", value: stats.counts.low, color: RISK_COLORS.low },
                          { name: "Moderado", value: stats.counts.mid, color: RISK_COLORS.mid },
                          { name: "Alto", value: stats.counts.high, color: RISK_COLORS.high },
                          { name: "Muito alto", value: stats.counts.vhigh, color: RISK_COLORS.vhigh },
                        ].filter((d) => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={35}
                        outerRadius={60}
                        paddingAngle={2}
                      >
                        {[RISK_COLORS.low, RISK_COLORS.mid, RISK_COLORS.high, RISK_COLORS.vhigh].map((c) => (
                          <Cell key={c} fill={c} />
                        ))}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <RTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            )}
          </aside>

          {/* Map */}
          <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <MapPin className="h-4 w-4 text-red-600" />
                Distribuição espacial de casos por distrito
              </div>
              <span className="text-xs text-slate-500">OpenStreetMap · Coroplético</span>
            </div>
            <div ref={mapEl} className="h-[55vh] w-full lg:h-[70vh]" />
            <div className="pointer-events-none absolute bottom-4 left-4 z-[400] rounded-md border border-slate-200 bg-white/95 p-3 text-xs shadow-md">
              <div className="mb-1.5 font-semibold text-slate-700">Classe de risco</div>
              <div className="space-y-1">
                <LegendRow color={RISK_COLORS.low} label="Baixo" />
                <LegendRow color={RISK_COLORS.mid} label="Moderado" />
                <LegendRow color={RISK_COLORS.high} label="Alto" />
                <LegendRow color={RISK_COLORS.vhigh} label="Muito alto" />
              </div>
            </div>
          </section>

          {/* Right panel: top 10 chart */}
          <aside className="space-y-4">
            {stats && (
              <Panel title="Top 10 distritos por casos">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.sorted.slice(0, 10).map((d) => ({
                        name: d.district,
                        casos: d.cases,
                        fill: riskOf(d.cases, maxCases).color,
                      }))}
                      layout="vertical"
                      margin={{ top: 4, right: 10, bottom: 4, left: 0 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={95}
                        tick={{ fontSize: 10 }}
                      />
                      <RTooltip
                        formatter={(v) => Number(v).toLocaleString("pt-PT")}
                        cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      />
                      <Bar dataKey="casos" radius={[0, 3, 3, 0]}>
                        {stats.sorted.slice(0, 10).map((d) => (
                          <Cell key={d.district} fill={riskOf(d.cases, maxCases).color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            )}

            {selected && stats && (() => {
              const d = stats.sorted.find((x) => x.district === selected);
              if (!d) return null;
              const r = riskOf(d.cases, maxCases);
              const pct = ((d.cases / stats.total) * 100).toFixed(1);
              const rank = stats.sorted.findIndex((x) => x.district === selected) + 1;
              return (
                <Panel title="Distrito selecionado">
                  <div className="text-base font-semibold text-slate-900">{d.district}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <Mini label="Casos" value={d.cases.toLocaleString("pt-PT")} />
                    <Mini label="% provincial" value={`${pct}%`} />
                    <Mini label="Ranking" value={`#${rank} / ${stats.n}`} />
                    <Mini label="Risco" value={r.label} color={r.color} />
                  </div>
                </Panel>
              );
            })()}
          </aside>
        </div>

        {/* Ranking table */}
        {stats && (
          <div className="mt-4">
            <Panel title={`Ranking de distritos (${filtered.length})`}>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Distrito</th>
                      <th className="px-3 py-2 text-right">Casos</th>
                      <th className="px-3 py-2 text-right">% Total</th>
                      <th className="px-3 py-2 text-left">Risco</th>
                      <th className="px-3 py-2 text-left">Intensidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => {
                      const r = riskOf(d.cases, maxCases);
                      const pct = (d.cases / stats.total) * 100;
                      const rank = stats.sorted.findIndex((x) => x.district === d.district) + 1;
                      const isSel = selected === d.district;
                      return (
                        <tr
                          key={d.district}
                          onClick={() => setSelected(d.district)}
                          className={`cursor-pointer border-t border-slate-100 transition-colors ${
                            isSel ? "bg-red-50" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="px-3 py-2 tabular-nums text-slate-500">{rank}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{d.district}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {d.cases.toLocaleString("pt-PT")}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                            {pct.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{ background: `${r.color}22`, color: r.color }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />
                              {r.label}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="h-1.5 w-32 overflow-hidden rounded bg-slate-100">
                              <div
                                className="h-full"
                                style={{ width: `${(d.cases / maxCases) * 100}%`, background: r.color }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                          Nenhum distrito corresponde aos filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}

        <footer className="mt-6 pb-6 text-center text-xs text-slate-500">
          Desenvolvido por Nádia Carrimo & Stélio Matsinhe· Dados geográficos: geoBoundaries ADM2 · Casos: ilustrativos para fins de demonstração ·
          Plataforma WebGIS · {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}


function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "red" | "rose" | "emerald" | "amber" | "slate";
}) {
  const tones: Record<string, string> = {
    red: "bg-red-50 text-red-700 ring-red-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ring-1 ${tones[tone]}`}>
          {icon}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <div className="mt-2 truncate text-lg font-semibold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 rounded-sm border border-slate-300"
        style={{ background: color }}
      />
      <span className="text-slate-700">{label}</span>
    </div>
  );
}

function RiskBtn({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold" style={{ color: color ?? "#0f172a" }}>
        {value}
      </div>
    </div>
  );
}
