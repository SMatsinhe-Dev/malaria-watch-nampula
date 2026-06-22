import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WebGIS Malária — Nampula" },
      {
        name: "description",
        content:
          "Plataforma WebGIS para monitorização e análise espacial de casos de malária nos distritos da província de Nampula, Moçambique.",
      },
      { property: "og:title", content: "WebGIS Malária — Nampula" },
      {
        property: "og:description",
        content:
          "Vigilância epidemiológica da malária por distrito em Nampula.",
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

function riskOf(cases: number): { label: string; color: string; key: "low" | "mid" | "high" } {
  if (cases < 2000) return { label: "Baixo risco", color: "#16a34a", key: "low" };
  if (cases < 5000) return { label: "Médio risco", color: "#eab308", key: "mid" };
  return { label: "Alto risco", color: "#dc2626", key: "high" };
}

function Index() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<FC | null>(null);
  const [selected, setSelected] = useState<DistrictProps | null>(null);

  useEffect(() => {
    fetch("/nampula.geojson")
      .then((r) => r.json())
      .then(setData);
  }, []);

  useEffect(() => {
    if (!data || !mapEl.current) return;
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapEl.current) return;
      map = L.map(mapEl.current, { zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      const layer = L.geoJSON(data as GeoJSON.FeatureCollection, {
        style: (f) => {
          const cases = (f?.properties as DistrictProps).cases;
          return {
            color: "#1f2937",
            weight: 1,
            fillColor: riskOf(cases).color,
            fillOpacity: 0.7,
          };
        },
        onEachFeature: (f, lyr) => {
          const p = f.properties as DistrictProps;
          const r = riskOf(p.cases);
          lyr.bindPopup(
            `<div style="font-family:system-ui;min-width:180px">
              <div style="font-weight:600;font-size:14px;margin-bottom:4px">${p.district}</div>
              <div style="font-size:13px">Casos: <b>${p.cases.toLocaleString("pt-PT")}</b></div>
              <div style="font-size:13px;display:flex;align-items:center;gap:6px;margin-top:4px">
                <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${r.color}"></span>
                ${r.label}
              </div>
            </div>`
          );
          lyr.on("click", () => setSelected(p));
          lyr.on("mouseover", () => (lyr as import("leaflet").Path).setStyle({ weight: 2.5, color: "#000" }));
          lyr.on("mouseout", () => (lyr as import("leaflet").Path).setStyle({ weight: 1, color: "#1f2937" }));
        },
      }).addTo(map);

      map.fitBounds(layer.getBounds(), { padding: [10, 10] });
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return null;
    const items = data.features.map((f) => f.properties);
    const total = items.reduce((s, d) => s + d.cases, 0);
    const sorted = [...items].sort((a, b) => b.cases - a.cases);
    const counts = { low: 0, mid: 0, high: 0 };
    items.forEach((d) => counts[riskOf(d.cases).key]++);
    return { total, top: sorted.slice(0, 5), worst: sorted[0], counts, n: items.length };
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              WebGIS Malária — Província de Nampula
            </h1>
            <p className="text-xs text-slate-500">
              Vigilância epidemiológica e análise espacial · Moçambique
            </p>
          </div>
          <div className="hidden text-right text-xs text-slate-500 sm:block">
            Fonte de geometria: geoBoundaries (ADM2)
            <br />
            Casos: dados ilustrativos
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_340px]">
        <section className="relative overflow-hidden rounded-lg border bg-white shadow-sm">
          <div ref={mapEl} className="h-[60vh] w-full lg:h-[78vh]" />
          <div className="absolute bottom-3 left-3 z-[400] rounded-md border bg-white/95 p-3 text-xs shadow">
            <div className="mb-1 font-semibold">Classe de risco</div>
            <div className="space-y-1">
              <LegendRow color="#16a34a" label="Baixo risco (< 2 000)" />
              <LegendRow color="#eab308" label="Médio risco (2 000–4 999)" />
              <LegendRow color="#dc2626" label="Alto risco (≥ 5 000)" />
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          {stats && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat title="Total de casos" value={stats.total.toLocaleString("pt-PT")} />
                <Stat title="Distritos" value={String(stats.n)} />
              </div>

              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Distrito mais afetado
                </div>
                <div className="mt-1 text-base font-semibold">{stats.worst.district}</div>
                <div className="text-sm text-slate-600">
                  {stats.worst.cases.toLocaleString("pt-PT")} casos
                </div>
              </div>

              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                  Top 5 distritos
                </div>
                <ol className="space-y-2">
                  {stats.top.map((d, i) => {
                    const r = riskOf(d.cases);
                    const pct = (d.cases / stats.top[0].cases) * 100;
                    return (
                      <li key={d.district}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">
                            {i + 1}. {d.district}
                          </span>
                          <span className="tabular-nums text-slate-600">
                            {d.cases.toLocaleString("pt-PT")}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-100">
                          <div
                            className="h-full rounded"
                            style={{ width: `${pct}%`, background: r.color }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                  Distribuição por risco
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <RiskTile color="#16a34a" label="Baixo" n={stats.counts.low} />
                  <RiskTile color="#eab308" label="Médio" n={stats.counts.mid} />
                  <RiskTile color="#dc2626" label="Alto" n={stats.counts.high} />
                </div>
              </div>

              {selected && (
                <div className="rounded-lg border bg-white p-4 shadow-sm">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Distrito selecionado
                  </div>
                  <div className="mt-1 text-base font-semibold">{selected.district}</div>
                  <div className="text-sm text-slate-600">
                    {selected.cases.toLocaleString("pt-PT")} casos ·{" "}
                    <span style={{ color: riskOf(selected.cases).color, fontWeight: 600 }}>
                      {riskOf(selected.cases).label}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </main>
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
      <span>{label}</span>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function RiskTile({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <div className="rounded-md border p-2">
      <div className="mx-auto h-2 w-8 rounded" style={{ background: color }} />
      <div className="mt-1 text-xs text-slate-500">{label}</div>
      <div className="text-base font-semibold tabular-nums">{n}</div>
    </div>
  );
}
