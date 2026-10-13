import type { AlertEvent, DataPoint, SensorMetric, Zone } from "./types";

export type SensorAlertCondition = {
  metric: SensorMetric;
  label: string;
  value: number;
  threshold: number;
  criticalThreshold: number;
  unit: string;
  action: string;
};

export const SENSOR_ALERT_RULES: Record<
  SensorMetric,
  Omit<SensorAlertCondition, "metric" | "value">
> = {
  temp: {
    label: "Temperature",
    threshold: 32,
    criticalThreshold: 34,
    unit: "°C",
    action: "Inspect ventilation and cooling immediately.",
  },
  humidity: {
    label: "Humidity",
    threshold: 85,
    criticalThreshold: 90,
    unit: "%",
    action: "Check moisture sources, litter, and air exchange.",
  },
  co2: {
    label: "CO₂",
    threshold: 1200,
    criticalThreshold: 1500,
    unit: "ppm",
    action: "Increase fresh-air exchange and verify fan operation.",
  },
  nh3: {
    label: "NH₃",
    threshold: 10,
    criticalThreshold: 20,
    unit: "ppm",
    action: "Inspect litter moisture and ventilation performance.",
  },
  pm25: {
    label: "PM2.5",
    threshold: 35,
    criticalThreshold: 50,
    unit: "µg/m³",
    action: "Review dust, feed handling, and cleaning activities.",
  },
};

export function isSensorAtOrAboveLimit(metric: SensorMetric, value: number) {
  return Number.isFinite(value) && value >= SENSOR_ALERT_RULES[metric].threshold;
}

export function getSensorAlertConditions(point: DataPoint) {
  return (Object.keys(SENSOR_ALERT_RULES) as SensorMetric[]).map((metric) => {
    const rule = SENSOR_ALERT_RULES[metric];
    return {
      metric,
      value: point[metric],
      ...rule,
    };
  });
}

export function countSensorAlertEpisodes(data: DataPoint[]) {
  const active: Record<SensorMetric, boolean> = {
    temp: false,
    humidity: false,
    co2: false,
    nh3: false,
    pm25: false,
  };
  let episodes = 0;

  data.forEach((point) => {
    getSensorAlertConditions(point).forEach((condition) => {
      const isAbove = condition.value >= condition.threshold;
      if (isAbove && !active[condition.metric]) episodes += 1;
      active[condition.metric] = isAbove;
    });
  });

  return episodes;
}

export type SensorAlertSnapshot = {
  episodes: AlertEvent[];
  episodeCount: number;
  activeConditionCount: number;
  readingsWithIssue: number;
};

export function createSensorAlertSnapshot({
  data,
  cycleId,
  zone,
  acknowledgedIds = [],
}: {
  data: DataPoint[];
  cycleId: string;
  zone: Zone;
  acknowledgedIds?: string[];
}): SensorAlertSnapshot {
  const episodes: AlertEvent[] = [];
  const open = new Map<SensorMetric, AlertEvent>();
  const acknowledged = new Set(acknowledgedIds);
  let readingsWithIssue = 0;
  for (const point of data) {
    let hasIssue = false;
    for (const condition of getSensorAlertConditions(point)) {
      const outside = isSensorAtOrAboveLimit(condition.metric, condition.value);
      const existing = open.get(condition.metric);
      if (outside) {
        hasIssue = true;
        if (existing) {
          existing.value = Math.max(existing.value, condition.value);
          if (condition.value >= condition.criticalThreshold) existing.severity = "critical";
        } else {
          const id = `${cycleId}-${zone}-${condition.metric}-${point.ts}`;
          const episode: AlertEvent = {
            id,
            cycleId,
            zone,
            metric: condition.metric,
            label: condition.label,
            timestamp: point.time,
            value: condition.value,
            valueLabel: "Episode peak",
            threshold: condition.threshold,
            unit: condition.unit,
            severity: condition.value >= condition.criticalThreshold ? "critical" : "warning",
            status: acknowledged.has(id) ? "acknowledged" : "active",
            message: `Zone ${zone}: ${condition.label} reached its configured review limit. ${condition.action}`,
          };
          episodes.push(episode);
          open.set(condition.metric, episode);
        }
      } else if (existing) {
        existing.status = "resolved";
        open.delete(condition.metric);
      }
    }
    if (hasIssue) readingsWithIssue += 1;
  }
  return {
    episodes: episodes.reverse(),
    episodeCount: episodes.length,
    activeConditionCount: open.size,
    readingsWithIssue,
  };
}
