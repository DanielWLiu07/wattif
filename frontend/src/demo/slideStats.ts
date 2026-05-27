/** External validation stats for demo slide 2 — cite sources on slide. */
export type ValidationStat = {
  value: string;
  label: string;
  detail: string;
  source: string;
  sourceUrl?: string;
  intensity: number;
  tone: "brand" | "warn" | "alert" | "info";
};

export const validationStats: ValidationStat[] = [
  {
    value: "55 mo.",
    label: "typical grid-connection timeline",
    detail:
      "The typical project built in 2024 took 55 months from interconnection request to commercial operation.",
    source: "Berkeley Lab, Queued Up 2025",
    sourceUrl: "https://energyanalysis.lbl.gov/publications/queued-2025-edition-characteristics",
    intensity: 88,
    tone: "alert",
  },
  {
    value: "13%",
    label: "of queued capacity got built",
    detail:
      "Only 13% of capacity requesting interconnection from 2000–2019 had reached operation by the end of 2024.",
    source: "Berkeley Lab, Queued Up 2025",
    sourceUrl: "https://energyanalysis.lbl.gov/publications/queued-2025-edition-characteristics",
    intensity: 13,
    tone: "warn",
  },
  {
    value: "~50%",
    label: "face 6+ month siting delays",
    detail:
      "About half of recent utility-scale wind and solar siting applications experienced delays of six months or more.",
    source: "Berkeley Lab developer survey, 2024",
    sourceUrl: "https://emp.lbl.gov/publications/survey-utility-scale-wind-and-solar",
    intensity: 50,
    tone: "brand",
  },
  {
    value: "55%",
    label: "of Toronto emissions from buildings",
    detail:
      "Buildings remain Toronto's largest emissions source, so local clean energy planning has to match demand, equity, and grid constraints.",
    source: "City of Toronto SBEI, 2023",
    sourceUrl:
      "https://www.toronto.ca/services-payments/water-environment/environmentally-friendly-city-initiatives/transformto/sector-based-emissions-inventory/",
    intensity: 55,
    tone: "info",
  },
];
