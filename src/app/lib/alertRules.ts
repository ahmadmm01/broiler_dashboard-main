import type { DataPoint, SensorMetric } from "./types";

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
    threshold: 5,
    criticalThreshold: 7,
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
      const isAbove = condition.value > condition.threshold;
      if (isAbove && !active[condition.metric]) episodes += 1;
      active[condition.metric] = isAbove;
    });
  });

  return episodes;
}
